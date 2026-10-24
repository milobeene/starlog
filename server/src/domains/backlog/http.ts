/**
 * 업로드·파일 응답의 스프링 흉내 — 멀티파트 `@RequestParam MultipartFile`과 `Resource` 응답(Range 포함).
 */
import fs from "fs";
import { Readable } from "stream";
import type { Context } from "hono";
import { InvalidInput } from "../../common/errors";

type Form = Record<string, string | File | (string | File)[]>;

/** 멀티파트가 아니거나 깨졌으면 빈 폼 — 파일이 없다는 같은 결론(400)으로 간다 */
export async function multipartForm(c: Context): Promise<Form> {
  try {
    return (await c.req.parseBody({ all: true })) as Form;
  } catch {
    return {};
  }
}

const values = (form: Form, name: string) => { const v = form[name]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; };

/** 같은 이름이 여럿이면 첫 번째 (스프링 `getFile`) */
export const firstFile = (form: Form, name: string) => values(form, name).find((v): v is File => typeof v !== "string") ?? null;
export const firstText = (form: Form, name: string) => values(form, name).find((v): v is string => typeof v === "string");

export async function multipartFile(c: Context, name: string) {
  return firstFile(await multipartForm(c), name);
}

/**
 * 파일 파트가 없다 — `MissingServletRequestPartException`. 전역 핸들러가 안 잡아서
 * **스프링 기본 오류 본문**(timestamp·status·error·path)이 나갔다
 */
export function missingPart(c: Context) {
  return c.json({ timestamp: new Date().toISOString(), status: 400, error: "Bad Request", path: c.req.path }, 400);
}

/** `@RequestParam Long` — 형식이 틀리면 400 `"{이름} 값이 올바르지 않습니다"` */
export function parseLongParam(name: string, raw: string): number {
  const s = raw.trim();
  const n = Number(s);
  if (!/^[+-]?\d+$/.test(s) || !Number.isSafeInteger(n)) throw new InvalidInput(`${name} 값이 올바르지 않습니다`);
  return n;
}

/**
 * 파일 응답 (`ResponseEntity<Resource>`). Range가 오면 206 + 그 구간만, 못 맞추면 416.
 * 여러 구간(`bytes=0-1,5-9`)은 스프링이 multipart/byteranges로 냈는데 브라우저 재생이 안 쓰므로 첫 구간만 준다
 */
export function sendFile(c: Context, file: string, contentType: string) {
  const size = fs.statSync(file).size;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };
  const range = c.req.header("Range");
  if (range === undefined) {
    headers["Content-Length"] = String(size);
    return c.body(stream(file, 0, size - 1), 200, headers);
  }
  const parsed = parseRange(range, size);
  if (parsed === null) {
    // 스프링은 416을 매기고도 본문에 **파일 전체**를 실었다 — 그대로
    headers["Content-Range"] = `bytes */${size}`;
    headers["Content-Length"] = String(size);
    return c.body(stream(file, 0, size - 1), 416, headers);
  }
  const [start, end] = parsed;
  headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  headers["Content-Length"] = String(end - start + 1);
  return c.body(stream(file, start, end), 206, headers);
}

function stream(file: string, start: number, end: number) {
  if (end < start) return new Uint8Array(0);
  return Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
}

/** `HttpRange.parseRanges` + `toResourceRegion` — 끝이 넘치면 자르고, 시작이 넘치면 실패 */
function parseRange(header: string, size: number): [number, number] | null {
  const m = /^bytes=\s*(\d*)-(\d*)\s*(,.*)?$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    return suffix <= 0 ? null : [Math.max(0, size - suffix), size - 1];
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return null;
  return [start, end];
}
