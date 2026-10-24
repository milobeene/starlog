/**
 * 마스터 게임 — 자바 `GameController` (`/api/games`).
 *
 * 회원 식별이 없는 유일한 구역이다 — 마스터는 공용 데이터라 내 것/남의 것이 없다.
 * `/api/admin`이 사라지며 이름·정보 수정·재동기화·삭제가 여기로 합쳐졌다 (1인 앱이라 인가가 없다).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/env";
import { readBody, violations } from "../../http/body";
import { pathId, query } from "../../http/params";
import { money, type Money } from "../../common/money";
import { opt, zDate, zMoney, zText } from "../../common/schemas";
import { isJavaBlank } from "../system/service";
import {
  deleteGame, masterPage, outdatedGames, registerManual, resyncGame, searchGames, syncMasterInfo, updateGameName,
} from "./service";

const zStrList = opt(z.array(zText.nullable()));

const ManualGameRequest = z.object({
  name: opt(zText),
  developers: zStrList,
  publishers: zStrList,
  genres: zStrList,
  releasedOn: opt(zDate),
  listPrice: zMoney,
});

const GameNameUpdateRequest = z.object({ name: opt(zText) });

const MasterInfoUpdateRequest = z.object({
  developers: zStrList,
  publishers: zStrList,
  genres: zStrList,
  releasedOn: opt(zDate),
  listPrice: zMoney,
});

/** `MoneyRequest.toMoney` — 금액이 없으면 통째로 없는 것. 컨트롤러에서 서비스보다 **먼저** 돈다 (검증 순서) */
function toMoney(m: z.output<typeof zMoney>): Money | null {
  if (m === null || m === undefined || m.amount === null || m.amount === undefined) return null;
  return money(m.amount, m.currency ?? null);
}

function validateName(name: string | null) {
  violations()
    .notBlank("name", name, "게임명은 필수입니다")
    .size("name", name, 0, 300, "게임명이 너무 깁니다")
    .throwIfAny();
}

export const routes = new Hono<AppEnv>();

/** 검색 — 로컬 수동 등록 + IGDB. 빈 검색어는 IGDB를 안 부른다 */
routes.get("/api/games", async (c) => {
  const q = query(c).str("q");
  if (q === null || isJavaBlank(q)) return c.json([]);
  return c.json(await searchGames(q));
});

/** 마스터 목록·검색 — "이미 내 DB에 있는 것"만. IGDB를 섞지 않고 페이지가 있다 */
routes.get("/api/games/master", async (c) => {
  const q = query(c);
  const keyword = q.str("q");
  const pageNo = q.int("page", 0);
  const size = q.int("size", 30);
  return c.json(await masterPage(keyword, pageNo, size));
});

/** 일괄 동기화 대상. 먼저 목록을 주고 승인을 받는다 — 화면이 한 건씩 `/resync`를 부른다 */
routes.get("/api/games/outdated", async (c) => c.json(await outdatedGames()));

/** 수동 등록 (FR-GAME-04). IGDB 키가 없어도 앱이 쓸모 있게 하는 길 */
routes.post("/api/games", async (c) => {
  const r = await readBody(c, ManualGameRequest);
  validateName(r.name);
  const listPrice = toMoney(r.listPrice);
  const id = await registerManual(r.name, {
    developers: r.developers, publishers: r.publishers, genres: r.genres, releasedOn: r.releasedOn, listPrice,
  });
  c.header("Location", `/api/games/${id}`);
  return c.json({ id }, 201);
});

/** 마스터 게임명 수정 + 전파 */
routes.put("/api/games/:gameId/name", async (c) => {
  const gameId = pathId(c, "gameId");
  const r = await readBody(c, GameNameUpdateRequest);
  validateName(r.name);
  return c.json({ updatedEntries: await updateGameName(gameId, r.name) });
});

/** 마스터 정보 수정 + 전파 (전체 교체). 개인 오버라이드는 안 건드린다 */
routes.put("/api/games/:gameId", async (c) => {
  const gameId = pathId(c, "gameId");
  const r = await readBody(c, MasterInfoUpdateRequest);
  const listPrice = toMoney(r.listPrice);
  const updated = await syncMasterInfo(gameId, {
    developers: r.developers, publishers: r.publishers, genres: r.genres, releasedOn: r.releasedOn, listPrice,
  });
  return c.json({ updatedEntries: updated });
});

/** 외부 DB 재동기화. POST인 이유 — `last_synced_at`이 매번 바뀐다 */
routes.post("/api/games/:gameId/resync", async (c) => {
  const gameId = pathId(c, "gameId");
  return c.json(await resyncGame(gameId));
});

/** 마스터 완전 삭제 — 담긴 기록까지. 경고는 화면이 띄운다 */
routes.delete("/api/games/:gameId", async (c) => {
  const gameId = pathId(c, "gameId");
  return c.json({ deletedEntries: await deleteGame(gameId) });
});
