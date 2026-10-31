/**
 * 스팀 앱 ↔ 항목 연결 (`/api/steam-links`). 계약은 `service.ts` 머리말.
 * 고정 경로(`/resolve`)가 변수 경로(`/:appid`)보다 먼저.
 */
import { Hono } from "hono";
import { z } from "zod";
import { readBody } from "../../http/body";
import { zLong, zText } from "../../common/schemas";
import { InvalidInput } from "../../common/errors";
import { db } from "../../db/client";
import { checkAppids, removeLink, requireAppid, resolveLinks, setManualLink } from "./service";

const ResolveRequest = z.object({ appids: z.array(zText) });
const LinkRequest = z.object({ entryId: zLong });

export const routes = new Hono();

routes.post("/api/steam-links/resolve", async (c) => {
  const { appids } = await readBody(c, ResolveRequest);
  return c.json({ links: await resolveLinks(db(), checkAppids(appids)) });
});

routes.put("/api/steam-links/:appid", async (c) => {
  const appid = requireAppid(c.req.param("appid"));
  const { entryId } = await readBody(c, LinkRequest);
  if (!Number.isSafeInteger(entryId) || entryId < 1) throw new InvalidInput("entryId: 항목 번호가 올바르지 않습니다");
  return c.json(await setManualLink(db(), appid, entryId));
});

routes.delete("/api/steam-links/:appid", async (c) => {
  await removeLink(db(), requireAppid(c.req.param("appid")));
  return c.body(null, 204);
});
