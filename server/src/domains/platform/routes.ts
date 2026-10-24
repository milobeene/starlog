import { Hono } from "hono";
import type { AppEnv } from "../../http/env";

/** 자바 `platform` 패키지의 컨트롤러들. TODO(P2 platform) */
export const routes = new Hono<AppEnv>();
