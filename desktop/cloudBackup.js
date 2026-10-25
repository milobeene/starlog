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
 *
 * ## 폴더 = 연결 이름이라 생기는 일 (리뷰 2026-10-25)
 *
 *   .staging/                    받는 중인 파일. **어느 연결 폴더에도 안 쓴다** — 받는 사이 이름이 바뀌어도
 *                                옛 이름 폴더가 다시 생기지 않는다. 다 받은 뒤 그 순간의 이름 폴더로 옮긴다(동기)
 *   .removed-<연결>-<stamp>/     지운 연결의 백업. 같은 이름으로 새 연결을 만들면 남의 DB 백업을 물려받으므로
 *                                치우되 지우지는 않는다 (탐색기로 꺼낼 수 있다)
 *
 * 점으로 시작하는 폴더는 연결 이름이 될 수 없다(`saveName.isValid`) — 목록·정리가 섞일 일이 없다
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { promisify } = require("util");
const names = require("./saveName");
const { stamp } = require("./backup");

const gunzip = promisify(zlib.gunzip);

const DIR = "cloud-backups";
const STAGING = ".staging";
const REMOVED_PREFIX = ".removed-";
const EXT = ".json.gz";
const PARTIAL = ".partial";
const AUTO_PREFIX = "auto-";
const KINDS = ["auto", "manual"];
const KEEP_AUTO = 10;
/**
 * 풀 때의 상한 — 내 폴더의 파일이지만 깨지거나 바뀐 파일 하나가 메인 메모리를 다 먹으면 안 된다.
 * ⚠️ 서버 `/api/me/import` 본문 상한(`server/src/http/guard.ts`)을 넘으면 안 된다 — 넘는 파일은 풀다가 413이다
 */
const MAX_JSON_BYTES = 256 * 1024 * 1024;

function rootOf(dirs) {
  return path.join(dirs.root, DIR);
}

function shortHash(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 8);
}

/**
 * 연결 이름 → 폴더 이름. 연결 이름은 아무 글자나 100자까지라 그대로 쓰면 경로가 된다.
 * 규칙 안의 이름은 그대로(탐색기에서 알아보게), 다듬어야 했던 이름은 해시를 붙인다 —
 * `a/b`와 `a-b`가 같은 폴더로 모이면 남의 백업을 돌려 지운다.
 *
 * `others`는 다른 연결 이름들. 이제는 대소문자만 다른 이름을 못 만들지만 **예전에 만든 쌍**은 남아 있을 수 있다 —
 * 그 쌍은 디스크에서 한 폴더라, 둘 다 정확한 이름의 해시를 붙여 갈라 놓는다
 */
function folderName(connectionName, others = []) {
  const raw = String(connectionName ?? "");
  const key = names.nameKey(raw);
  const clash = others.some((n) => n !== raw && names.nameKey(n) === key);
  if (names.isValid(raw) && !clash) return raw;
  return names.fit(raw, `-${shortHash(raw)}`);
}

/** `owner` — 연결 이름(문자열) 또는 `{ name, others }` */
function ownerName(owner) {
  return typeof owner === "string" ? owner : String(owner?.name ?? "");
}

function ownerFolder(owner) {
  return typeof owner === "string" ? folderName(owner) : folderName(owner?.name, owner?.others ?? []);
}

function assertKind(kind) {
  if (!KINDS.includes(kind)) throw new Error("알 수 없는 백업 종류입니다");
  return kind;
}

/** `<연결>/auto` 또는 `<연결>/manual` */
function folderOf(dirs, owner, kind) {
  return path.join(rootOf(dirs), ownerFolder(owner), assertKind(kind));
}

/** 데이터가 든 폴더라 나만 읽게 (로그·자격증명 파일과 같은 기준) */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* 윈도우는 의미가 없다 */ }
}

function ensureFolder(dirs, owner, kind) {
  const folder = folderOf(dirs, owner, kind);
  ensureDir(rootOf(dirs));
  ensureDir(path.dirname(folder));
  ensureDir(folder);
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

function listKind(dirs, owner, kind) {
  const folder = folderOf(dirs, owner, kind);
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
function list(dirs, owner) {
  const auto = listKind(dirs, owner, "auto");
  const manual = listKind(dirs, owner, "manual");
  const there = (kind) => {
    const f = folderOf(dirs, owner, kind);
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
function suggestName(dirs, owner, at = new Date()) {
  const s = stamp(at);
  const base = `${ownerName(owner)} ${s.slice(0, 10)} ${s.slice(11, 13)}.${s.slice(13, 15)}`;
  const folder = folderOf(dirs, owner, "manual");
  const taken = (n) => fs.existsSync(path.join(folder, `${n}${EXT}`)) || fs.existsSync(path.join(folder, `${n}${EXT}${PARTIAL}`));
  let name = names.fit(base);
  for (let i = 2; taken(name); i += 1) name = names.fit(base, `-${i}`);
  return name;
}

/** 받기 전에 먼저 거절한다 — 다 받은 뒤에 "이미 있다"면 그동안 기다린 게 헛일이다. 마지막 판정은 `commit` */
function assertFree(dirs, owner, kind, fileName) {
  assertFileName(kind, fileName);
  if (fs.existsSync(path.join(folderOf(dirs, owner, kind), fileName))) {
    throw new Error("같은 이름의 백업이 이미 있습니다");
  }
}

/** 받을 자리 (`.staging/<무작위>.partial`) */
function stage(dirs) {
  const dir = path.join(rootOf(dirs), STAGING);
  ensureDir(rootOf(dirs));
  ensureDir(dir);
  return path.join(dir, `${crypto.randomBytes(8).toString("hex")}${EXT}${PARTIAL}`);
}

function discard(tmp) {
  try { fs.rmSync(tmp, { force: true }); } catch { /* 다음 기동 정리가 치운다 */ }
}

/**
 * 내보내기 응답을 **가볍게** 본다 — 통째로 파싱하면 DB 커버(base64)째 메인 스레드에 올라간다.
 * 머리는 `{"formatVersion":숫자`(서버가 그 순서로 낸다), 꼬리는 `}`. 끊긴 응답·엉뚱한 페이지를 거른다.
 * 내용 검사는 되살릴 때(`read` + 서버의 가져오기)가 한다
 */
function exportCheck() {
  let head = Buffer.alloc(0);
  let headOk = false;
  let last = -1;
  const checkHead = () => {
    if (!/^\s*\{\s*"formatVersion"\s*:\s*\d/.test(head.toString("latin1"))) {
      throw new Error("내보내기 응답이 STARLOG 백업 모양이 아닙니다");
    }
    headOk = true;
  };
  return new Transform({
    transform(chunk, _enc, cb) {
      try {
        if (!headOk) {
          head = Buffer.concat([head, chunk]).subarray(0, 64);
          if (head.length >= 32) checkHead();
        }
        for (let i = chunk.length - 1; i >= 0; i -= 1) {
          const b = chunk[i];
          if (b !== 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09) { last = b; break; }
        }
        cb(null, chunk);
      } catch (e) {
        cb(e);
      }
    },
    flush(cb) {
      try {
        if (!headOk) checkHead();
        if (last !== 0x7d) throw new Error("내보내기가 중간에 끊겼습니다");
        cb();
      } catch (e) {
        cb(e);
      }
    },
  });
}

/**
 * 읽을거리를 gzip으로 `tmp`에 흘려 쓴다 (0600, fsync). 실패하면 `tmp`를 치우고 던진다.
 * 메모리에 한 번에 올리지 않는다 — 수십 MB 내보내기에서 메인 프로세스가 멈췄다
 */
async function gzipInto(tmp, source) {
  const fd = fs.openSync(tmp, "wx", 0o600);
  let closed = false;
  try {
    const out = fs.createWriteStream(null, { fd, autoClose: false });
    await pipeline(source, exportCheck(), zlib.createGzip(), out);
    fs.fsyncSync(fd);
    const { size } = fs.fstatSync(fd);
    fs.closeSync(fd);
    closed = true;
    return { sizeBytes: size };
  } catch (e) {
    if (!closed) { try { fs.closeSync(fd); } catch { /* 이미 닫혔다 */ } }
    discard(tmp);
    throw e;
  }
}

/**
 * 받은 파일을 **그 순간의** 연결 폴더로 옮긴다. 전부 동기라 이름 바꾸기(`renameFolder`)와 끼어들 틈이 없다.
 * 같은 이름이 있으면 거절한다 (수동 백업을 덮어쓰면 돌아갈 데가 사라진다)
 */
function commit(dirs, owner, kind, fileName, tmp) {
  assertFileName(kind, fileName);
  const folder = ensureFolder(dirs, owner, kind);
  const target = path.join(folder, fileName);
  if (fs.existsSync(target)) {
    discard(tmp);
    throw new Error("같은 이름의 백업이 이미 있습니다");
  }
  fs.renameSync(tmp, target);
  const made = { fileName, sizeBytes: fs.statSync(target).size };
  if (kind !== "auto") return made;
  const removed = pruneAuto(dirs, owner);
  return { ...made, removed, autoCount: listKind(dirs, owner, "auto").length, keepAuto: KEEP_AUTO };
}

/** 한 장 쓴다 — 이미 손에 든 JSON (되살리기 시험·도구용) */
async function write(dirs, owner, kind, fileName, dump) {
  assertFree(dirs, owner, kind, fileName);
  const tmp = stage(dirs);
  await gzipInto(tmp, Readable.from([Buffer.from(JSON.stringify(dump), "utf8")]));
  return commit(dirs, owner, kind, fileName, tmp);
}

function autoFileName(at = new Date()) {
  return `${AUTO_PREFIX}${stamp(at)}${EXT}`;
}

async function writeAuto(dirs, owner, dump, at = new Date()) {
  return write(dirs, owner, "auto", autoFileName(at), dump);
}

/** 오늘(앱 시계의 로컬 날짜) 자동 백업이 이미 있나 */
function hasAutoToday(dirs, owner, at = new Date()) {
  const day = `${AUTO_PREFIX}${stamp(at).slice(0, 10)}`;
  return listKind(dirs, owner, "auto").some((i) => i.fileName.startsWith(day));
}

/**
 * 자동 백업을 10개로 줄인다 — **이름(=찍은 시각) 순으로** 가장 오래된 것부터 하나씩.
 * 수정 시각으로 보면 탐색기에서 복사해 온 옛 백업이 "최신"이 되어 오늘 것을 밀어낸다
 */
function pruneAuto(dirs, owner) {
  const folder = folderOf(dirs, owner, "auto");
  const autos = listKind(dirs, owner, "auto").map((i) => i.fileName).sort();
  const removed = [];
  while (autos.length > KEEP_AUTO) {
    const oldest = autos.shift();
    fs.rmSync(path.join(folder, oldest), { force: true });
    removed.push(oldest);
  }
  return removed;
}

/** 되살릴 JSON. 모양만 본다 — 내용 검사는 서버의 가져오기가 한다 */
async function read(dirs, owner, kind, fileName) {
  assertFileName(kind, fileName);
  const file = path.join(folderOf(dirs, owner, kind), fileName);
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
function remove(dirs, owner, kind, fileName) {
  assertFileName(kind, fileName);
  if (kind === "auto") throw new Error("자동 백업은 직접 지우지 않습니다 — 10개를 넘으면 오래된 것부터 정리됩니다");
  fs.rmSync(path.join(folderOf(dirs, owner, kind), fileName), { force: true });
}

/** 같은 폴더인가 — 대소문자만 다른 두 경로가 맥에서는 한 폴더다 */
function sameDir(a, b) {
  try {
    const x = fs.statSync(a);
    const y = fs.statSync(b);
    return x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}

/** 폴더를 `.removed-<이름>-<stamp>`로 비켜 둔다. 지우지 않는다 — 탐색기에서 꺼낼 수 있다 */
function moveAside(dirs, folder) {
  const root = rootOf(dirs);
  const from = path.join(root, folder);
  if (!fs.existsSync(from)) return null;
  const base = `${REMOVED_PREFIX}${folder}-${stamp(new Date())}`;
  let name = base;
  for (let i = 2; fs.existsSync(path.join(root, name)); i += 1) name = `${base}-${i}`;
  fs.renameSync(from, path.join(root, name));
  return name;
}

/** 폴더 이름 하나를 다른 이름으로. 대소문자만 바뀌면 한 번 비켜 갔다 온다 (같은 폴더라 바로는 안 바뀌는 FS가 있다) */
function moveFolder(dirs, fromFolder, toFolder) {
  const root = rootOf(dirs);
  const a = path.join(root, fromFolder);
  const b = path.join(root, toFolder);
  if (a === b || !fs.existsSync(a)) return { moved: false, aside: null };
  if (fs.existsSync(b) && sameDir(a, b)) {
    const tmp = path.join(root, `${STAGING}-rename-${crypto.randomBytes(4).toString("hex")}`);
    fs.renameSync(a, tmp);
    fs.renameSync(tmp, b);
    return { moved: true, aside: null };
  }
  const aside = fs.existsSync(b) ? moveAside(dirs, toFolder) : null;
  fs.renameSync(a, b);
  return { moved: true, aside };
}

/**
 * 연결 이름이 바뀌면 백업 폴더도 따라간다. `others` — 바뀐 뒤의 **나머지** 연결 이름들(옛·새 이름 빼고).
 *
 * 새 이름 폴더가 이미 있으면(지운 연결의 남은 것, 예전 실행의 찌꺼기) **그쪽을 비켜 두고** 옮긴다.
 * 거절하면 이름은 바뀌었는데 백업은 옛 폴더에 남아 목록에서 사라지고, 그냥 두면 남의 백업을 물려받는다
 */
function renameFolder(dirs, from, to, others = []) {
  const a = folderName(from, others);
  const b = folderName(to, others);
  if (a === b) return { moved: false, aside: null };
  if (!fs.existsSync(path.join(rootOf(dirs), a))) {
    // 옮길 게 없어도 새 이름 자리의 남의 백업은 치운다
    return { moved: false, aside: moveAside(dirs, b) };
  }
  return moveFolder(dirs, a, b);
}

/**
 * 연결을 지웠다 — 그 백업 폴더를 비켜 둔다. `others` — 지운 뒤 남은 연결 이름들.
 * 예전에 만든 대소문자 쌍의 한쪽이었으면 남은 쪽의 폴더 이름이 해시 없는 이름으로 돌아가므로 같이 옮긴다
 */
function retire(dirs, name, others = []) {
  const aside = moveAside(dirs, folderName(name, others));
  const key = names.nameKey(name);
  for (const n of others) {
    if (names.nameKey(n) !== key || n === name) continue;
    const rest = others.filter((o) => o !== n);
    try { moveFolder(dirs, folderName(n, [...rest, name]), folderName(n, rest)); } catch { /* 못 옮겨도 다음 이름 바꾸기가 다시 본다 */ }
  }
  return aside;
}

/** 새 연결을 만들었다 — 그 이름 자리에 주인 없는 폴더가 있으면(앱 밖에서 생겼거나 옛 실행의 것) 물려받지 않게 */
function claim(dirs, name, others = []) {
  return moveAside(dirs, folderName(name, others));
}

/** 지난 실행이 쓰다 만 `.partial`을 치운다 (기동 때). 같은 실행의 쓰기는 아직 없다 */
function cleanPartials(dirs) {
  const root = rootOf(dirs);
  if (!fs.existsSync(root)) return [];
  const removed = [];
  const staging = path.join(root, STAGING);
  if (fs.existsSync(staging)) {
    for (const f of fs.readdirSync(staging)) {
      fs.rmSync(path.join(staging, f), { force: true, recursive: true });
      removed.push(`${STAGING}/${f}`);
    }
  }
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    // 점 폴더는 연결이 아니다 (받는 중·비켜 둔 것)
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
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
  list, suggestName, assertFree, stage, gzipInto, commit, discard, write, writeAuto, autoFileName,
  hasAutoToday, pruneAuto, read, remove, renameFolder, retire, claim, cleanPartials,
  assertFileName, assertKind, folderOf, folderName, rootOf, EXT, KEEP_AUTO,
};
