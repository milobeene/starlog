/**
 * 게임 폴더마다 하나 — `<게임>/.thumbs/index.json`. **쓰는 건 여기(메인)뿐이고 서버는 읽기만 한다**
 * (짝은 `server/src/common/storage/mediaIndex.ts`).
 *
 * ```json
 * { "v": 1,
 *   "dir": { "m": "<폴더 mtimeNs>", "n": <readdir 개수> },
 *   "files": { "001.jpg": { "m": "<mtimeNs>", "s": 312345, "w": 1920, "h": 1080, "p": "8x5:<RGB base64>", "t": 1 } } }
 * ```
 *
 * - `t` 1 = 이 판(`m`)의 썸네일이 있다 · 0 = 이 판은 못 만든다(깨진 파일) · 없음 = 모름
 * - `dir`은 **"이 목록이 폴더 그대로다"라는 도장**이다. 훑기(`scan`) 전후로 폴더 mtime이 같을 때만 찍는다.
 *   서버는 도장이 지금 폴더와 맞으면 파일마다 stat하지 않는다 (800장 폴더에서 stat 3200번 → 0번)
 * - ⚠️ 폴더 mtime은 **파일이 생기고·지워지고·이름이 바뀔 때만** 바뀐다. 같은 이름에 내용만 덮어쓴 건 못 본다 —
 *   세션 중엔 감시(`fs.watch`)가, 세션을 열 때는 배경 훑기가 다시 맞춘다
 * - 캐시다. 깨졌거나 모양이 틀리면 버리고 빈 것에서 시작한다
 */
const fs = require("fs");
const path = require("path");
const { THUMB_DIR, thumbDirOf } = require("./media");

const FILE = "index.json";
const FLUSH_MS = 800;
/** folder → { data, dirty, timer } */
const open = new Map();

const empty = () => ({ v: 1, dir: null, files: {} });

function valid(data) {
  return data && data.v === 1 && typeof data.files === "object" && data.files !== null && !Array.isArray(data.files)
    && (data.dir === null || (typeof data.dir?.m === "string" && Number.isInteger(data.dir?.n)));
}

function slot(folder) {
  let s = open.get(folder);
  if (s) return s;
  let data = empty();
  const td = thumbDirOf(folder);
  if (td?.exists) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(td.dir, FILE), "utf8"));
      if (valid(parsed)) data = parsed;
    } catch { /* 없거나 깨짐 — 새로 */ }
  }
  s = { data, dirty: false, timer: null };
  open.set(folder, s);
  return s;
}

function get(folder, name) {
  return slot(folder).data.files[name] ?? null;
}

/** 한 파일의 기록을 갈아끼운다. 도장(`dir`)은 그대로 — 있는 파일의 정확한 값이라 "목록 그대로"가 안 깨진다 */
function put(folder, name, entry) {
  const s = slot(folder);
  s.data.files[name] = entry;
  touch(folder, s);
}

function remove(folder, name) {
  const s = slot(folder);
  if (!(name in s.data.files)) return;
  delete s.data.files[name];
  touch(folder, s);
}

/** 훑기 결과로 통째로 — `stamp`가 null이면 훑는 사이 폴더가 바뀐 것이라 도장을 안 찍는다 */
function replace(folder, files, stamp) {
  const s = slot(folder);
  s.data = { v: 1, dir: stamp, files };
  touch(folder, s);
}

function files(folder) {
  return slot(folder).data.files;
}

function touch(folder, s) {
  s.dirty = true;
  if (!s.timer) s.timer = setTimeout(() => { s.timer = null; write(folder, s); }, FLUSH_MS);
}

/**
 * 임시 파일 + 이름 바꾸기. 윈도우는 백신·검색 색인이 막 쓴 파일을 잠깐 쥐어 rename이 EPERM·EBUSY로 실패할 수 있다 —
 * 몇 번 다시 하고, 끝내 안 되면 다음 기회에 (캐시다)
 */
function write(folder, s) {
  if (!s.dirty) return;
  const td = thumbDirOf(folder);
  if (!td) return;   // `.thumbs`가 링크·파일이다 — 따라가서 쓰지 않는다
  try {
    if (!td.exists) fs.mkdirSync(td.dir);
    const target = path.join(td.dir, FILE);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s.data), { flag: "wx" });
    s.dirty = false;
    renameRetry(tmp, target, 0);
  } catch (e) {
    console.warn("[media-index] 쓰지 못했다", folder, e?.code ?? e?.message);
  }
}

function renameRetry(tmp, target, attempt) {
  try {
    fs.renameSync(tmp, target);
  } catch (e) {
    if ((e.code === "EPERM" || e.code === "EBUSY" || e.code === "EACCES") && attempt < 5) {
      setTimeout(() => renameRetry(tmp, target, attempt + 1), 40 * (attempt + 1));
      return;
    }
    fs.rmSync(tmp, { force: true });
  }
}

/** 세션을 닫거나 앱을 끌 때 — 미뤄 둔 쓰기를 지금 */
function flushAll() {
  for (const [folder, s] of open) {
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    write(folder, s);
  }
}

/** 다른 데이터 루트로 바뀌면 들고 있던 것을 버린다 */
function forget() {
  flushAll();
  open.clear();
}

module.exports = { FILE, THUMB_DIR, get, put, remove, replace, files, flushAll, forget };
