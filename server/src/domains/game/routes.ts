import { Hono } from "hono";
import type { AppEnv } from "../../http/env";

/** 자바 `game` 패키지의 컨트롤러들. TODO(P2 game) */
export const routes = new Hono<AppEnv>();
