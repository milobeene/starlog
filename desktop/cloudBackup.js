/**
 * 클라우드 백업 (2026-10-25). `<데이터루트>/cloud-backups/<연결>/<이름>.json.gz`
 *
 * ## 왜 따로 있나
 *
 * Neon 무료 플랜은 되돌리기 기록을 6시간만 둔다. 그 밖의 사본이 이 맥에 있어야 한다.
 * 세이브파일 백업(`backup.js`)은 PGlite 폴더를 묶는 것이라 클라우드에는 쓸 수 없다 —
 * 여기는 **`/api/me/export` JSON(형식 5)을 gzip한 한 장**이다. 되살리기는 그걸 새 세이브파일에 붓는다.
 *
 * `backups/`와 폴더를 나눈 이유 — 연결 이름과 세이브 이름이 같으면 한 폴더에 섞인다.
 *
 * ## 자동과 수동은 폴더부터 다르다 (사용자 결정)
 *
 *   auto/auto-<stamp>.json.gz   클라우드로 들어가 서버가 뜨면 하루 한 번. **연결마다 10개까지**, 넘치면 오래된 것부터
 *   manual/<이름>.json.gz       사람이 [백업 뽑기]로 만든 것. 개수에 안 세고 **저절로 지우지 않는다**
 *
 * 한 폴더에 두면 "이름이 auto-로 시작하나"가 곧 지워질 자격이 된다 — 사람이 그런 이름을 쓰는 순간 사라진다.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { promisify } = require("util");
const names = require("./saveName");
const { stamp } = require("./backup");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DIR = "cloud-backups";
const EXT = ".json.gz";
const PARTIAL = ".partial";
const AUTO_PREFIX = "auto-";
const KINDS = ["auto", "manual"];
const KEEP_AUTO = 10;
/** 풀 때의 상한 — 내 폴더의 파일이지만 깨지거나 바뀐 파일 하나가 메인 메모리를 다 먹으면 안 된다 */
const MAX_JSON_BYTES = 512 * 1024 * 1024;

function rootOf(dirs) {
  return path.join(dirs.root, DIR);
}

/**
 * 연결 이름 → 폴더 이름. 연결 이름은 아무 글자나 100자까지라 그대로 쓰면 경로가 된다.
 * 규칙 안의 이름은 그대로(탐색기에서 알아보게), 다듬어야 했던 이름은 해시를 붙인다 —
 * `a/b`와 `a-b`가 같은 폴더로 모이면 남의 백업을 돌려 지운다
 */
function folderName(connectionName) {
  const raw = String(connectionName ?? "");
  if (names.isValid(raw)) return raw;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 8);
  return names.fit(raw, `-${hash}`);
}

function assertKind(kind) {
  if (!KINDS.includes(kind)) throw new Error("알 수 없는 백업 종류입니다");
  return kind;
}

/** `<연결>/auto` 또는 `<연결>/manual` */
function folderOf(dirs, connectionName, kind) {
  return path.join(rootOf(dirs), folderName(connectionName), assertKind(kind));
}

/** 데이터가 든 폴더라 나만 읽게 (로그·자격증명 파일과 같은 기준) */
function ensureFolder(dirs, connectionName, kind) {
  const folder = folderOf(dirs, connectionName, kind);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const dir of [path.dirname(folder), folder]) {
    try { fs.chmodSync(dir, 0o700); } catch { /* 윈도우는 의미가 없다 */ }
  }
  return folder;
}

/**
 * 화면(IPC)에서 오는 파일 이름 — 폴더 안의 이름 하나, `.json.gz`, 규칙 안의 이름만.
 * 자동 폴더에는 `auto-<stamp>`만 산다 — 다른 이름이 끼면 10개 규칙이 그걸 세고 지운다
 */
function assertFileName(kind, fileName) {
  assertKind(kind);
  if (typeof fileName !== "string" || !fileName.endsWith(EXT) || fileName !== path.basename(fileName)
    || /[\\/\0]/.test(fileName) || !names.isValid(fileName.slice(0, -EXT.length))
    || (kind === "auto" && !fileName.startsWith(AUTO_PREFIX))) {
    throw new Error("백업 파일 이름이 올바르지 않습니다");
  }
  return fileName;
}

function listKind(dirs, connectionName, kind) {
  const folder = folderOf(dirs, connectionName, kind);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter((f) => f.endsWith(EXT) && names.isValid(f.slice(0, -EXT.length)) && (kind !== "auto" || f.startsWith(AUTO_PREFIX)))
    .map((f) => {
      const stat = fs.statSync(path.join(folder, f));
      return {
        kind,
        fileName: f,
        label: f.slice(0, -EXT.length),
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    });
}

/** 두 폴더를 한 목록으로 (최신이 앞). 폴더 경로는 [폴더 열기]용 — 없으면 null */
function list(dirs, connectionName) {
  const auto = listKind(dirs, connectionName, "auto");
  const manual = listKind(dirs, connectionName, "manual");
  const there = (kind) => {
    const f = folderOf(dirs, connectionName, kind);
    return fs.existsSync(f) ? f : null;
  };
  return {
    items: [...auto, ...manual].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    folders: { auto: there("auto"), manual: there("manual") },
    autoCount: auto.length,
    keepAuto: KEEP_AUTO,
  };
}

/** 추천 이름 — `<연결> 2026-10-25 18.10`. 수동 폴더에 이미 있으면 `-2`… (괄호는 이름 규칙에 없다) */
function suggestName(dirs, connectionName, at = new Date()) {
  const s = stamp(at);
  const base = `${connectionName} ${s.slice(0, 10)} ${s.slice(11, 13)}.${s.slice(13, 15)}`;
  const folder = folderOf(dirs, connectionName, "manual");
  const taken = (n) => fs.existsSync(path.join(folder, `${n}${EXT}`)) || fs.existsSync(path.join(folder, `${n}${EXT}${PARTIAL}`));
  let name = names.fit(base);
  for (let i = 2; taken(name); i += 1) name = names.fit(base, `-${i}`);
  return name;
}

/**
 * 한 장 쓴다. **`.partial`에 쓰고 fsync한 뒤 rename** — 쓰다 앱이 꺼져도 멀쩡해 보이는 반쪽 파일이 안 남는다.
 * 같은 이름이 있으면 거절한다 (수동 백업을 덮어쓰면 돌아갈 데가 사라진다)
 */
async function write(dirs, connectionName, kind, fileName, dump) {
  assertFileName(kind, fileName);
  const folder = ensureFolder(dirs, connectionName, kind);
  const target = path.join(folder, fileName);
  const tmp = `${target}${PARTIAL}`;
  if (fs.existsSync(target) || fs.existsSync(tmp)) {
    throw new Error("같은 이름의 백업이 이미 있습니다");
  }
  const body = await gzip(Buffer.from(JSON.stringify(dump), "utf8"));
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeSync(fd, body);
    fs.fsyncSync(fd);
  } catch (e) {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  fs.closeSync(fd);
  fs.renameSync(tmp, target);
  return { fileName, sizeBytes: body.length };
}

/** 오늘(앱 시계의 로컬 날짜) 자동 백업이 이미 있나 */
function hasAutoToday(dirs, connectionName, at = new Date()) {
  const day = `${AUTO_PREFIX}${stamp(at).slice(0, 10)}`;
  return listKind(dirs, connectionName, "auto").some((i) => i.fileName.startsWith(day));
}

/**
 * 자동 백업을 10개로 줄인다 — **이름(=찍은 시각) 순으로** 가장 오래된 것부터 하나씩.
 * 수정 시각으로 보면 탐색기에서 복사해 온 옛 백업이 "최신"이 되어 오늘 것을 밀어낸다
 */
function pruneAuto(dirs, connectionName) {
  const folder = folderOf(dirs, connectionName, "auto");
  const autos = listKind(dirs, connectionName, "auto").map((i) => i.fileName).sort();
  const removed = [];
  while (autos.length > KEEP_AUTO) {
    const oldest = autos.shift();
    fs.rmSync(path.join(folder, oldest), { force: true });
    removed.push(oldest);
  }
  return removed;
}

async function writeAuto(dirs, connectionName, dump, at = new Date()) {
  const made = await write(dirs, connectionName, "auto", `${AUTO_PREFIX}${stamp(at)}${EXT}`, dump);
  const removed = pruneAuto(dirs, connectionName);
  return { ...made, removed, autoCount: listKind(dirs, connectionName, "auto").length, keepAuto: KEEP_AUTO };
}

/** 되살릴 JSON. 모양만 본다 — 내용 검사는 서버의 가져오기가 한다 */
async function read(dirs, connectionName, kind, fileName) {
  assertFileName(kind, fileName);
  const file = path.join(folderOf(dirs, connectionName, kind), fileName);
  if (!fs.existsSync(file)) throw new Error("백업 파일을 찾을 수 없습니다");
  let dump;
  try {
    const raw = await gunzip(fs.readFileSync(file), { maxOutputLength: MAX_JSON_BYTES });
    dump = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("백업 파일을 읽지 못했습니다 (손상됐거나 STARLOG 백업이 아닙니다)");
  }
  if (!dump || typeof dump !== "object" || !Array.isArray(dump.entries) || !Array.isArray(dump.games)) {
    throw new Error("STARLOG 백업 파일이 아닙니다");
  }
  return dump;
}

/** 수동 백업만 지운다. 자동은 10개 규칙이 관리한다 */
function remove(dirs, connectionName, kind, fileName) {
  assertFileName(kind, fileName);
  if (kind === "auto") throw new Error("자동 백업은 직접 지우지 않습니다 — 10개를 넘으면 오래된 것부터 정리됩니다");
  fs.rmSync(path.join(folderOf(dirs, connectionName, kind), fileName), { force: true });
}

/** 연결 이름이 바뀌면 백업 폴더도 따라간다. 새 이름의 폴더가 이미 있으면 섞지 않고 둔다 */
function renameFolder(dirs, from, to) {
  const a = path.join(rootOf(dirs), folderName(from));
  const b = path.join(rootOf(dirs), folderName(to));
  if (a === b || !fs.existsSync(a) || fs.existsSync(b)) return false;
  fs.renameSync(a, b);
  return true;
}

/** 지난 실행이 쓰다 만 `.partial`을 치운다 (기동 때). 같은 실행의 쓰기는 아직 없다 */
function cleanPartials(dirs) {
  const root = rootOf(dirs);
  if (!fs.existsSync(root)) return [];
  const removed = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const kind of KINDS) {
      const folder = path.join(root, e.name, kind);
      if (!fs.existsSync(folder)) continue;
      for (const f of fs.readdirSync(folder)) {
        if (!f.endsWith(PARTIAL)) continue;
        fs.rmSync(path.join(folder, f), { force: true });
        removed.push(`${e.name}/${kind}/${f}`);
      }
    }
  }
  return removed;
}

module.exports = {
  list, suggestName, write, writeAuto, hasAutoToday, pruneAuto, read, remove, renameFolder, cleanPartials,
  assertFileName, assertKind, folderOf, EXT, KEEP_AUTO,
};
