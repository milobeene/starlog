import type { Hono } from "hono";

/** 요청마다 붙는 값. `c.get("memberId")` */
export type AppEnv = { Variables: { memberId: number } };
export type Router = Hono<AppEnv>;
