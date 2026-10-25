/**
 * 그림 머리글에서 크기와 EXIF 회전만 읽는다 — 다 풀지 않고. 공장이 "한 번에 줄여 풀기"를 하려면 원본 크기를 먼저 알아야 한다.
 * 모르는 모양이면 null (공장이 풀어서 잰다)
 */

/** @returns {{ width: number, height: number, orientation: number } | null} 크기는 회전을 적용한 뒤 기준 */
function imageInfo(b) {
  if (!b || b.length < 16) return null;
  try {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return png(b);
    if (b[0] === 0xff && b[1] === 0xd8) return jpeg(b);
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return webp(b);
  } catch { /* 잘린 파일 */ }
  return null;
}

function png(b) {
  if (b.length < 24 || b.toString("ascii", 12, 16) !== "IHDR") return null;
  return ok(b.readUInt32BE(16), b.readUInt32BE(20), 1);
}

function jpeg(b) {
  let o = 2;
  let orientation = 1;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) { o++; continue; }
    const marker = b[o + 1];
    if (marker === 0xff) { o++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;   // 크기 전에 그림 데이터 — 이상한 파일
    const len = b.readUInt16BE(o + 2);
    if (len < 2) return null;
    if (marker === 0xe1 && o + 4 + len - 2 <= b.length) orientation = exifOrientation(b, o + 4, len - 2) ?? orientation;
    // SOF0~SOF15 (DHT·JPG·DAC 제외)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (o + 9 > b.length) return null;
      const h = b.readUInt16BE(o + 5), w = b.readUInt16BE(o + 7);
      return orientation >= 5 && orientation <= 8 ? ok(h, w, orientation) : ok(w, h, orientation);
    }
    o += 2 + len;
  }
  return null;
}

function exifOrientation(b, start, len) {
  if (b.toString("ascii", start, start + 4) !== "Exif") return null;
  const t = start + 6;
  const le = b.toString("ascii", t, t + 2) === "II";
  const u16 = (p) => (le ? b.readUInt16LE(p) : b.readUInt16BE(p));
  const u32 = (p) => (le ? b.readUInt32LE(p) : b.readUInt32BE(p));
  const ifd = t + u32(t + 4);
  if (ifd + 2 > start + len) return null;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > start + len) return null;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return null;
}

function webp(b) {
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X" && b.length >= 30) return ok(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3), 1);
  if (chunk === "VP8 " && b.length >= 30) return ok(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff, 1);
  if (chunk === "VP8L" && b.length >= 25) {
    const v = b.readUInt32LE(21);
    return ok((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1, 1);
  }
  return null;
}

const ok = (width, height, orientation) =>
  width > 0 && height > 0 && width <= 65535 && height <= 65535 ? { width, height, orientation } : null;

module.exports = { imageInfo };
