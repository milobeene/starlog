/**
 * 등록한 외부 스크린샷 폴더 (스팀·ShareX·런처 폴더 …) — **보기와 STARLOG로 옮기기** (2.2).
 *
 * ## 경로는 화면이 못 정한다
 *
 * 폴더는 **네이티브 폴더 고르기**(`main.js`의 `sources:add`)로만 들어온다. 화면은 이름·종류만 보내고, 이 파일은
 * 고른 경로를 `realpath`로 굳혀 `settings.json`(이 PC만 — DB에 안 둔다)에 적는다. 읽을 때마다 다시 본다:
 * 있는 폴더인가, 폴더인가, 실제 경로가 뭔가. 폴더가 사라진 등록은 목록에 `ok: false`로 남아 지울 수 있다.
 * 그 뒤로 화면이 가리키는 파일은 **`(sourceId, 상대 경로)`뿐**이다 — 상대 경로는 아래 `resolveFile`이 다시 검사한다.
 *
 * ## 종류
 *
 * - `steam`: 스팀 설치 폴더 · `userdata/<id>` · `760/remote` 어느 것을 골라도 `.../760/remote/<appid>/screenshots/*`를 찾는다
 *   (사용자 id 여럿 합침). `screenshots/thumbnails/`는 스팀이 만든 작은 그림이라 뺀다. 이름은 `appmanifest_<appid>.acf`에서
 * - `folder`: 하위 폴더까지(깊이 4) 훑고, 하위 폴더별로 묶는다
 */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const store = require("./settings");
const media = require("./media");

const NAME_MAX = 40;
const MAX_SOURCES = 12;
const MAX_DEPTH = 4;
const MAX_FILES_DEFAULT = 100_000;
/** 시험이 작은 한도를 넣을 수 있게 환경변수로 (STARLOG_SOURCES_MAX_FILES) */
const maxFiles = () => { const n = Number(process.env.STARLOG_SOURCES_MAX_FILES); return Number.isSafeInteger(n) && n > 0 ? n : MAX_FILES_DEFAULT; };
/** 주소 한 줄이 감당하는 상대 경로 조각 수 — 스팀 설치 폴더에서 `userdata/<id>/760/remote/<appid>/screenshots/<파일>`이 7 */
const MAX_SEGMENTS = 12;
const KINDS = ["steam", "folder"];
const ID_RE = /^[0-9a-f]{12}$/;
const WIN = process.platform === "win32";
/** 스팀 비스팀 바로가기(shortcut)의 appid는 상위 비트가 켜진 큰 수다 */
const NON_STEAM_FROM = 2147483648n;

const isNumeric = (s) => /^\d+$/.test(s);
const lower = (p) => (WIN ? p.toLowerCase() : p);

// ───────────── 등록부 ─────────────

let cache = null;

/** 디스크에서 읽은 것을 모양만 맞춰 든다 — 우리 말고 쓰는 곳이 없으니 쓰는 쪽이 캐시를 비운다 */
function raw() {
  if (cache) return cache;
  const list = store.getSettings().sourceFolders;
  cache = (Array.isArray(list) ? list : []).filter((r) =>
    r && typeof r === "object" && ID_RE.test(r.id) && KINDS.includes(r.kind) && typeof r.name === "string" && typeof r.path === "string")
    .map((r) => ({ id: r.id, kind: r.kind, name: r.name, path: r.path }));
  cache = steamLast(cache);
  return cache;
}

/** 스팀은 늘 일반 폴더 뒤 — 각 묶음 안의 순서는 그대로(안정 분할). 손으로 고친 settings.json도 여기서 바로잡힌다 */
function steamLast(list) {
  return [...list.filter((r) => r.kind !== "steam"), ...list.filter((r) => r.kind === "steam")];
}

function save(list) {
  cache = null;
  store.patchSettings({ sourceFolders: list });
}

/** 등록 하나를 지금 상태로 — 폴더가 있어야 `root`(실제 경로)가 있다 */
function inspect(rec) {
  try {
    const root = media.realpath(rec.path);
    if (!fs.statSync(root).isDirectory()) return { ...rec, root: null, reason: "폴더가 아닙니다" };
    return { ...rec, root, reason: null };
  } catch {
    return { ...rec, root: null, reason: "폴더를 찾을 수 없습니다" };
  }
}

/** 화면에 주는 목록 — 경로는 사용자가 직접 고른 것이라 보여줘도 된다 */
function list() {
  return raw().map((r) => {
    const s = inspect(r);
    return { id: s.id, kind: s.kind, name: s.name, path: s.path, ok: s.root !== null, reason: s.reason };
  });
}

/** 등록된 것만. 폴더가 사라졌으면 null */
function get(id) {
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  const rec = raw().find((r) => r.id === id);
  if (!rec) return null;
  const s = inspect(rec);
  return s.root ? s : null;
}

function cleanName(name) {
  if (typeof name !== "string") throw new Error("이름이 올바르지 않습니다");
  const clean = name.trim();
  if (clean === "") throw new Error("이름을 적어 주세요");
  if (/[\u0000-\u001f\u007f]/.test(clean)) throw new Error("이름에 쓸 수 없는 글자가 있습니다");
  if ([...clean].length > NAME_MAX) throw new Error(`이름은 ${NAME_MAX}자까지입니다`);
  return clean;
}

/**
 * 폴더를 등록한다. `dir`은 **네이티브 고르기가 준 경로**다 (E2E는 이 함수를 직접 부른다).
 * 같은 폴더를 두 번 등록하면 거절 — 같은 사진이 두 탭에 뜬다
 */
function add({ kind, name, dir }) {
  if (!KINDS.includes(kind)) throw new Error("종류가 올바르지 않습니다");
  const clean = cleanName(name);
  if (typeof dir !== "string" || dir === "" || dir.includes("\0") || !path.isAbsolute(dir)) throw new Error("폴더가 올바르지 않습니다");
  let root;
  try {
    root = media.realpath(dir);
    if (!fs.statSync(root).isDirectory()) throw new Error("x");
  } catch {
    throw new Error("폴더를 열 수 없습니다");
  }
  const current = raw();
  if (current.length >= MAX_SOURCES) throw new Error(`폴더는 ${MAX_SOURCES}개까지 등록할 수 있습니다`);
  if (current.some((r) => { try { return lower(media.realpath(r.path)) === lower(root); } catch { return false; } })) {
    throw new Error("이미 등록한 폴더입니다");
  }
  if (kind === "steam" && steamRemotes(root).length === 0) {
    throw new Error("스팀 스크린샷 폴더(760/remote)를 찾지 못했습니다. 스팀 설치 폴더나 userdata 폴더를 골라 주세요");
  }
  const rec = { id: crypto.randomBytes(6).toString("hex"), kind, name: clean, path: root };
  save([...current, rec]);
  return { id: rec.id, kind, name: clean, path: root, ok: true, reason: null };
}

function rename(id, name) {
  const clean = cleanName(name);
  const current = raw();
  if (!current.some((r) => r.id === id)) throw new Error("등록된 폴더가 아닙니다");
  save(current.map((r) => (r.id === id ? { ...r, name: clean } : r)));
}

/**
 * 화면이 끌어서 정한 순서(id 배열)를 저장한다. 등록된 id를 **빠짐없이 한 번씩** 담아야 한다 — 화면이 낡은 목록으로
 * 보내 남의 등록을 지우거나 되살리는 일을 막는다. 스팀이 앞으로 와 있어도 `steamLast`가 뒤로 보낸다
 */
function reorder(ids) {
  const current = raw();
  if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== ids.length
    || !ids.every((id) => typeof id === "string" && current.some((r) => r.id === id))) {
    throw new Error("순서가 올바르지 않습니다");
  }
  save(steamLast(ids.map((id) => current.find((r) => r.id === id))));
}

function remove(id) {
  const current = raw();
  if (!current.some((r) => r.id === id)) return false;
  save(current.filter((r) => r.id !== id));
  return true;
}

// ───────────── appid → 게임 기억 ─────────────

/** 사용자가 마지막으로 이 appid의 사진을 옮긴 게임. 추천이 아니라 기억이다 — 세이브가 다르면 없는 번호일 수 있다 */
function rememberedGames() {
  const m = store.getSettings().steamGameMap;
  const out = {};
  if (m && typeof m === "object" && !Array.isArray(m)) {
    for (const [k, v] of Object.entries(m)) if (isNumeric(k) && Number.isSafeInteger(v) && v > 0) out[k] = v;
  }
  return out;
}

function rememberGame(appid, entryId) {
  if (!isNumeric(appid) || !Number.isSafeInteger(entryId) || entryId <= 0) return;
  store.patchSettings({ steamGameMap: { ...rememberedGames(), [appid]: entryId } });
}

// ───────────── 스팀 ─────────────

const isRealDir = (p) => { try { return fs.lstatSync(p).isDirectory(); } catch { return false; } };

function realSubdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.isSymbolicLink()).map((d) => d.name);
  } catch { return []; }
}

/**
 * 고른 폴더에서 `760/remote` 폴더들 — 설치 폴더 · `userdata` · `userdata/<id>` · `760/remote` 어느 것이든.
 * `ci`(윈도우 기본): 이름 대소문자를 가리지 않고, 돌려주는 경로는 **디스크에 있는 대로의 철자**로 맞춘다
 * (`USERDATA`·`Remote`가 섞여 있어도 목록·감시 경로가 한 가지로 굳게)
 */
function steamRemotes(root, ci = WIN) {
  const same = (a, b) => (ci ? a.toLowerCase() === b.toLowerCase() : a === b);
  const sameBase = (a, b) => a.toLowerCase() === b.toLowerCase();   // 고른 폴더의 이름은 예전부터 대소문자 무시
  const child = (dir, name) => {
    if (!ci) return name;
    try { return fs.readdirSync(dir).find((n) => same(n, name)) ?? name; } catch { return name; }
  };
  if (sameBase(path.basename(root), "remote") && sameBase(path.basename(path.dirname(root)), "760")) return [root];
  const direct = path.join(root, child(root, "760"));
  const directRemote = path.join(direct, child(direct, "remote"));
  if (isRealDir(directRemote)) return [directRemote];
  const userdata = sameBase(path.basename(root), "userdata") ? root : path.join(root, child(root, "userdata"));
  const out = [];
  for (const id of realSubdirs(userdata).filter(isNumeric)) {
    const p760 = path.join(userdata, id, child(path.join(userdata, id), "760"));
    const remote = path.join(p760, child(p760, "remote"));
    if (isRealDir(remote)) out.push(remote);
  }
  return out;
}

/** 스팀 설치 폴더 후보 — `steamapps`가 있는 폴더, 또는 `remote`에서 네 칸 위(`userdata/<id>/760/remote`) */
function steamRoots(root, remotes) {
  const out = new Set();
  if (isRealDir(path.join(root, "steamapps"))) out.add(root);
  for (const r of remotes) {
    const up = path.dirname(path.dirname(path.dirname(path.dirname(r))));
    if (path.basename(path.dirname(path.dirname(path.dirname(r)))).toLowerCase() === "userdata" && isRealDir(path.join(up, "steamapps"))) out.add(up);
  }
  return [...out];
}

/** `libraryfolders.vdf`의 `"path"` 줄들 — 라이브러리 폴더 여럿이 흔하다 */
function steamLibraries(steamRootList) {
  const libs = new Set(steamRootList);
  for (const r of steamRootList) {
    let text = "";
    try { text = fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8").slice(0, 256 * 1024); } catch { continue; }
    for (const m of text.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)) {
      const p = m[1].replace(/\\\\/g, "\\");
      if (path.isAbsolute(p)) libs.add(p);
    }
  }
  return [...libs];
}

/** 한 라이브러리 목록에서 appid의 이름. 매니페스트가 없으면 null */
function steamNameOf(libs, appid) {
  for (const lib of libs) {
    try {
      const text = fs.readFileSync(path.join(lib, "steamapps", `appmanifest_${appid}.acf`), "utf8").slice(0, 64 * 1024);
      const m = /"name"\s+"((?:[^"\\]|\\.)*)"/.exec(text);
      if (m && m[1].trim() !== "") return m[1].replace(/\\(["\\])/g, "$1").trim();
    } catch { /* 이 라이브러리엔 없다 */ }
  }
  return null;
}

function steamTitle(libs, appid) {
  const name = steamNameOf(libs, appid);
  if (name) return name;
  try { if (BigInt(appid) >= NON_STEAM_FROM) return `비 스팀 게임 ${appid}`; } catch { /* 숫자가 아니면 아래 */ }
  return `앱 ${appid}`;
}

// ───────────── 훑기 ─────────────

const isMediaName = (n) => media.isPlainSegment(n) && media.kindOf(n) !== null;

/** 상대 경로 → `/` 로 이은 문자열 (주소·캐시 키의 모양) */
const relOf = (root, file) => path.relative(root, file).split(path.sep).join("/");

async function statAll(files, concurrency = 32) {
  const out = new Array(files.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= files.length) return;
      try {
        const st = await fsp.lstat(files[i]);
        out[i] = st.isFile() ? { size: st.size, mtimeMs: Math.floor(st.mtimeMs) } : null;
      } catch { out[i] = null; }
    }
  }));
  return out;
}

async function readFiles(dir) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  return entries.filter((e) => e.isFile() && !e.isSymbolicLink() && isMediaName(e.name)).map((e) => path.join(dir, e.name));
}

async function scanSteam(src) {
  const remotes = steamRemotes(src.root);
  const libs = steamLibraries(steamRoots(src.root, remotes));
  /** appid → 파일 경로들 */
  const byApp = new Map();
  for (const remote of remotes) {
    for (const appid of realSubdirs(remote).filter(isNumeric)) {
      const dir = path.join(remote, appid, "screenshots");
      if (!isRealDir(dir)) continue;
      const files = await readFiles(dir);   // `thumbnails/`는 폴더라 안 걸린다
      if (files.length) byApp.set(appid, [...(byApp.get(appid) ?? []), ...files]);
    }
  }
  const groups = [];
  for (const [appid, files] of byApp) groups.push({ key: appid, title: steamTitle(libs, appid), sub: `앱 ${appid}`, files });
  return { groups, truncated: false };
}

async function scanFolder(src) {
  const byDir = new Map();
  let total = 0;
  let truncated = false;
  const limit = maxFiles();
  const walk = async (dir, depth) => {
    if (total >= limit) { truncated = true; return; }
    const files = await readFiles(dir);
    if (files.length) { byDir.set(dir, files); total += files.length; }
    if (depth >= MAX_DEPTH) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !e.isSymbolicLink() && media.isPlainSegment(e.name)) await walk(path.join(dir, e.name), depth + 1);
    }
  };
  await walk(src.root, 0);
  const groups = [...byDir].map(([dir, files]) => {
    const rel = relOf(src.root, dir);
    return { key: rel, title: rel === "" ? "(폴더 바로 아래)" : rel, sub: null, files };
  });
  return { groups, truncated };
}

/**
 * 한 등록을 훑어 묶음 목록으로. 파일마다 `lstat` 한 번 (크기·수정시각 — 주소의 `?v=`와 정렬)
 * `truncated`: 파일이 너무 많아 훑기를 중간에 멈췄다 — 목록이 전부가 아니므로 호출한 쪽은 캐시를 치우면 안 된다
 * @returns {Promise<{ truncated: boolean, groups: {key, title, sub, items: {rel, name, kind, size, mtimeMs}[]}[] }>}
 */
async function scan(id) {
  const src = get(id);
  if (!src) throw new Error("등록된 폴더가 아니거나 열 수 없습니다");
  const { groups: raws, truncated } = src.kind === "steam" ? await scanSteam(src) : await scanFolder(src);
  const groups = [];
  for (const g of raws) {
    const stats = await statAll(g.files);
    const items = [];
    g.files.forEach((file, i) => {
      if (!stats[i]) return;
      items.push({ rel: relOf(src.root, file), name: path.basename(file), kind: media.kindOf(file) === "video" ? "VIDEO" : "IMAGE", ...stats[i] });
    });
    if (items.length === 0) continue;
    items.sort((a, b) => b.mtimeMs - a.mtimeMs || a.rel.localeCompare(b.rel));
    groups.push({ key: g.key, title: g.title, sub: g.sub, items });
  }
  groups.sort((a, b) => b.items[0].mtimeMs - a.items[0].mtimeMs || a.title.localeCompare(b.title));
  return { src, groups, truncated };
}

// ───────────── 파일 하나 ─────────────

/**
 * `(sourceId, 상대 경로 조각들)` → 검사를 마친 실제 파일. 아니면 null. **프로토콜과 옮기기가 같이 쓴다.**
 *
 * - 등록된 폴더, 조각마다 `isPlainSegment`, 마지막은 사진·영상 확장자
 * - 루트에서 한 칸씩 `lstat` — **중간 폴더도 링크가 아닌 진짜 폴더, 파일도 링크가 아닌 진짜 파일.** 링크를 아예 안 따라간다
 * - 그 실제 경로(`realpath`)가 등록 폴더 실제 경로 아래 (윈도우는 대소문자 무시)
 * - 스팀은 모양을 더 좁힌다: `…/<숫자 appid>/screenshots/<파일>` 바로 아래, `thumbnails` 안은 안 된다
 * - 폴더 종류는 깊이 4 폴더 + 파일
 */
function resolveFile(id, segments) {
  const src = get(id);
  if (!src || !Array.isArray(segments) || segments.length === 0 || segments.length > MAX_SEGMENTS) return null;
  if (!segments.every((s) => media.isPlainSegment(s))) return null;
  const name = segments[segments.length - 1];
  if (media.kindOf(name) === null) return null;
  if (src.kind === "steam") {
    const dirs = segments.slice(0, -1);
    if (dirs.length < 2 || dirs[dirs.length - 1].toLowerCase() !== "screenshots" || !isNumeric(dirs[dirs.length - 2])) return null;
  } else if (segments.length - 1 > MAX_DEPTH) {
    return null;
  }
  let cur = src.root;
  try {
    for (let i = 0; i < segments.length; i++) {
      cur = path.join(cur, segments[i]);
      const st = fs.lstatSync(cur);
      if (i < segments.length - 1 ? !st.isDirectory() : !st.isFile()) return null;
    }
    const real = media.realpath(cur);
    const parts = media.partsInside(src.root, real);
    if (!parts || parts.length !== segments.length) return null;
    const st = fs.statSync(real);
    return { real, source: src, rel: segments.join("/"), size: st.size, mtimeMs: Math.floor(st.mtimeMs) };
  } catch {
    return null;
  }
}

/**
 * 탐색기로 열 폴더 — 스팀은 `…/<appid>/screenshots`, 폴더는 등록 폴더(또는 그 하위 폴더). 화면은 `(sourceId, 묶음 키)`만 보낸다.
 * 링크를 따라가지 않는 진짜 폴더만, 등록 폴더 안일 때만. 아니면 null
 */
function folderPath(id, groupKey) {
  const src = get(id);
  if (!src) return null;
  if (src.kind === "steam") {
    if (typeof groupKey !== "string" || !isNumeric(groupKey)) return null;
    for (const remote of steamRemotes(src.root)) {
      const dir = path.join(remote, groupKey, "screenshots");
      if (isRealDir(dir)) {
        const real = media.realpath(dir);
        if (media.partsInside(src.root, real)) return real;
      }
    }
    return null;
  }
  const segs = groupKey === "" || groupKey === undefined ? [] : segmentsOf(groupKey);
  if (!segs) return null;
  let cur = src.root;
  try {
    for (const seg of segs) {
      cur = path.join(cur, seg);
      if (!fs.lstatSync(cur).isDirectory()) return null;
    }
    const real = media.realpath(cur);
    return segs.length === 0 || media.partsInside(src.root, real)?.length === segs.length ? real : null;
  } catch {
    return null;
  }
}

/** `"a/b/c.png"` 꼴 상대 경로(화면이 보낸 값) → 조각들. 모양이 이상하면 null */
function segmentsOf(rel) {
  if (typeof rel !== "string" || rel === "" || rel.length > 2048 || rel.includes("\0") || rel.includes("\\")) return null;
  const segs = rel.split("/");
  return segs.every((s) => media.isPlainSegment(s)) ? segs : null;
}

module.exports = {
  NAME_MAX, MAX_SOURCES, MAX_SEGMENTS, list, get, add, rename, reorder, remove, scan, resolveFile, folderPath, segmentsOf,
  rememberedGames, rememberGame, steamRemotes,
};
