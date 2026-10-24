/**
 * HTTP 앱 — 라우트 조립과 전역 오류 처리.
 *
 * 각 도메인의 `routes`는 **전체 경로**(`/api/...`)로 라우트를 건다. 여기선 붙이기만 한다.
 * ⚠️ 같은 자리에 고정 경로와 변수 경로가 겹치면(`/api/backlog/all` vs `/api/backlog/:id`)
 * **고정 경로를 먼저 등록한다.** 스프링은 더 구체적인 쪽을 고르지만 Hono는 등록 순서다.
 */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { AppError, ConstraintViolation, FileTooLarge, isIntegrityViolation } from "./common/errors";
import type { AppEnv } from "./http/env";
import { ownerMiddleware } from "./http/owner";
import { desktopCors } from "./http/cors";
import { serveStatic } from "./http/static";
import { routes as tag } from "./domains/tag/routes";
import { routes as subscription } from "./domains/subscription/routes";
import { routes as platform } from "./domains/platform/routes";
import { routes as game } from "./domains/game/routes";
import { routes as stats } from "./domains/stats/routes";
import { routes as system } from "./domains/system/routes";
import { routes as backlog } from "./domains/backlog/routes";
import { routes as member } from "./domains/member/routes";

/** 요청 본문 상한 (260MB) — 스크린샷·영상 업로드. 기존 `max-request-size`와 같은 값 */
const MAX_REQUEST_BYTES = 260 * 1024 * 1024;

/** 스프링 기본 오류 본문(timestamp·status·error·path) — 우리 핸들러가 못 잡은 예외(진짜 버그)일 때 */
function springError(c: Context, status: 404 | 500, error: string) {
  return c.json({ timestamp: new Date().toISOString(), status, error, path: c.req.path }, status);
}

export function createApp(opts: { staticDir: string | null }) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof AppError) {
      if (err.status >= 500) console.error(`[${c.req.method} ${c.req.path}] ${err.code}`, (err as { cause?: unknown }).cause ?? err);
      return c.json(err.body(), err.status as 400);
    }
    if (isIntegrityViolation(err)) {
      const e = new ConstraintViolation();
      return c.json(e.body(), 409);
    }
    if (err instanceof HTTPException && err.status === 413) {
      const e = new FileTooLarge();
      return c.json(e.body(), 413);
    }
    console.error(`[${c.req.method} ${c.req.path}] 처리 못 한 예외`, err);
    return springError(c, 500, "Internal Server Error");
  });

  // CORS가 맨 앞 — 남의 출처면 본문도 주인도 보지 않고 거절한다
  app.use("/api/*", desktopCors);
  app.use("/api/*", bodyLimit({ maxSize: MAX_REQUEST_BYTES, onError: () => { throw new FileTooLarge(); } }));
  app.use("/api/*", ownerMiddleware);

  for (const r of [tag, subscription, platform, game, stats, system, backlog, member]) app.route("/", r);

  app.all("/api/*", (c) => springError(c, 404, "Not Found"));
  if (opts.staticDir) app.get("*", serveStatic(opts.staticDir));
  return app;
}
