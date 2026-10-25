/**
 * 백로그 — 항목·커버·스크린샷·회차·취득 라우트.
 *
 * ⚠️ 고정 경로(`/api/backlog/cards` 등)를 변수 경로(`/api/backlog/:entryId`)보다 **먼저** 건다.
 * Hono는 등록 순서대로 매칭해서, 뒤에 걸면 `cards`가 `:entryId`로 읽힌다.
 *
 * 커버·스크린샷 파일 처리는 `media.ts`, 멀티파트·Range 응답은 `http.ts`.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { DEFAULT_MSG, elementSizeViolations, readBodyExact, violations } from "../../http/body";
import { pathId, query } from "../../http/params";
import { InvalidInput } from "../../common/errors";
import { normalize } from "../../common/text";
import { opt, zDate, zDecimal, zLong, zMoney, zText } from "../../common/schemas";
import { ACQUISITION_METHODS, BACKLOG_STATUSES, PLAYTHROUGH_STATUSES } from "./shared";
import {
  findAllCards, findCompanies, findDeleted, findDeletedDetail, findDetail, findFacets, findNames, search, sortFrom,
  type SearchCondition,
} from "./query";
import { purge, revive, softDelete, toMoney, updateOverrides, updatePersonalRecord } from "./entry";
import { changeTag, replaceGenres } from "../tag/service";
import { addPlaythrough, deletePlaythrough, updatePlaythrough } from "./playthrough";
import { addToBacklog } from "./entry";
import {
  confirmExternalCover, deleteCover, deleteScreenshots, listGallery, listScreenshots, mediaContentTypeOf, prepareCover,
  readLocalCover, removeFile, resolveScreenshot, resolveThumb, saveLocalCover, saveScreenshot, screenshotFilePath,
  screenshotFolderPath,
} from "./media";
import { firstFile, firstText, missingPart, multipartFile, multipartForm, parseLongParam, sendFile } from "../../http/files";
import { findAliveEntry404 } from "./shared";
import { resolveGame } from "../game/service";
import { translateGame } from "../system/service";
import { addAcquisition, deleteAcquisition, updateAcquisition } from "./acquisition";
import { addPlayRecord, deletePlayRecord, listPlayRecords, updatePlayRecord } from "./playtime";

export const routes = new Hono();


// ───────────── 요청 모양 ─────────────

const zStringList = opt(z.array(zText.nullable()));

const PersonalRecordRequest = z.object({
  rating: opt(zDecimal.transform(String)),
  playTimeHours: opt(zDecimal.transform(String)),
  memo: opt(zText),
  /** 합계(분) — 오면 playTimeHours보다 우선 (v2 S4) */
  playTimeMinutes: opt(zDecimal.transform(String)),
  /** 이번에 한 만큼(분) → 추가 기록 */
  addMinutes: opt(zDecimal.transform(String)),
});

const PlayRecordRequest = z.object({
  minutes: opt(zDecimal.transform(String)),
  playedOn: opt(zDate),
  note: opt(zText),
});

async function playRecordBody(c: Context) {
  const r = await readBodyExact(c, PlayRecordRequest);
  violations()
    .notNull("minutes", r.minutes, DEFAULT_MSG.notNull)
    .size("note", r.note, 0, 100, DEFAULT_MSG.size(0, 100))
    .throwIfAny();
  return r;
}

const OverrideUpdateRequest = z.object({
  name: opt(zText),
  developers: zStringList,
  publishers: zStringList,
  releasedOn: opt(zDate),
  listPrice: zMoney,
});

const BacklogAddRequest = z.object({ gameId: opt(zLong), externalId: opt(zText) });
/** `sizeBytes`는 필수다 — 없거나 null이면 검증 전에 본문 읽기 실패(400)가 난다 */
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
 * 목록. 파라미터를 이 순서대로 읽는다 — 형식 오류가 여럿이면 첫 번째에서 400이 나므로 순서가 곧 오류 우선순위다
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
  // 빈 문자열도 기본값으로 취급한다
  const sort = sortFrom(rawSort === null || rawSort === "" ? "lastPlayed" : rawSort);
  return c.json(await db().transaction((tx) => search(tx, condition, page, size, sort)));
});

routes.get("/api/backlog/cards", async (c) => c.json(await db().transaction((tx) => findAllCards(tx))));

routes.get("/api/backlog/facets", async (c) => c.json(await db().transaction((tx) => findFacets(tx))));

routes.get("/api/backlog/names", async (c) => c.json(await findNames(db())));

routes.get("/api/backlog/deleted", async (c) => {
  const q = query(c);
  const page = q.int("page", 0), size = q.int("size", 10);
  return c.json(await db().transaction((tx) => findDeleted(tx, page, size)));
});

routes.get("/api/backlog/deleted/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await db().transaction((tx) => findDeletedDetail(tx, entryId)));
});

/** 완전 삭제 — 휴지통을 거친 것만 */
routes.delete("/api/backlog/deleted/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  const cover = await db().transaction((tx) => purge(tx, entryId));
  // 커밋 뒤에 위치를 보고 지운다 (실패는 삼킨다). 예전엔 LOCAL 커버도 스토리지 쪽만 불러 로컬 파일이 고아로 남았다 (고친 버그 15)
  if (cover !== null) await removeFile(cover);
  return c.body(null, 204);
});

routes.get("/api/backlog/companies", async (c) => c.json(await db().transaction((tx) => findCompanies(tx))));

/**
 * 담기. 게임 해석(IGDB 캐시 — 외부 호출과 호출 기록)이 **트랜잭션 밖에서** 먼저 돈다.
 * 외부가 죽으면 거기서 502로 끝나 백로그 쪽은 아무것도 안 쓴다 (FR-SYS-04)
 */
routes.post("/api/backlog", async (c) => {
  const r = await readBodyExact(c, BacklogAddRequest);
  // 검증 실패 필드 이름은 `targetPresent`다 (오류 메시지에 그대로 나간다)
  violations().when(r.gameId === null && normalize(r.externalId) === null,
    "targetPresent", "gameId 또는 externalId 중 하나는 필요합니다").throwIfAny();
  const gameId = await resolveGame(db(), r.gameId, r.externalId);
  const entryId = await db().transaction((tx) => addToBacklog(tx, gameId));
  c.header("Location", `/api/backlog/${entryId}`);
  return c.json({ id: entryId }, 201);
});

routes.get("/api/backlog/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await db().transaction((tx) => findDetail(tx, entryId)));
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
  return c.json(await prepareCover(entryId, r.fileName, r.sizeBytes));
});

/** 2단계 — EXTERNAL 확정. 같은 key로 여러 번 불러도 결과가 같아서 PUT */
routes.put("/api/backlog/:entryId/cover", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, CoverConfirmRequest);
  violations().notBlank("storageKey", r.storageKey, "storageKey는 필수입니다").throwIfAny();
  await confirmExternalCover(entryId, r.storageKey);
  return c.body(null, 200);
});

/** LOCAL 업로드 — 바이트가 백엔드를 지나간다 */
routes.post("/api/backlog/:entryId/cover/file", async (c) => {
  const entryId = pathId(c, "entryId");
  const file = await multipartFile(c, "file");
  if (!file) return missingPart(c);
  await saveLocalCover(entryId, file.name, new Uint8Array(await file.arrayBuffer()));
  return c.body(null, 200);
});

/** LOCAL 원본. `?v=`는 서버가 안 읽는다 — 교체해도 주소가 같아서 브라우저 캐시를 깨려고 붙인 값이다 */
routes.get("/api/backlog/:entryId/cover/file", async (c) => {
  const entryId = pathId(c, "entryId");
  const file = await readLocalCover(entryId);
  return c.body(new Uint8Array(file.bytes), 200, {
    "Content-Type": file.contentType,
    "Cache-Control": "private, max-age=31536000, immutable",
  });
});

/** 삭제 — 마스터 커버로 폴백된다 */
routes.delete("/api/backlog/:entryId/cover", async (c) => {
  const entryId = pathId(c, "entryId");
  await deleteCover(entryId);
  return c.body(null, 204);
});

// ───────────── 스크린샷 (DB를 안 본다 — 폴더가 곧 목록) ─────────────

/** 스크린샷 관리자 — 게임 전체 또는 하나, 사진·영상 거르기. 최신순 */
routes.get("/api/screenshots", async (c) => {
  const q = query(c);
  const entryId = q.long("entryId");
  const kind = q.enumOf("kind", ["ALL", "IMAGE", "VIDEO"] as const) ?? "ALL";
  return c.json(await listGallery(entryId, kind));
});

routes.get("/api/backlog/:entryId/screenshots", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await listScreenshots(entryId));
});

/** 한 장 저장. `takenAt`은 브라우저가 읽은 원본 파일의 수정시각 (쿼리와 폼 필드를 둘 다 본다) */
routes.post("/api/backlog/:entryId/screenshots", async (c) => {
  const entryId = pathId(c, "entryId");
  const form = await multipartForm(c);
  const file = firstFile(form, "file");
  if (!file) return missingPart(c);
  const takenAtRaw = c.req.query("takenAt") ?? firstText(form, "takenAt");
  const takenAt = takenAtRaw === undefined || takenAtRaw.trim() === "" ? null : parseLongParam("takenAt", takenAtRaw);
  return c.json(await saveScreenshot(entryId, file.name, new Uint8Array(await file.arrayBuffer()), takenAt));
});

/** 탐색기로 열 경로 — `{fileName}`보다 먼저 건다 */
routes.get("/api/backlog/:entryId/screenshots/folder", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json({ path: await screenshotFolderPath(entryId) });
});

/**
 * 원본. 영상이 200MB까지라 통째로 읽지 않고 흘려보내고, **Range를 받는다** — 안 받으면 재생 막대를 못 끈다
 */
routes.get("/api/backlog/:entryId/screenshots/:fileName", async (c) => {
  const entryId = pathId(c, "entryId");
  const fileName = c.req.param("fileName");
  const file = await resolveScreenshot(entryId, fileName);
  return sendFile(c, file, mediaContentTypeOf(fileName));
});

/** 썸네일 (JPEG, 긴 변 480). 없으면 이 요청에서 만든다. 못 만들면 404 — 화면은 원본으로 */
routes.get("/api/backlog/:entryId/screenshots/:fileName/thumb", async (c) => {
  const entryId = pathId(c, "entryId");
  const thumb = await resolveThumb(entryId, c.req.param("fileName"));
  return sendFile(c, thumb, "image/jpeg");
});

/** 실제 파일 경로 — 일렉트론 메인이 클립보드·저장에 쓴다 (화면이 준 경로를 안 믿고 여기서 받는다) */
routes.get("/api/backlog/:entryId/screenshots/:fileName/path", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json({ path: await screenshotFilePath(entryId, c.req.param("fileName")) });
});

/** 일괄 삭제. DELETE에 본문을 싣는 건 회색지대라 POST */
routes.post("/api/backlog/:entryId/screenshots/delete", async (c) => {
  const entryId = pathId(c, "entryId");
  const names = await readBodyExact(c, z.array(zText.nullable()));
  return c.json({ deleted: await deleteScreenshots(entryId, names) });
});

/** 소개문 번역 — 항목 경로라 살아 있는 항목인지 확인이 따라온다 */
routes.post("/api/backlog/:entryId/translate", async (c) => {
  const entryId = pathId(c, "entryId");
  const gameId = await db().transaction(async (tx) => (await findAliveEntry404(tx, entryId)).gameId);
  return c.json(await translateGame(gameId));   // 구글 호출은 트랜잭션 밖
});

// ───────────── 항목 쓰기 ─────────────

/** 되살리기. 멱등하지 않아서(이미 살아 있으면 409) POST */
routes.post("/api/backlog/:entryId/revive", async (c) => {
  const entryId = pathId(c, "entryId");
  await db().transaction((tx) => revive(tx, entryId));
  return c.body(null, 200);
});

routes.delete("/api/backlog/:entryId", async (c) => {
  const entryId = pathId(c, "entryId");
  await db().transaction((tx) => softDelete(tx, entryId));
  return c.body(null, 204);
});

routes.put("/api/backlog/:entryId/personal-record", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, PersonalRecordRequest);
  // TEXT 컬럼이라 도메인 제한이 아니라 폭주 방지 상한이다
  violations().size("memo", r.memo, 0, 5000, DEFAULT_MSG.size(0, 5000)).throwIfAny();
  await db().transaction((tx) => updatePersonalRecord(tx, entryId, r.rating,
    { hours: r.playTimeHours, minutes: r.playTimeMinutes, addMinutes: r.addMinutes }, r.memo));
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
  // 금액 변환을 항목 확인보다 먼저 한다 — 금액 오류가 먼저 나간다
  const listPrice = toMoney(r.listPrice);
  await db().transaction((tx) => updateOverrides(tx, entryId, {
    name: r.name, developers: r.developers, publishers: r.publishers, releasedOn: r.releasedOn, listPrice,
  }));
  return c.body(null, 200);
});

routes.put("/api/backlog/:entryId/tag", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, TagUpdateRequest);
  violations().size("name", r.name, 0, 50, DEFAULT_MSG.size(0, 50)).throwIfAny();
  await db().transaction((tx) => changeTag(tx, entryId, r.name));
  return c.body(null, 200);
});

routes.put("/api/backlog/:entryId/genres", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await readBodyExact(c, NameListRequest);
  const errors = r.names === null ? [`names: ${DEFAULT_MSG.notNull}`]
    : elementSizeViolations("names", r.names, 50, DEFAULT_MSG.size(0, 50));
  if (errors.length) throw new InvalidInput(errors.join(", "));
  await db().transaction((tx) => replaceGenres(tx, entryId, r.names!));
  return c.body(null, 200);
});

// ───────────── 플레이타임 기록 (v2 S4) ─────────────

/** STARLOG 기록 + homeops 일정, 최신순. homeops 것은 `editable: false` — 고치는 길이 아예 없다(표가 다르다) */
routes.get("/api/backlog/:entryId/play-records", async (c) => {
  const entryId = pathId(c, "entryId");
  return c.json(await db().transaction((tx) => listPlayRecords(tx, entryId)));
});

/** 추가(ADD)만. 직접 수정(ADJUST)은 개인 기록 저장에서 합계가 바뀔 때 생긴다 */
routes.post("/api/backlog/:entryId/play-records", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await playRecordBody(c);
  const id = await db().transaction((tx) => addPlayRecord(tx, entryId, r));
  c.header("Location", `/api/play-records/${id}`);
  return c.json({ id }, 201);
});

/** STARLOG 기록만 (`play_record`). homeops 일정 번호는 다른 표라 여기서 찾지 않는다 */
routes.put("/api/play-records/:recordId", async (c) => {
  const recordId = pathId(c, "recordId");
  const r = await playRecordBody(c);
  await db().transaction((tx) => updatePlayRecord(tx, recordId, r));
  return c.body(null, 200);
});

routes.delete("/api/play-records/:recordId", async (c) => {
  const recordId = pathId(c, "recordId");
  await db().transaction((tx) => deletePlayRecord(tx, recordId));
  return c.body(null, 204);
});

// ───────────── 회차 ─────────────

routes.post("/api/backlog/:entryId/playthroughs", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await playthroughBody(c);
  const id = await db().transaction((tx) => addPlaythrough(tx, entryId, r));
  c.header("Location", `/api/playthroughs/${id}`);
  return c.json({ id }, 201);
});

routes.put("/api/playthroughs/:playthroughId", async (c) => {
  const playthroughId = pathId(c, "playthroughId");
  const r = await playthroughBody(c);
  await db().transaction((tx) => updatePlaythrough(tx, playthroughId, r));
  return c.body(null, 200);
});

routes.delete("/api/playthroughs/:playthroughId", async (c) => {
  const playthroughId = pathId(c, "playthroughId");
  await db().transaction((tx) => deletePlaythrough(tx, playthroughId));
  return c.body(null, 204);
});

// ───────────── 취득 ─────────────

routes.post("/api/backlog/:entryId/acquisitions", async (c) => {
  const entryId = pathId(c, "entryId");
  const r = await acquisitionBody(c);
  const id = await db().transaction((tx) => addAcquisition(tx, entryId, r));
  c.header("Location", `/api/acquisitions/${id}`);
  return c.json({ id }, 201);
});

routes.put("/api/acquisitions/:acquisitionId", async (c) => {
  const acquisitionId = pathId(c, "acquisitionId");
  const r = await acquisitionBody(c);
  await db().transaction((tx) => updateAcquisition(tx, acquisitionId, r));
  return c.body(null, 200);
});

routes.delete("/api/acquisitions/:acquisitionId", async (c) => {
  const acquisitionId = pathId(c, "acquisitionId");
  await db().transaction((tx) => deleteAcquisition(tx, acquisitionId));
  return c.body(null, 204);
});
