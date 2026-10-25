/**
 * 들어오는 요청의 문지기 — 로컬 포트를 같은 맥의 남(브라우저 탭·다른 프로세스)이 두드리는 걸 막는다.
 *
 *   Host 확인(전부) → [CORS] → 토큰(`/api/*`) → 교차 사이트 → 본문 형식 → 본문 크기
 *
 * 순서가 뜻이 있다. Host가 맨 앞인 건 DNS 리바인딩이면 그 뒤의 무엇도 믿을 수 없어서고,
 * CORS가 토큰보다 앞인 건 사전 요청(OPTIONS)엔 토큰 머리글이 실리지 않아서다.
 *
 * 실패 응답은 앱 모양(`{code, message}`)이다 — 화면이 이 모양만 읽는다.
 */
import crypto from "crypto";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError, FileTooLarge } from "../common/errors";
import { config } from "../config";
import { allowedOrigins } from "./cors";

export const TOKEN_HEADER = "X-Starlog-Token";

/** 실제로 연 포트. `STARLOG_PORT=0`이면 리슨한 뒤에야 안다 (`main.ts`가 넣는다) */
let port: number | null = null;
export function setListenPort(p: number) { port = p; }
export function listenPort(): number {
  return port ?? config().port;
}

/**
 * Host 허용 목록 — **DNS 리바인딩** 방어. 남의 사이트가 자기 도메인을 127.0.0.1로 돌려 이 포트에 붙으면
 * 브라우저 눈엔 같은 출처라 CORS가 아무것도 안 한다. 서버가 볼 수 있는 흔적은 `Host`뿐이다.
 * 개발 화면의 프록시는 `Host`를 대상(`localhost:8080`)으로 바꿔 보내므로(`changeOrigin`) 목록이 같다
 */
export const hostGuard: MiddlewareHandler = async (c, next) => {
  const host = c.req.header("Host")?.toLowerCase();
  const p = listenPort();
  if (host !== `127.0.0.1:${p}` && host !== `localhost:${p}`) {
    const e = new AppError(403, "FORBIDDEN_HOST", "허용되지 않은 호스트입니다");
    return c.json(e.body(), 403);
  }
  return next();
};

function sameToken(given: string | undefined, expected: string) {
  if (given === undefined) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  // 길이가 다르면 timingSafeEqual이 던진다 — 길이는 숨길 값이 아니다 (토큰은 고정 길이)
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 토큰. 머리글이 원칙이고, `t=` 쿼리는 **GET·HEAD만** — `<img>`·`<video>`는 머리글을 못 싣는다.
 * 쿼리 토큰으로 상태를 바꾸는 요청을 열면 주소 한 줄이 곧 쓰기 권한이 된다
 */
function tokenOk(c: Context, expected: string) {
  if (sameToken(c.req.header(TOKEN_HEADER), expected)) return true;
  return (c.req.method === "GET" || c.req.method === "HEAD") && sameToken(c.req.query("t"), expected);
}

export const tokenGuard: MiddlewareHandler = async (c, next) => {
  const expected = config().apiToken;
  if (expected !== null && !tokenOk(c, expected)) {
    const e = new AppError(401, "UNAUTHORIZED", "인증 토큰이 없거나 올바르지 않습니다");
    return c.json(e.body(), 401);
  }
  return next();
};

/**
 * `Sec-Fetch-Site: cross-site` 거절 — 남의 페이지가 `<img src>`·`<form>`으로 부르는 것.
 * ⚠️ 운영에선 **토큰이 맞으면 통과**다. 창(`app://starlog`) → `http://127.0.0.1`은 스킴이 달라 브라우저가
 * 늘 cross-site로 표시하고, `<img>`는 `Origin`도 안 싣는다 — 그 둘로는 내 화면과 남을 못 가른다.
 * 그래서 이 겹은 **토큰이 없는 dev·test에서만** 실제로 일한다 — 운영에선 앞의 `tokenGuard`가 토큰 없는 요청을 이미
 * 401로 돌려보내서, 여기까지 온 요청은 늘 토큰이 맞다 (운영 쪽 갈래는 순서가 바뀌어도 안전하라고 남긴 것)
 */
export const crossSiteGuard: MiddlewareHandler = async (c, next) => {
  if (c.req.header("Sec-Fetch-Site")?.toLowerCase() === "cross-site") {
    const expected = config().apiToken;
    const origin = c.req.header("Origin");
    const trusted = expected !== null ? tokenOk(c, expected) : origin !== undefined && allowedOrigins().includes(origin);
    if (!trusted) {
      const e = new AppError(403, "CROSS_SITE", "다른 사이트에서 온 요청은 받지 않습니다");
      return c.json(e.body(), 403);
    }
  }
  return next();
};

/** 파일을 받는 자리 — 멀티파트는 여기만 */
const UPLOAD = /^\/api\/backlog\/[^/]+\/(cover\/file|screenshots)$/;
/** 기록 통째로 — 실데이터 내보내기가 340KB 안팎이라 넉넉히 */
const DUMP = /^\/api\/me\/(import|replace)$/;

const MB = 1024 * 1024;
export const LIMITS = { upload: 260 * MB, dump: 50 * MB, json: 5 * MB } as const;

const hasBody = (c: Context) => {
  const len = c.req.header("Content-Length");
  return c.req.header("Transfer-Encoding") !== undefined || (len !== undefined && len.trim() !== "0");
};

/**
 * 상태를 바꾸는 요청의 본문은 **JSON만** (업로드 자리만 멀티파트). 아니면 415.
 * `text/plain`·폼은 브라우저가 사전 요청 없이 보내는 "단순 요청"이라, 그걸 받아주면
 * 아무 페이지나 `<form>`·`fetch(no-cors)`로 쓰기를 날린다. 본문을 안 읽는 라우트도 있으니 라우트가 아니라 여기서 막는다
 */
export const contentTypeGuard: MiddlewareHandler = async (c, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) return next();
  const type = c.req.header("Content-Type")?.split(";")[0]!.trim().toLowerCase();
  if (type === undefined && !hasBody(c)) return next();
  const ok = type === "application/json" || (type === "multipart/form-data" && c.req.method === "POST" && UPLOAD.test(c.req.path));
  if (!ok) {
    const e = new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "본문은 JSON이어야 합니다");
    return c.json(e.body(), 415);
  }
  return next();
};

const limiter = (maxSize: number) => bodyLimit({ maxSize, onError: () => { throw new FileTooLarge(); } });
const limiters = { upload: limiter(LIMITS.upload), dump: limiter(LIMITS.dump), json: limiter(LIMITS.json) };

/** 자리마다 상한이 다르다 — JSON 자리에 260MB를 열어두면 PGlite 한 세션이 그걸 다 파싱하느라 앱이 선다 */
export const sizeGuard: MiddlewareHandler = (c, next) => {
  const kind = UPLOAD.test(c.req.path) ? "upload" : DUMP.test(c.req.path) ? "dump" : "json";
  return limiters[kind](c, next);
};

/** 모든 응답 — 타입 추측 금지(업로드한 파일이 HTML로 읽히지 않게), 주소(쿼리 토큰 포함)를 남에게 흘리지 않게 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "no-referrer");
};
