/**
 * 데스크탑 CORS — 스프링 `DefaultCorsProcessor`와 같은 동작.
 *
 * **창은 평생 `app://starlog` 한 장이고 서버는 API만 준다** (2026-08-28 결정).
 * 입구 ↔ 앱을 오갈 때마다 문서가 통째로 바뀌면 검은 화면이 번쩍이고 배경 연출이 끊겨서다.
 * 그래서 화면 → API는 **교차 출처 요청**이고 이 파일이 그걸 연다.
 *
 * ⚠️ 한때 이걸 "같은 출처라 필요 없다"며 빠뜨렸다 — 앱이 배경만 남은 검은 화면이 됐다 (2026-10-24).
 *
 * - 허용 출처는 **고정 목록**이다 (`allowedOrigins`). 와일드카드 금지 — 로컬 서버라도 브라우저가 붙을 수 있고,
 *   아무 페이지나 이 API를 부르게 두면 그 페이지가 내 기록을 통째로 읽는다
 * - ⚠️ "같은 출처"를 요청의 `Host`로 판단하지 않는다 — DNS 리바인딩이면 `Host`·`Origin`이 둘 다
 *   `evil.example:포트`라 같은 출처로 보인다 (보안 점검 2026-10-25). 포트는 서버가 실제로 연 값이다
 * - 다른 출처는 **403 "Invalid CORS request"** (스프링 문구 그대로 — 응답을 숨기는 게 아니라 처리 자체를 안 한다)
 * - 출처가 없는 요청(같은 출처 GET·curl·메인 프로세스)은 통과 — 그건 토큰(`guard.ts`)이 막는다
 * - dev 프로필도 건다 — 개발 화면(:3000)이 프록시로 붙을 때 `Origin`이 `localhost:3000`이라 목록에 넣는다.
 *   예전처럼 끄면 개발 중에 아무 사이트나 `text/plain` POST로 실데이터 DB를 고칠 수 있었다
 * - 자격증명은 안 싣는다 (로그인이 없다). 사전 요청은 하루 캐시
 */
import type { MiddlewareHandler } from "hono";
import { config } from "../config";
import { listenPort } from "./guard";

export const APP_ORIGIN = "app://starlog";
const METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const MAX_AGE = "86400";
const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

/** 서버 자신(창이 `http://127.0.0.1:포트`로 옮겨온 경우) — CORS 머리글이 필요 없는 같은 출처 */
function selfOrigins() {
  const p = listenPort();
  return [`http://127.0.0.1:${p}`, `http://localhost:${p}`];
}

export function allowedOrigins(): string[] {
  return [APP_ORIGIN, ...selfOrigins(), ...(config().devProfile ? DEV_ORIGINS : [])];
}

export const desktopCors: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin === undefined || selfOrigins().includes(origin)) return next();

  const vary = "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
  if (!allowedOrigins().includes(origin)) {
    return c.text("Invalid CORS request", 403, { Vary: vary });
  }
  const preflight = c.req.method === "OPTIONS" && c.req.header("Access-Control-Request-Method");
  if (preflight) {
    const headers: Record<string, string> = {
      Vary: vary,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": METHODS,
      "Access-Control-Max-Age": MAX_AGE,
    };
    // 요청한 머리글을 그대로 연다 — `X-Starlog-Token`·`Content-Type`이 여기로 온다. 출처는 위에서 이미 걸렀다
    const requested = c.req.header("Access-Control-Request-Headers");
    if (requested) headers["Access-Control-Allow-Headers"] = requested;
    return c.body(null, 200, headers);
  }
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", origin);
  c.res.headers.append("Vary", vary);
};
