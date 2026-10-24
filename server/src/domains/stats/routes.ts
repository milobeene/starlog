import { Hono } from "hono";
import type { AppEnv } from "../../http/env";

/** 자바 `stats` 패키지의 컨트롤러들. TODO(P2 stats) */
export const routes = new Hono<AppEnv>();
