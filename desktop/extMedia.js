/**
 * 등록한 외부 폴더(`sources.js`)의 파일을 `starlog-media://`로 내주는 데 필요한 것 — 주소 해석 · 썸네일 캐시 · 감시.
 *
 *   starlog-media://src/<sourceId>/<조각>/<조각>/<파일>?v=<원본 ms>        원본
 *   starlog-media://srcthumb/<sourceId>/<조각>/…/<파일>?v=<원본 ms>        썸네일
 *
 * ## 썸네일은 사용자 폴더에 안 쓴다
 *
 * 스팀·ShareX 폴더는 **남의 폴더**다. `.thumbs/`를 심으면 그 프로그램이 낯선 폴더를 만난다. 그래서 앱 데이터의
 * `thumb-cache/<sourceId>/<sha1(상대 경로)>.jpg`에 둔다. 신선도 표시는 STARLOG 안 폴더와 같다 — 썸네일 수정시각 = 원본 수정시각.
 * 만드는 공장·줄·배경 문(`thumbs.js`, `thumbPool.js`, `mediaGate.js`)은 그대로 쓴다: 화면이 부른 것만 만들고(배경에서 미리 만들지 않는다 —
 * 사용자가 게임 중에 CPU를 뺏기지 않게), 창을 안 보고 있으면 느린 공장이 한다.
 * 색인(자리표시·원본 크기)은 `thumb-cache/<sourceId>/index.json`. 캐시라 지워져도 다시 만든다
 *
 * ## 감시
 *
 * 인박스 화면이 열려 있는 동안만 (`watch`). 일반 폴더는 `fs.watch(recursive)`, 스팀은 사진이 생기는 `screenshots` 폴더들만 보고 0.4초 모아 알린다.
 * 윈도우는 감시하던 폴더가 지워지면 `EPERM`을 내므로 닫고 잠시 뒤 다시 붙는다
 */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const paths = require("./paths");
const media = require("./media");
const sources = require("./sources");

const SCHEME_HOSTS = { src: "shot", srcthumb: "thumb" };
const WATCH_DEBOUNCE_MS = 400;
const FLUSH_MS = 800;
const TMP_STALE_MS = 60 * 60 * 1000;
const ID_RE = /^[0-9a-f]{12}$/;

const cacheRoot = () => path.join(paths.APP_DATA, "thumb-cache");
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");

// ───────────── 주소 ─────────────

const encodeRel = (rel) => rel.split("/").map(encodeURIComponent).join("/");

/** 화면에 줄 주소 둘 */
function urlsOf(sourceId, rel, mtimeMs) {
  const tail = `${sourceId}/${encodeRel(rel)}?v=${mtimeMs}`;
  return { url: `starlog-media://src/${tail}`, thumbUrl: `starlog-media://srcthumb/${tail}` };
}

/**
 * 주소 → `{ kind, file }` (`file`은 `sources.resolveFile`의 결과). 우리 호스트가 아니면 `undefined`, 우리 호스트인데 검사에 걸리면 `null`
 */
function resolveUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return undefined; }
  const kind = SCHEME_HOSTS[url.host];
  if (url.protocol !== "starlog-media:" || !kind) return undefined;
  if (url.username || url.password || url.port) return null;
  const raw = url.pathname.split("/");
  if (raw.length < 3 || raw[0] !== "" || !ID_RE.test(raw[1])) return null;
  let segs;
  try { segs = raw.slice(2).map(decodeURIComponent); } catch { return null; }
  const file = sources.resolveFile(raw[1], segs);
  return file ? { kind, file } : null;
}

// ───────────── 썸네일 캐시 ─────────────

/** sourceId → { data, dirty, timer } */
const indexes = new Map();

function slot(sourceId) {
  let s = indexes.get(sourceId);
  if (s) return s;
  let data = { v: 1, files: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(cacheRoot(), sourceId, "index.json"), "utf8"));
    if (parsed?.v === 1 && parsed.files && typeof parsed.files === "object" && !Array.isArray(parsed.files)) data = parsed;
  } catch { /* 없거나 깨짐 — 새로 */ }
  s = { data, dirty: false, timer: null };
  indexes.set(sourceId, s);
  return s;
}

function flush(sourceId, s) {
  if (!s.dirty) return;
  try {
    const dir = path.join(cacheRoot(), sourceId);
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, "index.json");
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s.data), { flag: "wx" });
    s.dirty = false;
    try { fs.renameSync(tmp, target); } catch { fs.rmSync(tmp, { force: true }); }
  } catch (e) {
    console.warn("[ext-media] 색인을 쓰지 못했다", e?.code ?? e?.message);
  }
}

function putIndex(sourceId, key, rec) {
  const s = slot(sourceId);
  s.data.files[key] = rec;
  s.dirty = true;
  if (!s.timer) s.timer = setTimeout(() => { s.timer = null; flush(sourceId, s); }, FLUSH_MS);
}

function flushAll() {
  for (const [id, s] of indexes) {
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    flush(id, s);
  }
}

/** 이 판의 자리표시·원본 크기. 원본이 바뀌었거나(크기·수정시각) 기록이 없으면 null */
function infoOf(sourceId, rel, size, mtimeMs) {
  const rec = slot(sourceId).data.files[sha1(rel)];
  if (!rec || rec.s !== size || typeof rec.m !== "string") return null;
  try { if (Math.abs(Number(BigInt(rec.m) / 1_000_000n) - mtimeMs) > 1) return null; } catch { return null; }
  return { placeholder: rec.p ?? null, width: rec.w ?? null, height: rec.h ?? null };
}

/** `thumbs.ensureExternal`에 넘기는 목적지 */
function target(sourceId, rel) {
  const key = sha1(rel);
  const file = path.join(cacheRoot(), sourceId, `${key}.jpg`);
  return {
    key: `${sourceId}/${key}`,
    file,
    get: () => slot(sourceId).data.files[key] ?? null,
    put: (rec) => putIndex(sourceId, key, rec),
    fresh(st) {
      try {
        const t = fs.lstatSync(file, { bigint: true });
        const diff = t.mtimeNs / 1_000_000n - st.mtimeNs / 1_000_000n;
        return t.isFile() && t.size > 0n && diff >= -1n && diff <= 1n;
      } catch { return false; }
    },
    async write(jpeg, st) {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      try {
        await fsp.writeFile(tmp, jpeg, { flag: "wx" });
        await fsp.utimes(tmp, Number(st.atimeNs) / 1e9, Number(st.mtimeNs) / 1e9);
        for (let attempt = 0; ; attempt++) {
          try { await fsp.rename(tmp, file); break; } catch (e) {
            if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || attempt >= 5) throw e;
            await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
          }
        }
      } catch (e) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw e;
      }
      return true;
    },
  };
}

/** 목록에 없는 파일의 캐시를 치운다 (옮겨서 사라졌거나 사용자가 지운 것) — 훑기가 끝까지 돈 뒤에만 부른다 */
function prune(sourceId, rels) {
  const keep = new Set(rels.map(sha1));
  const s = slot(sourceId);
  let dropped = 0;
  for (const key of Object.keys(s.data.files)) {
    if (keep.has(key)) continue;
    delete s.data.files[key];
    dropped++;
  }
  try {
    for (const n of fs.readdirSync(path.join(cacheRoot(), sourceId))) {
      const f = path.join(cacheRoot(), sourceId, n);
      if (n.endsWith(".jpg") && !keep.has(n.slice(0, -4))) { fs.rmSync(f, { force: true }); dropped++; }
      // 쓰다 죽은 임시 파일 — 쓰는 중인 것(1시간 안)은 건드리지 않는다
      else if (n.endsWith(".tmp")) {
        try { if (Date.now() - fs.statSync(f).mtimeMs > TMP_STALE_MS) fs.rmSync(f, { force: true }); } catch { /* 그 사이 사라졌다 */ }
      }
    }
  } catch { /* 캐시 폴더가 아직 없다 */ }
  if (dropped) { s.dirty = true; if (!s.timer) s.timer = setTimeout(() => { s.timer = null; flush(sourceId, s); }, FLUSH_MS); }
}

/** 등록을 지울 때 그 캐시도 */
function dropCache(sourceId) {
  const s = indexes.get(sourceId);
  if (s?.timer) clearTimeout(s.timer);
  indexes.delete(sourceId);
  if (ID_RE.test(sourceId)) fs.rmSync(path.join(cacheRoot(), sourceId), { recursive: true, force: true });
}

// ───────────── 감시 ─────────────

/** sourceId → { watchers: Map<dir, FSWatcher>, timer, retry } */
let watchers = new Map();
let watching = false;
let notify = () => {};

/**
 * 감시할 자리. 스팀은 **등록 루트를 통째로 안 본다** — 설치 폴더는 `steamapps/downloading` 등이 쉴 새 없이 바뀐다.
 * 사진이 생기는 `760/remote/<appid>/screenshots`만, 새 게임의 첫 사진(appid 폴더 생성)은 `remote` 한 칸(비재귀)으로 잡는다
 */
function targetsOf(src) {
  if (src.kind !== "steam") return [{ dir: src.root, recursive: true }];
  const out = [];
  for (const remote of sources.steamRemotes(src.root)) {
    out.push({ dir: remote, recursive: false });
    try {
      for (const d of fs.readdirSync(remote, { withFileTypes: true })) {
        if (!d.isDirectory() || d.isSymbolicLink() || !/^\d+$/.test(d.name)) continue;
        const shots = path.join(remote, d.name, "screenshots");
        try { if (fs.lstatSync(shots).isDirectory()) out.push({ dir: shots, recursive: false }); } catch { /* 아직 없다 */ }
      }
    } catch { /* remote가 사라졌다 */ }
  }
  return out;
}

function attach(id) {
  const src = sources.get(id);
  if (!src || watchers.has(id)) return;
  const w = { watchers: new Map(), timer: null, retry: null };
  watchers.set(id, w);
  const ping = () => {
    clearTimeout(w.timer);
    w.timer = setTimeout(() => { try { notify({ sourceId: id }); } catch { /* 창이 없다 */ } }, WATCH_DEBOUNCE_MS);
  };
  const closeAll = () => {
    for (const x of w.watchers.values()) { try { x.close(); } catch { /* 이미 닫힘 */ } }
    w.watchers.clear();
  };
  const reattach = () => {
    closeAll();
    if (!watching) return;
    clearTimeout(w.retry);
    w.retry = setTimeout(() => {
      if (!watching || watchers.get(id) !== w) return;
      watchers.delete(id);
      attach(id);
      ping();
    }, 2000);
  };
  // 새 appid 폴더·screenshots 폴더가 생겼으면 그 자리를 더 본다
  const sync = () => {
    if (!watching || watchers.get(id) !== w) return;
    for (const t of targetsOf(src)) if (!w.watchers.has(t.dir)) open(t);
  };
  const open = (t) => {
    try {
      const x = fs.watch(t.dir, { recursive: t.recursive }, (_event, name) => {
        // 스팀의 `thumbnails/`는 스팀이 알아서 채운다 — 거기 변화로 목록을 다시 읽지 않는다
        if (name && /(^|[\\/])thumbnails([\\/]|$)/i.test(String(name))) return;
        if (src.kind === "steam") sync();
        ping();
      });
      x.on("error", reattach);   // 윈도우: 감시하던 폴더가 지워지면 EPERM
      w.watchers.set(t.dir, x);
    } catch {
      reattach();   // 리눅스 등 recursive를 못 하는 곳 — 조용히 감시 없이
    }
  };
  for (const t of targetsOf(src)) open(t);
  w.closeAll = closeAll;
}

/** 인박스 화면이 열렸다 — 등록된 폴더 모두를 본다. `onChanged({sourceId})` */
function watch(onChanged) {
  unwatch();
  watching = true;
  notify = onChanged;
  for (const s of sources.list()) if (s.ok) attach(s.id);
}

function unwatch() {
  watching = false;
  for (const w of watchers.values()) {
    clearTimeout(w.timer);
    clearTimeout(w.retry);
    w.closeAll?.();
  }
  watchers = new Map();
}

/** 지금 감시 중인 폴더들 (시험용) */
const watchedDirs = () => [...watchers.values()].flatMap((w) => [...w.watchers.keys()]);

module.exports = { urlsOf, resolveUrl, target, infoOf, prune, dropCache, flushAll, watch, unwatch, cacheRoot, watchedDirs };
