/**
 * 백로그 — 자바 `BacklogController`·`PlaythroughController`·`AcquisitionController`.
 *
 * ⚠️ 고정 경로(`/api/backlog/cards` 등)를 변수 경로(`/api/backlog/:entryId`)보다 **먼저** 건다.
 * 스프링은 리터럴을 고르지만 Hono는 등록 순서다.
 *
 * 커버·스크린샷 파일 처리는 `media.ts`, 멀티파트·Range 응답은 `http.ts`.
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
import { addToBacklog } from "./entry";
import {
  confirmExternalCover, deleteCover, deleteScreenshots, listScreenshots, mediaContentTypeOf, prepareCover, readLocalCover,
  resolveScreenshot, saveLocalCover, saveScreenshot, screenshotFolderPath,
} from "./media";
import { firstFile, firstText, missingPart, multipartFile, multipartForm, parseLongParam, sendFile } from "./http";
import { findOwnedAlive404 } from "./shared";
import { resolveGame } from "../game/service";
import { translateGame } from "../system/service";
import { fileStorage } from "../../common/storage";
import { addAcquisition, deleteAcquisition, updateAcquisition } from "./acquisition";

export const routes = new Hono<AppEnv>();


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

const BacklogAddRequest = z.object({ gameId: opt(zLong), externalId: opt(zText) });
/** `long sizeBytes`(원시형) — Jackson 3은 없거나 null이면 읽기 실패다 (FAIL_ON_NULL_FOR_PRIMITIVES) */
const CoverUploadUrlRequest = z.object({ fileName: opt(zText), sizeBytes: zLong });
const CoverConfirmRequest = z.object({ storageKey: opt(zText) });
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
  // 커밋 뒤에 스토리지에서 지운다 (실패는 삼킨다). ⚠️ 자바 버그 그대로 — LOCAL 커버여도 스토리지 쪽을 부르고
  // 호출 기록도 안 남긴다. 로컬 파일은 고아로 남는다
  if (coverKey !== null) await fileStorage().delete(coverKey);
  return c.body(null, 204);
});

routes.get("/api/backlog/companies", async (c) => c.json(await db().transaction((tx) => findCompanies(tx, c.get("memberId")))));

/**
 * 담기. 게임 해석(IGDB 캐시 — 외부 호출과 호출 기록)이 **트랜잭션 밖에서** 먼저 돈다.
 * 외부가 죽으면 거기서 502로 끝나 백로그 쪽은 아무것도 안 쓴다 (FR-SYS-04)
 */
routes.post("/api/backlog", async (c) => {
  const memberId = c.get("memberId");
  const r = await readBodyExact(c, BacklogAddRequest);
  // `@AssertTrue isTargetPresent()` — 프로퍼티 이름이 targetPresent가 된다
  violations().when(r.gameId === null && normalize(r.externalId) === null,
    "targetPresent", "gameId 또는 externalId 중 하나는 필요합니다").throwIfAny();
  const gameId = await resolveGame(db(), r.gameId, r.externalId);
  const entryId = await db().transaction((tx) => addToBacklog(tx, memberId, gameId));
  c.header("Location", `/api/backlog/${entryId}`);
  return c.json({ id: entryId }, 201);
});

routes.get("/api/backlog/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await db().transaction((tx) => findDetail(tx, c.get("memberId"), entryId)));
});

// ───────────── 커버 ─────────────

/** 1단계 — 어디에 어떻게 올릴지. EXTERNAL이면 프론트는 응답의 contentType 그대로 PUT해야 한다 (서명에 들어 있다) */
routes.post("/api/backlog/:entryId/cover/upload-url", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, CoverUploadUrlRequest);
  violations()
    .notBlank("fileName", r.fileName, "파일 이름은 필수입니다")
    .positive("sizeBytes", r.sizeBytes, "파일 크기가 올바르지 않습니다")
    .throwIfAny();
  return c.json(await prepareCover(c.get("memberId"), entryId, r.fileName, r.sizeBytes));
});

/** 2단계 — EXTERNAL 확정. 같은 key로 여러 번 불러도 결과가 같아서 PUT */
routes.put("/api/backlog/:entryId/cover", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, CoverConfirmRequest);
  violations().notBlank("storageKey", r.storageKey, "storageKey는 필수입니다").throwIfAny();
  await confirmExternalCover(c.get("memberId"), entryId, r.storageKey);
  return c.body(null, 200);
});

/** LOCAL 업로드 — 바이트가 백엔드를 지나간다 */
routes.post("/api/backlog/:entryId/cover/file", async (c) => {
  const entryId = pathId(c, "entryId");
  const file = await multipartFile(c, "file");
  if (!file) return missingPart(c);
  await saveLocalCover(c.get("memberId"), entryId, file.name, new Uint8Array(await file.arrayBuffer()));
  return c.body(null, 200);
});

/** LOCAL 원본. `?v=`는 서버가 안 읽는다 — 교체해도 주소가 같아서 브라우저 캐시를 깨려고 붙인 값이다 */
routes.get("/api/backlog/:entryId/cover/file", async (c) => {
  const entryId = pathId(c, "entryId");
  const file = await readLocalCover(c.get("memberId"), entryId);
  return c.body(new Uint8Array(file.bytes), 200, {
    "Content-Type": file.contentType,
    "Cache-Control": "private, max-age=31536000, immutable",
  });
});

/** 삭제 — 마스터 커버로 폴백된다 */
routes.delete("/api/backlog/:entryId/cover", async (c) => {
  const entryId = pathId(c, "entryId");
  await deleteCover(c.get("memberId"), entryId);
  return c.body(null, 204);
});

// ───────────── 스크린샷 (DB를 안 본다 — 폴더가 곧 목록) ─────────────

routes.get("/api/backlog/:entryId/screenshots", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await listScreenshots(c.get("memberId"), entryId));
});

/** 한 장 저장. `takenAt`은 브라우저가 읽은 원본 파일의 수정시각 (스프링은 쿼리와 폼 필드를 같이 본다) */
routes.post("/api/backlog/:entryId/screenshots", async (c) => {
  const entryId = pathId(c, "entryId");
  const form = await multipartForm(c);
  const file = firstFile(form, "file");
  if (!file) return missingPart(c);
  const takenAtRaw = c.req.query("takenAt") ?? firstText(form, "takenAt");
  const takenAt = takenAtRaw === undefined || takenAtRaw.trim() === "" ? null : parseLongParam("takenAt", takenAtRaw);
  return c.json(await saveScreenshot(c.get("memberId"), entryId, file.name, new Uint8Array(await file.arrayBuffer()), takenAt));
});

/** 탐색기로 열 경로 — `{fileName}`보다 먼저 건다 */
routes.get("/api/backlog/:entryId/screenshots/folder", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json({ path: await screenshotFolderPath(c.get("memberId"), entryId) });
});

/**
 * 원본. 영상이 200MB까지라 통째로 읽지 않고 흘려보내고, **Range를 받는다** — 안 받으면 재생 막대를 못 끈다
 * (자바는 `Resource`를 돌려줘 스프링이 Range를 처리했다)
 */
routes.get("/api/backlog/:entryId/screenshots/:fileName", async (c) => {
  const entryId = pathId(c, "entryId");
  const fileName = c.req.param("fileName");
  const file = await resolveScreenshot(c.get("memberId"), entryId, fileName);
  return sendFile(c, file, mediaContentTypeOf(fileName));
});

/** 일괄 삭제. DELETE에 본문을 싣는 건 회색지대라 POST */
routes.post("/api/backlog/:entryId/screenshots/delete", async (c) => {
  const entryId = pathId(c, "entryId");
  const names = await readBodyExact(c, z.array(zText.nullable()));
  return c.json({ deleted: await deleteScreenshots(c.get("memberId"), entryId, names) });
});

/** 소개문 번역 — 항목 경로라 소유권 검증이 따라온다. 남의 항목 번호로는 못 부른다 */
routes.post("/api/backlog/:entryId/translate", async (c) => {
  const entryId = pathId(c, "entryId");
  const gameId = await db().transaction(async (tx) => (await findOwnedAlive404(tx, c.get("memberId"), entryId)).gameId);
  return c.json(await translateGame(gameId));   // 구글 호출은 트랜잭션 밖
});

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
