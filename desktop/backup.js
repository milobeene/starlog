/**
 * 세이브파일 백업 (v1.0 9단계 → v2, architecture §5).
 *
 * ## DB가 닫혀 있는 순간에 일렉트론이 한다
 *
 * 쓰는 중인 DB 폴더를 그대로 묶으면 찢어진 백업이 된다. 우리 구조에는 닫혀 있는 순간이
 * 분명히 있다 — 백엔드를 띄우기 **전**, 즉 입구 화면이다. 거기서 묶으면 파일 복사로 충분하다.
 * 그래서 백업은 전부 일렉트론이 하고, 백엔드는 백업 폴더에 손을 안 댄다.
 *
 * 세이브파일은 PGlite **폴더**라 `.tar.gz` 한 장으로 묶는다 (`tarball.js`).
 * 실데이터 기준 폴더 41MB → 묶음 5MB. 자바 시절의 `.mv.db` 백업은 목록에 안 나온다 (새 앱이 열 수 없다).
 *
 * ## 클라우드 모드에는 백업이 없다
 *
 * 복사할 파일이 아예 없다 — 데이터가 남의 서버에 있다.
 * 클라우드 쪽 대응물은 "로컬 세이브파일로 뽑기"(§6)이고, 그건 백업이 아니라 **생성**이다.
 */
const fs = require("fs");
const path = require("path");
const names = require("./saveName");
const saveFiles = require("./saveFiles");
const tarball = require("./tarball");

const KEEP_COUNT = 30;
const KEEP_BYTES = 100 * 1024 * 1024;   // 100MB
const EXT = ".tar.gz";
/** 마지막 백업이 묶은 내용의 지문 — 자동 백업이 "바뀌었나"를 이걸로 본다 (목록은 `.tar.gz`만 보므로 안 섞인다) */
const FINGERPRINT = ".fingerprint.json";

function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** 화면(IPC)에서 오는 값이라 믿지 않는다 — 문자열이고, 이름 하나이고, `.tar.gz`인 것만 */
function assertBackupFileName(fileName) {
  if (typeof fileName !== "string" || !fileName.endsWith(EXT) || fileName.length > 200
    || fileName !== path.basename(fileName) || fileName.includes("\\") || fileName.includes("\0") || fileName.startsWith(".")) {
    throw new Error("백업 파일 이름이 올바르지 않습니다");
  }
}

function folderOf(dirs, saveName) {
  return path.join(dirs.backups, saveName);
}

function list(dirs, saveName) {
  const folder = folderOf(dirs, saveName);
  if (!fs.existsSync(folder)) {
    return [];
  }
  return fs.readdirSync(folder)
    .filter((f) => f.endsWith(EXT))
    .map((f) => {
      const stat = fs.statSync(path.join(folder, f));
      return {
        fileName: f,
        label: f.slice(0, -EXT.length),
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function usage(dirs, saveName) {
  const items = list(dirs, saveName);
  return {
    items,
    count: items.length,
    totalBytes: items.reduce((sum, b) => sum + b.sizeBytes, 0),
    keepCount: KEEP_COUNT,
    keepBytes: KEEP_BYTES,
  };
}

function create(dirs, saveName, at = new Date()) {
  if (!saveFiles.exists(dirs, saveName)) {
    throw new Error(`세이브파일이 없습니다: ${saveName}`);
  }
  const source = saveFiles.dirOf(dirs, saveName);
  const folder = folderOf(dirs, saveName);
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, `${stamp(at)}${EXT}`);
  /* 묶는 사이에 누가 썼으면 찢어진 백업이다 — 앞뒤로 가장 늦은 수정 시각을 비교한다 */
  const before = tarball.latestMtime(source);
  const print = fingerprint(source);
  tarball.pack(source, target);
  if (tarball.latestMtime(source) !== before) {
    fs.rmSync(target, { force: true });
    throw new Error(
      "백업하지 못했습니다 — 이 세이브파일을 다른 곳에서 쓰고 있습니다. "
      + "STARLOG가 두 번 떠 있지 않은지 확인해 주세요.");
  }
  fs.utimesSync(target, at, at);
  try {
    fs.writeFileSync(path.join(folder, FINGERPRINT), JSON.stringify({ fileName: path.basename(target), fingerprint: print }));
  } catch { /* 지문을 못 남기면 다음 기동에 한 번 더 뜰 뿐이다 */ }
  // **만든 직후에 정리한다.** 개수가 늘어나는 순간이 여기뿐이라 다른 곳에서 볼 이유가 없다
  const removed = prune(dirs, saveName);
  return { fileName: path.basename(target), removed };
}

/**
 * 내용의 지문 — **표 데이터 파일만** 본다 (`base/`·`global/`의 크기·수정 시각).
 *
 * ⚠️ 폴더 전체의 최신 수정 시각은 못 쓴다. PGlite는 **열고 닫기만 해도** WAL·`pg_control`·
 * `pg_internal.init`·`pg_xact` 등을 다시 쓴다 (실측 2026-10-25). 그걸로 보면 "바뀌었을 때만"이
 * 늘 참이라 아무것도 안 고쳐도 기동 30번에 한도가 차서 몇 주 전의 백업이 밀려났다.
 * 표에 쓴 것은 닫을 때 체크포인트가 `base/`에 내려 쓰므로 여기에 드러난다.
 * (읽기만 한 뒤에도 힌트 비트 때문에 한 번은 바뀔 수 있다 — 쓴 다음 한 번 더 뜨는 정도다)
 */
const VOLATILE = new Set(["pg_internal.init", "pg_control", "pg_filenode.map.tmp"]);

function fingerprint(dir) {
  const parts = [];
  const walk = (rel) => {
    const full = path.join(dir, rel);
    if (!fs.existsSync(full)) return;
    for (const e of fs.readdirSync(full, { withFileTypes: true })) {
      const child = path.join(rel, e.name);
      if (e.isDirectory()) walk(child);
      else if (!VOLATILE.has(e.name)) {
        const st = fs.statSync(path.join(dir, child));
        parts.push(`${child.split(path.sep).join("/")}:${st.size}:${Math.floor(st.mtimeMs)}`);
      }
    }
  };
  walk("base");
  walk("global");
  return require("crypto").createHash("sha256").update(parts.sort().join("\n")).digest("hex");
}

function readFingerprint(dirs, saveName) {
  try {
    return JSON.parse(fs.readFileSync(path.join(folderOf(dirs, saveName), FINGERPRINT), "utf8"));
  } catch {
    return null;
  }
}

/** 열 때 자동 백업 — **마지막 백업 뒤로 내용이 바뀐 게 있을 때만** */
function autoBackup(dirs, saveName) {
  if (!saveFiles.exists(dirs, saveName)) {
    return null;   // 새로 만드는 세이브파일이다. 백업할 내용이 아직 없다
  }
  const latest = list(dirs, saveName)[0];
  if (latest) {
    const saved = readFingerprint(dirs, saveName);
    // 지문이 가리키는 백업이 지금 가장 최신일 때만 믿는다 — 최신을 지웠으면 지문은 남의 것이다
    if (saved && saved.fileName === latest.fileName
      && saved.fingerprint === fingerprint(saveFiles.dirOf(dirs, saveName))) {
      return null;
    }
  }
  return create(dirs, saveName);
}

function prune(dirs, saveName) {
  const folder = folderOf(dirs, saveName);
  const items = list(dirs, saveName);   // 최신이 앞
  const removed = [];
  let bytes = 0;
  items.forEach((item, index) => {
    bytes += item.sizeBytes;
    const overCount = index + 1 > KEEP_COUNT;
    const overBytes = bytes > KEEP_BYTES;
    if (index > 0 && (overCount || overBytes)) {
      fs.rmSync(path.join(folder, item.fileName), { force: true });
      removed.push(item.fileName);
    }
  });
  return removed;
}

/** 백업을 **새 세이브파일로** 되살린다. 원본을 덮지 않는다 */
function restore(dirs, saveName, fileName) {
  assertBackupFileName(fileName);
  const source = path.join(folderOf(dirs, saveName), fileName);
  if (!fs.existsSync(source)) {
    throw new Error("백업 파일을 찾을 수 없습니다");
  }
  const base = `${saveName} ${path.basename(fileName, EXT)}`;
  let name = names.fit(base);
  for (let i = 2; saveFiles.taken(dirs, name); i += 1) {
    name = names.fit(base, `-${i}`);
  }
  tarball.unpack(source, saveFiles.dirOf(dirs, name));
  return name;
}

function remove(dirs, saveName, fileName) {
  assertBackupFileName(fileName);
  fs.rmSync(path.join(folderOf(dirs, saveName), fileName), { force: true });
}

function removeAll(dirs, saveName) {
  fs.rmSync(folderOf(dirs, saveName), { recursive: true, force: true });
}

module.exports = { list, usage, create, autoBackup, restore, remove, removeAll, fingerprint, stamp, KEEP_COUNT, KEEP_BYTES };
