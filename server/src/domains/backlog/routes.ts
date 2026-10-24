/**
 * 백로그 — 자바 `BacklogController`·`PlaythroughController`·`AcquisitionController`.
 *
 * ⚠️ 고정 경로(`/api/backlog/cards` 등)를 변수 경로(`/api/backlog/:entryId`)보다 **먼저** 건다.
 * 스프링은 리터럴을 고르지만 Hono는 등록 순서다.
 *
 * 2차로 미룬 것(게임 생성·커버·스크린샷·번역)은 경로만 걸어 두고 `P2 backlog phase 2`로 던진다.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../http/env";
import { db } from "../../db/client";
import { violations, DEFAULT_MSG } from "../../http/body";
import { pathId, query } from "../../http/params";
import { InvalidInput } from "../../common/errors";
import { normalize } from "../../common/text";
import { opt, zDate, zDecimal, zLong, zMoney, zText } from "../../common/schemas";
import {
  ACQUISITION_METHODS, BACKLOG_STATUSES, PLAYTHROUGH_STATUSES, elementSizeViolations, readBodyExact,
} from "./shared";
import {
  findAllCards, findCompanies, findDeleted, findDeletedDetail, findDetail, findFacets, findNames, search, sortFrom,
  type SearchCondition,
} from "./query";
import { purge, revive, softDelete, toMoney, updateOverrides, updatePersonalRecord } from "./entry";
import { changeTag, replaceGenres } from "../tag/service";
import { addPlaythrough, deletePlaythrough, updatePlaythrough } from "./playthrough";
import { addAcquisition, deleteAcquisition, updateAcquisition } from "./acquisition";

export const routes = new Hono<AppEnv>();

/** 2차에서 채울 자리 — 게임 생성(game)·저장소(common/storage)·번역(system)이 생긴 뒤 */
const phase2 = () => { throw new Error("P2 backlog phase 2"); };

// ───────────── 요청 모양 ─────────────

const zStringList = opt(z.array(zText.nullable()));

const PersonalRecordRequest = z.object({
  rating: opt(zDecimal.transform(String)),
  playTimeHours: opt(zDecimal.transform(String)),
  memo: opt(zText),
});

const OverrideUpdateRequest = z.object({
  name: opt(zText),
  developers: zStringList,
  publishers: zStringList,
  releasedOn: opt(zDate),
  listPrice: zMoney,
});

const TagUpdateRequest = z.object({ name: opt(zText) });
const NameListRequest = z.object({ names: zStringList });

const PlaythroughRequest = z.object({
  startedOn: opt(zDate),
  finishedOn: opt(zDate),
  status: opt(z.enum(PLAYTHROUGH_STATUSES)),
  deviceId: opt(zLong),
  platformId: opt(zLong),
  platformAccountId: opt(zLong),
  emulatorId: opt(zLong),
  inputMethodId: opt(zLong),
  label: opt(zText),
});
type PlaythroughRequest = z.output<typeof PlaythroughRequest>;

const AcquisitionRequest = z.object({
  method: opt(z.enum(ACQUISITION_METHODS)),
  platformId: opt(zLong),
  platformAccountId: opt(zLong),
  subscriptionId: opt(zLong),
  price: zMoney,
  acquiredOn: opt(zDate),
  label: opt(zText),
});
type AcquisitionRequest = z.output<typeof AcquisitionRequest>;

async function playthroughBody(c: Context) {
  const r: PlaythroughRequest = await readBodyExact(c, PlaythroughRequest);
  violations()
    .notNull("startedOn", r.startedOn, DEFAULT_MSG.notNull)
    .notNull("status", r.status, DEFAULT_MSG.notNull)
    .size("label", r.label, 0, 100, DEFAULT_MSG.size(0, 100))
    .throwIfAny();
  return r;
}

async function acquisitionBody(c: Context) {
  const r: AcquisitionRequest = await readBodyExact(c, AcquisitionRequest);
  violations()
    .notNull("method", r.method, DEFAULT_MSG.notNull)
    .size("label", r.label, 0, 100, DEFAULT_MSG.size(0, 100))
    .throwIfAny();
  const amount = r.price?.amount;
  return {
    method: r.method,
    platformId: r.platformId,
    platformAccountId: r.platformAccountId,
    subscriptionId: r.subscriptionId,
    priceAmount: amount === null || amount === undefined ? null : String(amount),
    priceCurrency: r.price?.currency ?? null,
    acquiredOn: r.acquiredOn,
    label: r.label,
  };
}

// ───────────── 목록·조회 (고정 경로 먼저) ─────────────

/**
 * 목록. 스프링은 인자를 선언 순서대로 바인딩하다 첫 실패에서 400을 낸다 — 같은 순서로 읽는다
 */
routes.get("/api/backlog", async (c) => {
  const q = query(c);
  const condition: SearchCondition = {
    keyword: normalize(q.str("q")),
    statuses: q.enumList("status", BACKLOG_STATUSES) ?? [],
    tagId: q.long("tagId"),
    genreId: q.long("genreId"),
    genreName: normalize(q.str("genreName")),
    developer: normalize(q.str("developer")),
    releaseYear: q.int("releaseYear"),
    ptDeviceId: q.long("ptDeviceId"),
    ptPlatformId: q.long("ptPlatformId"),
    ptEmulatorId: q.long("ptEmulatorId"),
    ptAccountId: q.long("ptAccountId"),
    ptFrom: q.date("ptFrom"),
    ptTo: q.date("ptTo"),
    acqMethod: q.enumOf("acqMethod", ACQUISITION_METHODS),
    acqCurrency: normalize(q.str("acqCurrency")),
    acqMinPrice: q.decimal("acqMinPrice"),
    acqMaxPrice: q.decimal("acqMaxPrice"),
    acqPlatformId: q.long("acqPlatformId"),
    acqAccountId: q.long("acqAccountId"),
    acqFrom: q.date("acqFrom"),
    acqTo: q.date("acqTo"),
  };
  const page = q.int("page", 0);
  const size = q.int("size", 20);
  const rawSort = q.str("sort");
  // `defaultValue`는 빈 문자열에도 적용된다
  const sort = sortFrom(rawSort === null || rawSort === "" ? "lastPlayed" : rawSort);
  return c.json(await db().transaction((tx) => search(tx, c.get("memberId"), condition, page, size, sort)));
});

routes.get("/api/backlog/cards", async (c) => c.json(await db().transaction((tx) => findAllCards(tx, c.get("memberId")))));

routes.get("/api/backlog/facets", async (c) => c.json(await db().transaction((tx) => findFacets(tx, c.get("memberId")))));

routes.get("/api/backlog/names", async (c) => c.json(await findNames(db(), c.get("memberId"))));

routes.get("/api/backlog/deleted", async (c) => {
  const q = query(c);
  const page = q.int("page", 0), size = q.int("size", 10);
  return c.json(await db().transaction((tx) => findDeleted(tx, c.get("memberId"), page, size)));
});

routes.get("/api/backlog/deleted/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await db().transaction((tx) => findDeletedDetail(tx, c.get("memberId"), entryId)));
});

/** 완전 삭제 — 휴지통을 거친 것만 */
routes.delete("/api/backlog/deleted/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  const coverKey = await db().transaction((tx) => purge(tx, c.get("memberId"), entryId));
  if (coverKey !== null) {
    // TODO(P2 backlog phase 2): 커밋 뒤 스토리지에서 지운다 (`fileStorage.delete`, 실패는 삼킨다).
    // 미설정 스토리지에서는 자바도 아무것도 안 한다
  }
  return c.body(null, 204);
});

routes.get("/api/backlog/companies", async (c) => c.json(await db().transaction((tx) => findCompanies(tx, c.get("memberId")))));

/** 담기 — 게임 해석(IGDB 캐시)이 트랜잭션 밖에서 먼저 돈다 */
routes.post("/api/backlog", phase2);

routes.get("/api/backlog/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await db().transaction((tx) => findDetail(tx, c.get("memberId"), entryId)));
});

// ───────────── 커버·스크린샷·번역 (2차) ─────────────

routes.post("/api/backlog/:entryId/cover/upload-url", phase2);
routes.put("/api/backlog/:entryId/cover", phase2);
routes.post("/api/backlog/:entryId/cover/file", phase2);
routes.get("/api/backlog/:entryId/cover/file", phase2);
routes.delete("/api/backlog/:entryId/cover", phase2);
routes.get("/api/backlog/:entryId/screenshots", phase2);
routes.post("/api/backlog/:entryId/screenshots", phase2);
// `folder`가 `{fileName}`보다 먼저
routes.get("/api/backlog/:entryId/screenshots/folder", phase2);
routes.get("/api/backlog/:entryId/screenshots/:fileName", phase2);
routes.post("/api/backlog/:entryId/screenshots/delete", phase2);
routes.post("/api/backlog/:entryId/translate", phase2);

// ───────────── 항목 쓰기 ─────────────

/** 되살리기. 멱등하지 않아서(이미 살아 있으면 409) POST */
routes.post("/api/backlog/:entryId/revive", async (c) => {
  const entryId = pathId(c, "entryId");
  await db().transaction((tx) => revive(tx, c.get("memberId"), entryId));
  return c.body(null, 200);
});

routes.delete("/api/backlog/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  await db().transaction((tx) => softDelete(tx, c.get("memberId"), entryId));
  return c.body(null, 204);
});

routes.put("/api/backlog/:entryId/personal-record", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, PersonalRecordRequest);
  // TEXT 컬럼이라 도메인 제한이 아니라 폭주 방지 상한이다
  violations().size("memo", r.memo, 0, 5000, DEFAULT_MSG.size(0, 5000)).throwIfAny();
  await db().transaction((tx) => updatePersonalRecord(tx, c.get("memberId"), entryId, r.rating, r.playTimeHours, r.memo));
  return c.body(null, 200);
});

routes.put("/api/backlog/:entryId/overrides", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, OverrideUpdateRequest);
  const errors = [
    ...(r.name !== null && r.name.length > 300 ? [`name: ${DEFAULT_MSG.size(0, 300)}`] : []),
    ...elementSizeViolations("developers", r.developers, 200, DEFAULT_MSG.size(0, 200)),
    ...elementSizeViolations("publishers", r.publishers, 200, DEFAULT_MSG.size(0, 200)),
  ];
  if (errors.length) throw new InvalidInput(errors.join(", "));
  // `toCommand()`가 컨트롤러에서 돈다 — 금액 오류가 소유권 확인보다 먼저다
  const listPrice = toMoney(r.listPrice);
  await db().transaction((tx) => updateOverrides(tx, c.get("memberId"), entryId, {
    name: r.name, developers: r.developers, publishers: r.publishers, releasedOn: r.releasedOn, listPrice,
  }));
  return c.body(null, 200);
});

routes.put("/api/backlog/:entryId/tag", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, TagUpdateRequest);
  violations().size("name", r.name, 0, 50, DEFAULT_MSG.size(0, 50)).throwIfAny();
  await db().transaction((tx) => changeTag(tx, c.get("memberId"), entryId, r.name));
  return c.body(null, 200);
});

routes.put("/api/backlog/:entryId/genres", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, NameListRequest);
  const errors = r.names === null ? [`names: ${DEFAULT_MSG.notNull}`]
    : elementSizeViolations("names", r.names, 50, DEFAULT_MSG.size(0, 50));
  if (errors.length) throw new InvalidInput(errors.join(", "));
  await db().transaction((tx) => replaceGenres(tx, c.get("memberId"), entryId, r.names!));
  return c.body(null, 200);
});

// ───────────── 회차 ─────────────

routes.post("/api/backlog/:entryId/playthroughs", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await playthroughBody(c);
  const id = await db().transaction((tx) => addPlaythrough(tx, c.get("memberId"), entryId, r));
  c.header("Location", `/api/playthroughs/${id}`);
  return c.json({ id }, 201);
});

routes.put("/api/playthroughs/:playthroughId", async (c) => {
  const playthroughId = pathId(c, "playthroughId");
  const r = await playthroughBody(c);
  await db().transaction((tx) => updatePlaythrough(tx, c.get("memberId"), playthroughId, r));
  return c.body(null, 200);
});

routes.delete("/api/playthroughs/:playthroughId", async (c) => {
  const playthroughId = pathId(c, "playthroughId");
  await db().transaction((tx) => deletePlaythrough(tx, c.get("memberId"), playthroughId));
  return c.body(null, 204);
});

// ───────────── 취득 ─────────────

routes.post("/api/backlog/:entryId/acquisitions", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await acquisitionBody(c);
  const id = await db().transaction((tx) => addAcquisition(tx, c.get("memberId"), entryId, r));
  c.header("Location", `/api/acquisitions/${id}`);
  return c.json({ id }, 201);
});

routes.put("/api/acquisitions/:acquisitionId", async (c) => {
  const acquisitionId = pathId(c, "acquisitionId");
  const r = await acquisitionBody(c);
  await db().transaction((tx) => updateAcquisition(tx, c.get("memberId"), acquisitionId, r));
  return c.body(null, 200);
});

routes.delete("/api/acquisitions/:acquisitionId", async (c) => {
  const acquisitionId = pathId(c, "acquisitionId");
  await db().transaction((tx) => deleteAcquisition(tx, c.get("memberId"), acquisitionId));
  return c.body(null, 204);
});
