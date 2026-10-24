import type { Hono } from "hono";

/** 요청마다 붙는 값. `c.get("memberId")` — 자바 `@LoginMember Long memberId` 자리 */
export type AppEnv = { Variables: { memberId: number } };
export type Router = Hono<AppEnv>;
