/**
 * 데스크탑 CORS — 스프링 `DefaultCorsProcessor`와 같은 동작.
 *
 * **창은 평생 `app://starlog` 한 장이고 서버는 API만 준다** (2026-08-28 결정).
 * 입구 ↔ 앱을 오갈 때마다 문서가 통째로 바뀌면 검은 화면이 번쩍이고 배경 연출이 끊겨서다.
 * 그래서 화면 → API는 **교차 출처 요청**이고 이 파일이 그걸 연다.
 *
 * ⚠️ 한때 이걸 "같은 출처라 필요 없다"며 빠뜨렸다 — 앱이 배경만 남은 검은 화면이 됐다 (2026-10-24).
 *
 * - 허용 출처는 `app://starlog` **하나**. 와일드카드 금지 — 로컬 서버라도 브라우저가 붙을 수 있고,
 *   아무 페이지나 이 API를 부르게 두면 그 페이지가 내 기록을 통째로 읽는다
 * - 다른 출처는 **403 "Invalid CORS request"** (스프링 문구 그대로 — 응답을 숨기는 게 아니라 처리 자체를 안 한다)
 * - 같은 출처(`http://127.0.0.1:포트`에서 온 요청)와 출처가 없는 요청은 그냥 통과
 * - 자격증명은 안 싣는다 (로그인이 없다). 사전 요청은 하루 캐시
 */
import type { MiddlewareHandler } from "hono";
import { config } from "../config";

export const APP_ORIGIN = "app://starlog";
const METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const MAX_AGE = "86400";

function sameOrigin(origin: string, requestUrl: string) {
  try {
    const o = new URL(origin), r = new URL(requestUrl);
    return o.protocol === r.protocol && o.host === r.host;
  } catch {
    return false;
  }
}

export const desktopCors: MiddlewareHandler = async (c, next) => {
  if (!config().desktopCors) return next();
  const origin = c.req.header("Origin");
  if (!origin || sameOrigin(origin, c.req.url)) return next();

  const vary = "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
  if (origin !== APP_ORIGIN) {
    return c.text("Invalid CORS request", 403, { Vary: vary });
  }
  const preflight = c.req.method === "OPTIONS" && c.req.header("Access-Control-Request-Method");
  if (preflight) {
    const headers: Record<string, string> = {
      Vary: vary,
      "Access-Control-Allow-Origin": APP_ORIGIN,
      "Access-Control-Allow-Methods": METHODS,
      "Access-Control-Max-Age": MAX_AGE,
    };
    const requested = c.req.header("Access-Control-Request-Headers");
    if (requested) headers["Access-Control-Allow-Headers"] = requested;
    return c.body(null, 200, headers);
  }
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", APP_ORIGIN);
  c.res.headers.append("Vary", vary);
};
