/**
 * 흐린 자리표시 — 서버가 주는 `"<w>x<h>:<RGB base64>"`(8px 안팎)를 `<img>`에 넣을 수 있는 BMP 주소로 바꾼다.
 *
 * 작은 그림을 칸 크기로 늘리면 브라우저가 이중선형으로 펴서 **흐린 색 덩어리**가 된다 — `filter: blur()`가 필요 없다
 * (블러 필터는 칸마다 GPU 층을 만든다. 사용자 PC가 VRAM이 적다). JPEG·PNG가 아니라 BMP인 이유: 머리 54바이트에
 * 픽셀을 그대로 붙이면 끝이라 화면에서 바로 만든다. 서버가 JPEG로 주면 머리(양자화 표)만 수백 바이트라 목록이 무겁다
 */

const cache = new Map<string, string | null>();
const MAX = 4000;

function toBmp(w: number, h: number, rgb: Uint8Array): string {
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  b[0] = 0x42;
  b[1] = 0x4d;
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, -h, true); // 위에서 아래로
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 3;
      const d = 54 + y * row + x * 3;
      b[d] = rgb[s + 2]; // BMP는 BGR
      b[d + 1] = rgb[s + 1];
      b[d + 2] = rgb[s];
    }
  }
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return `data:image/bmp;base64,${btoa(bin)}`;
}

/** 모양이 틀리면 null — 자리표시는 없어도 되는 것이라 깨진 그림을 그리느니 안 그린다 */
export function placeholderUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const hit = cache.get(value);
  if (hit !== undefined) return hit;
  let out: string | null = null;
  const m = /^(\d{1,2})x(\d{1,2}):([A-Za-z0-9+/=]+)$/.exec(value);
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    try {
      const bin = atob(m[3]);
      if (w > 0 && h > 0 && bin.length === w * h * 3) {
        const rgb = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) rgb[i] = bin.charCodeAt(i);
        out = toBmp(w, h, rgb);
      }
    } catch {
      out = null;
    }
  }
  if (cache.size > MAX) cache.clear();
  cache.set(value, out);
  return out;
}
