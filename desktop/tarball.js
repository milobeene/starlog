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

/**
 * 풀기 한도. 실데이터 세이브파일이 42MB(묶음 5MB)라 넉넉하게 잡았다.
 * 백업 파일은 남이 만든 것일 수도 있다 — 작은 gzip이 수십 GB로 불어나거나(압축 폭탄) 항목이 수백만 개면 디스크·메모리가 먼저 죽는다
 */
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;   // 1GB
const MAX_PACKED_BYTES = 512 * 1024 * 1024;      // 백업 한도(100MB)보다 훨씬 크다
const MAX_ENTRIES = 50000;

/** 헤더 체크섬 — 체크섬 칸(148~155)을 공백으로 보고 512바이트 합. 어긋나면 깨졌거나 tar가 아닌 파일이다 */
function checksumOk(h) {
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 32 : h[i];
  const stored = h.subarray(148, 156).toString("ascii").replace(/[\0 ]+$/g, "").replace(/^ +/, "");
  return /^[0-7]{1,7}$/.test(stored) && parseInt(stored, 8) === sum;
}

/** 묶음 안 이름 검사 — 절대 경로·`..`·역슬래시·드라이브 문자·NUL을 거절한다 (`path.resolve`만 믿지 않는다: 윈도우에선 `C:\x`가 루트를 갈아탄다) */
function entryNameOk(name) {
  if (name === "" || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return name.split("/").every((seg) => seg !== ".." && seg !== ".");
}

/** `.tar.gz` → 폴더. 폴더가 이미 있으면 거절한다 (덮어쓰지 않는다). 어디서 실패하든 `.part`를 치운다 */
function unpack(file, dir) {
  if (fs.existsSync(dir)) throw new Error(`이미 있는 폴더입니다: ${dir}`);
  const tmp = `${dir}.part`;
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    if (fs.statSync(file).size > MAX_PACKED_BYTES) throw new Error("백업 파일이 너무 큽니다");
    // maxOutputLength를 넘으면 RangeError — 압축 폭탄을 메모리에 다 풀기 전에 끊는다
    const buf = zlib.gunzipSync(fs.readFileSync(file), { maxOutputLength: MAX_UNPACKED_BYTES });
    fs.mkdirSync(tmp, { recursive: true });
    const root = path.resolve(tmp);
    let entries = 0;
    let written = 0;
    let ended = false;
    for (let off = 0; off + BLOCK <= buf.length;) {
      const h = buf.subarray(off, off + BLOCK);
      if (h.every((b) => b === 0)) { ended = true; break; }
      if (!checksumOk(h)) throw new Error("백업 파일이 깨져 있습니다 (헤더 검사 실패)");
      if (++entries > MAX_ENTRIES) throw new Error("백업 파일의 항목이 너무 많습니다");
      const str = (a, n) => h.subarray(a, a + n).toString("utf8").replace(/\0.*$/s, "");
      const name = (str(345, 155) ? `${str(345, 155)}/` : "") + str(0, 100);
      const sizeText = str(124, 12).trim();
      // 8진수 숫자만. 거짓 크기(음수·NaN·base-256)는 거절 — 예전엔 NaN이 조용히 0바이트 파일로 풀렸다
      if (!/^[0-7]{1,11}$/.test(sizeText)) throw new Error(`백업 파일이 깨져 있습니다 (크기: ${name})`);
      const size = parseInt(sizeText, 8);
      const type = String.fromCharCode(h[156] || 48);
      off += BLOCK;
      if (!entryNameOk(name.replace(/\/$/, ""))) throw new Error(`잘못된 경로: ${name}`);
      const full = path.resolve(root, name);
      if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`잘못된 경로: ${name}`);
      if (type === "5") {
        fs.mkdirSync(full, { recursive: true });
      } else if (type === "0") {
        // 크기가 남은 버퍼보다 크면 잘린 파일이다 — 예전엔 있는 만큼만 쓰고 성공으로 끝났다
        if (off + size > buf.length) throw new Error(`백업 파일이 잘려 있습니다: ${name}`);
        written += size;
        if (written > MAX_UNPACKED_BYTES) throw new Error("풀린 크기가 한도를 넘었습니다");
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, buf.subarray(off, off + size), { flag: "wx" });   // 같은 이름이 두 번 오면 거절
      } else {
        // 심볼릭·하드 링크·장치·pax 확장은 우리 `pack`이 안 만든다 — 링크 하나로 풀기 밖을 가리킬 수 있어 거절
        throw new Error(`지원하지 않는 항목입니다 (type ${JSON.stringify(type)}): ${name}`);
      }
      off += Math.ceil(size / BLOCK) * BLOCK;
    }
    if (!ended) throw new Error("백업 파일이 잘려 있습니다 (끝 표시 없음)");
    // PGlite 폴더가 아니면 되살려 봐야 못 연다
    if (!fs.existsSync(path.join(root, "PG_VERSION"))) throw new Error("세이브파일 백업이 아닙니다 (PG_VERSION 없음)");
    fs.renameSync(tmp, dir);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
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
