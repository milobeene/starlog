import { Hono } from "hono";
import type { AppEnv } from "../../http/env";

/** 자바 `backlog` 패키지의 컨트롤러들. TODO(P2 backlog) */
export const routes = new Hono<AppEnv>();
