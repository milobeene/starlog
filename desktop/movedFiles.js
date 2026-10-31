/**
 * 스팀에서 **복사해 간** 파일의 기억 — 스팀 폴더는 복사만 하고 아무것도 지우지 않으므로, 어느 사진을 이미 가져왔는지
 * STARLOG가 따로 기억해야 목록에서 흐리게 보이고 기본으로 숨길 수 있다.
 *
 * 열쇠는 `등록 폴더 id + 상대 경로 + 크기 + 수정시각(ms)` — 같은 이름으로 다른 내용이 덮이면(크기·시각이 달라지면) 새 사진으로 본다.
 * 이 PC만의 기억이라 앱 데이터에 둔다 (DB가 아니다). 깨졌거나 없으면 비어 있는 것으로 — 잃어도 중복 복사 가능성뿐이다
 */
const fs = require("fs");
const path = require("path");
const paths = require("./paths");

const file = () => path.join(paths.APP_DATA, "moved-files.json");
let cache = null;

function load() {
  if (cache) return cache;
  cache = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cache = parsed;
  } catch { /* 없거나 깨짐 — 빈 기억 */ }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file());
  } catch (e) {
    console.warn("[moved-files] 쓰지 못했다", e?.code ?? e?.message);
  }
}

const keyOf = (rel, size, mtimeMs) => `${rel}\u0000${size}\u0000${Math.floor(mtimeMs)}`;

/** @param {{rel: string, size: number, mtimeMs: number}[]} files */
function mark(sourceId, files) {
  const m = load();
  const slot = (m[sourceId] ??= {});
  for (const f of files) slot[keyOf(f.rel, f.size, f.mtimeMs)] = 1;
  save();
}

function has(sourceId, rel, size, mtimeMs) {
  return Boolean(load()[sourceId]?.[keyOf(rel, size, mtimeMs)]);
}

/** 등록을 지울 때 */
function drop(sourceId) {
  const m = load();
  if (m[sourceId]) { delete m[sourceId]; save(); }
}

/** 시험이 다른 앱 데이터로 바꿨을 때 */
function reset() { cache = null; }

module.exports = { mark, has, drop, reset };
