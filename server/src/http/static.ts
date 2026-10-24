/**
 * 정적 프론트 — `.html` 확장자 없는 경로를 풀어 준다.
 *
 * Next 정적 내보내기는 `/library/detail` 같은 경로에 `library/detail.html`을 만든다.
 *   1. 그 경로에 파일이 있으면 그대로
 *   2. 점(.)이 들어간 경로(자원 요청)인데 없으면 404
 *   3. 아니면 `경로.html` → `경로/index.html` → 그래도 없으면 `404.html` (상태 200)
 */
import fs from "fs";
import path from "path";
import type { Context } from "hono";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".avif": "image/avif",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".webm": "video/webm",
  ".map": "application/json", ".wasm": "application/wasm",
};

function isFile(p: string) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/** 루트 밖으로 나가는 경로(`..`)는 막는다 */
function inside(root: string, rel: string): string | null {
  const full = path.resolve(root, "." + path.posix.normalize("/" + rel));
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

export function serveStatic(root: string) {
  const base = path.resolve(root);
  const send = (c: Context, file: string) => {
    const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const body = fs.readFileSync(file);
    return c.body(body, 200, { "Content-Type": type, "Content-Length": String(body.length) });
  };
  return (c: Context) => {
    let rel: string;
    try { rel = decodeURIComponent(c.req.path); } catch { return c.notFound(); }
    const asIs = inside(base, rel);
    if (asIs && isFile(asIs)) return send(c, asIs);
    if (rel.includes(".")) return c.notFound();
    const trimmed = rel.endsWith("/") ? rel.slice(0, -1) : rel;
    for (const cand of [trimmed + ".html", trimmed + "/index.html"]) {
      const p = inside(base, cand);
      if (p && isFile(p)) return send(c, p);
    }
    const nf = path.join(base, "404.html");
    return isFile(nf) ? send(c, nf) : c.notFound();
  };
}
