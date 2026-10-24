/**
 * 폴더 ↔ `.tar.gz` — 세이브파일 백업용. 의존성 없이 ustar만 쓰고 읽는다.
 *
 * PGlite 세이브파일은 파일 하나가 아니라 **폴더**(Postgres 데이터 디렉터리)라서
 * 자바 시절처럼 `copyFileSync` 한 줄로는 백업이 안 된다. 그대로 복사하면 41MB가 넘는데,
 * 묶어서 누르면 실데이터 기준 5MB쯤이다 (백업 한도 100MB를 생각하면 누르는 게 맞다).
 *
 * ⚠️ **DB가 닫혀 있을 때만 묶는다.** 열려 있는 폴더를 묶으면 찢어진 백업이 된다 —
 * 입구 화면(백엔드 내려감)에서만 부른다. `backup.js`가 묶기 전후로 바뀐 게 없는지 확인한다.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BLOCK = 512;

function header(name, size, mtime, type) {
  const buf = Buffer.alloc(BLOCK, 0);
  let prefix = "";
  let base = name;
  // ustar은 이름 100바이트 + 접두 155바이트. 넘으면 '/'에서 가른다
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`경로가 너무 깁니다: ${name}`);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  buf.write(base, 0, 100, "utf8");
  buf.write(type === "5" ? "0000755\0" : "0000644\0", 100, 8, "ascii");
  buf.write("0000000\0", 108, 8, "ascii");
  buf.write("0000000\0", 116, 8, "ascii");
  buf.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  buf.write(Math.floor(mtime / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
  buf.write("        ", 148, 8, "ascii");
  buf.write(type, 156, 1, "ascii");
  buf.write("ustar\0" + "00", 257, 8, "ascii");
  buf.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += buf[i];
  buf.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return buf;
}

function walk(root) {
  const out = [];
  const visit = (rel) => {
    const full = path.join(root, rel);
    for (const e of fs.readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { out.push({ rel: r, dir: true }); visit(r); }
      else if (e.isFile()) out.push({ rel: r, dir: false });
    }
  };
  visit("");
  return out;
}

/** 폴더 → `.tar.gz` 파일. 임시 이름에 쓰고 끝나면 바꾼다 (중간에 죽어도 반쪽 백업이 안 남게) */
function pack(dir, target) {
  const parts = [];
  for (const { rel, dir: isDir } of walk(dir)) {
    const stat = fs.statSync(path.join(dir, rel));
    if (isDir) { parts.push(header(`${rel}/`, 0, stat.mtimeMs, "5")); continue; }
    const data = fs.readFileSync(path.join(dir, rel));
    parts.push(header(rel, data.length, stat.mtimeMs, "0"), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0));
  const tmp = `${target}.part`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.concat(parts), { level: 6 }));
  fs.renameSync(tmp, target);
}

/** `.tar.gz` → 폴더. 폴더가 이미 있으면 거절한다 (덮어쓰지 않는다) */
function unpack(file, dir) {
  if (fs.existsSync(dir)) throw new Error(`이미 있는 폴더입니다: ${dir}`);
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const tmp = `${dir}.part`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const root = path.resolve(tmp);
  for (let off = 0; off + BLOCK <= buf.length;) {
    const h = buf.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break;
    const str = (a, n) => h.subarray(a, a + n).toString("utf8").replace(/\0.*$/s, "");
    const name = (str(345, 155) ? `${str(345, 155)}/` : "") + str(0, 100);
    const size = parseInt(str(124, 12).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    off += BLOCK;
    const full = path.resolve(root, name);
    // 묶음 밖으로 나가는 경로(`../`)는 거절 — 남이 만든 파일을 풀 일은 없지만 습관으로
    if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`잘못된 경로: ${name}`);
    if (type === "5") fs.mkdirSync(full, { recursive: true });
    else if (type === "0" || type === "\0") {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, buf.subarray(off, off + size));
    }
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  fs.renameSync(tmp, dir);
}

/** 폴더 안 파일 중 가장 늦은 수정 시각 — "바뀌었는가" 판정용 */
function latestMtime(dir) {
  let latest = 0;
  for (const { rel, dir: isDir } of walk(dir)) {
    if (isDir) continue;
    latest = Math.max(latest, fs.statSync(path.join(dir, rel)).mtimeMs);
  }
  return latest;
}

function sizeOf(dir) {
  let total = 0;
  for (const { rel, dir: isDir } of walk(dir)) if (!isDir) total += fs.statSync(path.join(dir, rel)).size;
  return total;
}

module.exports = { pack, unpack, latestMtime, sizeOf };
