/**
 * 커버·스크린샷.
 *
 * 스토리지 왕복은 **트랜잭션 밖**에서, DB는 짧은 트랜잭션으로. PGlite는 트랜잭션 동안 다른 요청을 다 세운다.
 * 스크린샷 한 장 쓰기·지우기는 로컬 디스크라 짧아서 폴더 이름을 정하는 트랜잭션 안에서 한다 (이름 경합을 같이 막는다)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, type Db } from "../../db/client";
import { rows } from "../../db/raw";
import { coverImage, game } from "../../db/schema";
import { FileIo, InvalidInput, NotFound } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { normalize } from "../../common/text";
import {
  STORAGE_LIMITS, coverTarget, coversDir, fileStorage, isExternalCoverKey, isLocalCoverName, isNewCoverKeyOf, isPlainFileName,
  isRealDirectory, localDelete, localExists, localList, localRead, localResolve, localSave, localSaveAs, mediaFolder,
  type CoverLocation,
} from "../../common/storage";
import {
  canMakeThumbs, dropThumb, ensureThumb, isFresh, knownFailure, mtimeMsOf, pointsIntoThumbs, pruneOrphans, thumbPathOf, warmThumb,
} from "../../common/storage/thumbs";
import { recordApiCall } from "../system/service";
import { assignMediaFolder, mediaSlugGiven, uniqueMediaSlug } from "../game/service";
import { findAliveEntry, findAliveEntry404 } from "./shared";
import { saveIfChanged } from "../../db/changes";

const MB = (n: number) => Math.floor(n / 1024 / 1024);

// ───────────── 형식 판정 ─────────────

const IMAGES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const VIDEOS: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** 앞 12바이트면 WebP(RIFF....WEBP)까지 판별된다 */
export const MAGIC_LENGTH = 12;

const startsWithAt = (head: Uint8Array, offset: number, expected: number[]) =>
  head.length >= offset + expected.length && expected.every((b, i) => head[offset + i] === b);

function magicMatches(head: Uint8Array, contentType: string): boolean {
  switch (contentType) {
    case "image/jpeg": return startsWithAt(head, 0, [0xff, 0xd8, 0xff]);
    case "image/png": return startsWithAt(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp": return startsWithAt(head, 0, [0x52, 0x49, 0x46, 0x46]) && startsWithAt(head, 8, [0x57, 0x45, 0x42, 0x50]);
    // ISO BMFF — 앞 4바이트는 박스 길이, 5~8바이트가 `ftyp`. mp4·mov는 같은 컨테이너다
    case "video/mp4": case "video/quicktime": return startsWithAt(head, 4, [0x66, 0x74, 0x79, 0x70]);
    case "video/webm": return startsWithAt(head, 0, [0x1a, 0x45, 0xdf, 0xa3]);   // EBML
    default: return false;
  }
}

/** 이름에서 확장자(소문자). 확장자가 없으면 400 — 커버·스크린샷 공통 앞부분 */
function extensionFrom(fileName: string | null): string {
  const normalized = normalize(fileName);
  if (normalized === null) throw new InvalidInput("파일 이름은 필수입니다");
  const dot = normalized.lastIndexOf(".");
  if (dot < 0 || dot === normalized.length - 1) throw new InvalidInput(`확장자가 없는 파일은 올릴 수 없습니다: ${fileName}`);
  return normalized.slice(dot + 1).toLowerCase();
}

/** 커버 — 발급 단계는 클라이언트가 **선언한** 크기를 본다 */
function coverContentType(fileName: string | null, size: number): string {
  const ext = extensionFrom(fileName);
  const contentType = IMAGES[ext];
  if (contentType === undefined) throw new InvalidInput(`지원하지 않는 형식입니다: ${ext} (jpg, png, webp만 가능)`);
  if (size <= 0) throw new InvalidInput("파일 크기가 올바르지 않습니다");
  if (size > STORAGE_LIMITS.maxUploadBytes) throw new InvalidInput(`파일이 너무 큽니다. 최대 ${MB(STORAGE_LIMITS.maxUploadBytes)}MB`);
  return contentType;
}

/** 커버 — 실물 확인. 확장자와 헤더는 클라이언트 마음대로라 첫 바이트를 본다 */
function validateStoredCover(size: number, head: Uint8Array, contentType: string) {
  if (size <= 0) throw new InvalidInput("업로드된 파일이 비어 있습니다");
  if (size > STORAGE_LIMITS.maxUploadBytes) throw new InvalidInput(`파일이 너무 큽니다. 최대 ${MB(STORAGE_LIMITS.maxUploadBytes)}MB`);
  if (!magicMatches(head, contentType)) throw new InvalidInput("이미지 파일이 아닙니다");
}

/** 스크린샷·영상 — 영상은 상한 자릿수가 다르다 */
function mediaContentType(fileName: string | null, size: number): string {
  const ext = extensionFrom(fileName);
  let contentType = IMAGES[ext];
  let limit: number = STORAGE_LIMITS.maxScreenshotBytes;
  if (contentType === undefined) { contentType = VIDEOS[ext]; limit = STORAGE_LIMITS.maxVideoBytes; }
  if (contentType === undefined) throw new InvalidInput(`지원하지 않는 형식입니다: ${ext} (jpg · png · webp · mp4 · mov · webm)`);
  if (size <= 0) throw new InvalidInput("파일 크기가 올바르지 않습니다");
  if (size > limit) throw new InvalidInput(`파일이 너무 큽니다. 최대 ${MB(limit)}MB`);
  return contentType;
}

export type MediaKind = "IMAGE" | "VIDEO";

/** 이미지·영상이 아니면 null (사람이 폴더에 넣은 `.DS_Store`·메모 따위) */
export function mediaKindOf(fileName: string): MediaKind | null {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return IMAGES[ext] ? "IMAGE" : VIDEOS[ext] ? "VIDEO" : null;
}

/** 확장자 → MIME. DB에 행이 없어서 이름에서 되돌린다 */
export function mediaContentTypeOf(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return IMAGES[ext] ?? VIDEOS[ext] ?? "application/octet-stream";
}

// ───────────── 커버 ─────────────

type CoverRow = typeof coverImage.$inferSelect;

/** 표시용 주소. LOCAL은 우리 엔드포인트(`?v=`로 캐시를 깬다), EXTERNAL은 버킷 공개 URL(미설정이면 null) */
export function coverPublicUrl(cover: { entryId: number; storageKey: string; location: string }): string | null {
  if (cover.location === "LOCAL") return `/api/backlog/${cover.entryId}/cover/file?v=${cover.storageKey}`;
  return fileStorage().publicUrl(cover.storageKey);
}

/**
 * 항목별 업로드 경로. V14 전에는 `covers/<회원>/<항목>/`이었다 — 이미 올라간 키는 커버 행이 통째로 들고 있어
 * 그대로 읽힌다. 새 모양에 `entry-`를 붙인 이유: `covers/<항목>/`로 두면 항목 1의 접두사가
 * 옛 키 `covers/1/…` 전부와 겹쳐 남의 옛 커버를 붙일 수 있다
 */
const keyPrefix = (entryId: number) => `covers/entry-${entryId}/`;

/**
 * 확장자 — **검증과 같은 문자열(strip한 이름)에서** 뽑는다. 원문을 쓰면 `"cover.png "`에서
 * `"png "`가 나와 확정 단계에서 항상 400이 된다
 */
const coverExtension = (fileName: string) => { const n = normalize(fileName)!; return n.slice(n.lastIndexOf(".") + 1).toLowerCase(); };

interface Replaced { storageKey: string; location: CoverLocation }

/** 0단계 — 어디에 어떻게 올릴지. EXTERNAL이면 허가증까지 함께 준다 */
export async function prepareCover(entryId: number, fileName: string | null, sizeBytes: number) {
  await db().transaction((tx) => findAliveEntry(tx, entryId));
  const contentType = coverContentType(fileName, sizeBytes);
  if (coverTarget() === "LOCAL") {
    return { mode: "LOCAL", uploadUrl: null, storageKey: null, contentType, expiresInSeconds: null };
  }
  const storageKey = keyPrefix(entryId) + crypto.randomUUID() + "." + coverExtension(fileName!);
  const upload = await fileStorage().presignUpload(storageKey, contentType, sizeBytes, STORAGE_LIMITS.uploadUrlTtlSeconds);
  return { mode: "EXTERNAL", uploadUrl: upload.uploadUrl, storageKey: upload.storageKey, contentType, expiresInSeconds: upload.expiresInSeconds };
}

/** 커버 행 붙이기 — 있으면 행을 갈아끼우지 않고 값만 바꾼다 (유니크 제약 아래 DELETE+INSERT 순서 함정) */
async function attach(entryId: number, storageKey: string, contentType: string,
                      sizeBytes: number, location: CoverLocation): Promise<Replaced | null> {
  return db().transaction(async (tx) => {
    await findAliveEntry(tx, entryId);
    const [existing] = await tx.select().from(coverImage).where(eq(coverImage.backlogEntryId, entryId));
    if (existing) {
      await saveIfChanged(tx, existing, { storageKey, contentType, sizeBytes, location },
        (patch) => tx.update(coverImage).set(patch).where(eq(coverImage.id, existing.id)));
      return { storageKey: existing.storageKey, location: existing.location as CoverLocation };
    }
    const now = nowKst();
    await tx.insert(coverImage).values({ backlogEntryId: entryId, storageKey, contentType, sizeBytes, location, createdAt: now, updatedAt: now });
    return null;
  });
}

/** 옛 파일 지우기 — **DB 커밋 뒤에.** 반대로 하면 DB엔 있는데 파일이 없는 최악이 나온다. 위치를 보고 갈라 지운다 */
export async function removeFile(target: Replaced) {
  // DB에 든 키라도 모양이 틀리면 건드리지 않는다 — `..`가 낀 키로 남의 객체·폴더 밖 파일을 지우는 걸 막는다. 남는 건 고아 파일뿐
  const valid = target.location === "LOCAL" ? isLocalCoverName(target.storageKey) : isExternalCoverKey(target.storageKey);
  if (!valid) { console.warn(`모양이 틀린 커버 키라 파일을 지우지 않는다. location=${target.location}`); return; }
  if (target.location === "LOCAL") { localDelete(coversDir(), target.storageKey); return; }
  // 실제로 부른 것만, 결과대로 센다 — 스토리지가 없으면 호출도 기록도 없다
  const ok = await fileStorage().delete(target.storageKey);
  if (ok !== null) await recordApiCall("STORAGE", "delete", ok);
}

/** EXTERNAL 확정. 클라이언트의 "올렸어요"를 안 믿고 HEAD와 매직 넘버로 실물을 본다 */
export async function confirmExternalCover(entryId: number, rawKey: string | null) {
  await db().transaction((tx) => findAliveEntry(tx, entryId));
  const storageKey = normalize(rawKey);
  if (storageKey === null) throw new InvalidInput("storageKey는 필수입니다");
  // 다른 항목의 key를 이 항목 커버로 붙이는 것을 막는다. `startsWith`는 `covers/entry-1/../entry-5/x.png`를 통과시켜서 모양 전체를 본다
  if (!isNewCoverKeyOf(entryId, storageKey)) throw new InvalidInput("이 항목의 업로드 경로가 아닙니다");

  const stored = await fileStorage().head(storageKey);    // 미설정이면 여기서 502 — 기록 전에 던진다
  await recordApiCall("STORAGE", "head", stored !== null);
  if (stored === null) throw new InvalidInput("업로드된 파일이 없습니다");
  const head = await fileStorage().readHead(storageKey, MAGIC_LENGTH);

  // 타입은 스토리지가 적어둔 값(=클라이언트가 보낸 값)이 아니라 확장자에서 우리가 정한다
  const contentType = coverContentType(storageKey, stored.sizeBytes);
  validateStoredCover(stored.sizeBytes, head, contentType);

  const previous = await attach(entryId, storageKey, contentType, stored.sizeBytes, "EXTERNAL");
  // PUT 재시도로 같은 key가 다시 오면 방금 붙인 객체를 지우게 된다 — 같은 key는 건너뛴다
  if (previous && !(previous.location === "EXTERNAL" && previous.storageKey === storageKey)) await removeFile(previous);
}

/** LOCAL 저장 — 바이트가 백엔드를 지나간다 (왕복 셋 → 하나) */
export async function saveLocalCover(entryId: number, fileName: string | null, bytes: Uint8Array) {
  await db().transaction((tx) => findAliveEntry(tx, entryId));
  const contentType = coverContentType(fileName, bytes.length);
  validateStoredCover(bytes.length, bytes.subarray(0, MAGIC_LENGTH), contentType);
  const stored = localSave(coversDir(), bytes, coverExtension(fileName!));
  const previous = await attach(entryId, stored, contentType, bytes.length, "LOCAL");
  if (previous) await removeFile(previous);
}

export async function readLocalCover(entryId: number) {
  const cover = await db().transaction(async (tx): Promise<CoverRow | undefined> => {
    await findAliveEntry(tx, entryId);
    const [row] = await tx.select().from(coverImage).where(eq(coverImage.backlogEntryId, entryId));
    return row;
  });
  if (!cover || cover.location !== "LOCAL") throw new InvalidInput("로컬 커버가 없습니다");
  return { bytes: localRead(coversDir(), cover.storageKey), contentType: cover.contentType };
}

/** 삭제 — 행을 지우고(커밋) 파일을 지운다. 최악이 고아 파일이다 (K-4) */
export async function deleteCover(entryId: number) {
  const target = await db().transaction(async (tx): Promise<Replaced | null> => {
    await findAliveEntry(tx, entryId);
    const [cover] = await tx.select().from(coverImage).where(eq(coverImage.backlogEntryId, entryId));
    if (!cover) return null;
    await tx.delete(coverImage).where(eq(coverImage.id, cover.id));
    return { storageKey: cover.storageKey, location: cover.location as CoverLocation };
  });
  if (target) await removeFile(target);
}

// ───────────── 스크린샷 ─────────────

/**
 * 게임의 스크린샷 폴더. 칸(`media_folder`)이 비었어도 이름으로 한 번 찾아본다 —
 * 폴더가 있으면 그게 이 게임 것이다 (`uniqueMediaSlug`가 남의 이름은 피해 간다).
 *
 * @param create  없으면 이름을 정할지. 목록·읽기는 안 정한다
 * @param persist 칸에 적은 값을 저장할지. 목록·읽기는 저장하지 않는다 (읽기 요청이 DB를 바꾸지 않게)
 */
async function folderOf(d: Db, entryId: number, create: boolean, persist: boolean): Promise<string | null> {
  const entry = await findAliveEntry404(d, entryId);
  const [g] = await d.select({ id: game.id, name: game.name, mediaFolder: game.mediaFolder }).from(game).where(eq(game.id, entry.gameId));
  if (g!.mediaFolder !== null) return vetted(mediaFolder(g!.mediaFolder), create);

  const candidate = await uniqueMediaSlug(d, g!);
  const folder = mediaFolder(candidate);
  if (isDirectory(folder)) {
    if (persist) await assignMediaFolder(d, g!, candidate);
    return folder;
  }
  if (!create) return null;
  return vetted(mediaFolder(persist ? await assignMediaFolder(d, g!, candidate) : candidate), create);
}

/** 같은 이름의 심볼릭 링크·파일이 폴더 자리에 있으면 따라가지 않는다 — 읽기는 "없음", 만들기는 오류 */
function vetted(folder: string, create: boolean): string | null {
  const st = fs.lstatSync(folder, { throwIfNoEntry: false });
  if (st === undefined || st.isDirectory()) return folder;
  if (create) throw new FileIo(new Error(`스크린샷 폴더 자리에 폴더가 아닌 것이 있습니다: ${path.basename(folder)}`));
  return null;
}

const isDirectory = isRealDirectory;

/**
 * 경로 조각 인코딩 — pchar(비예약 문자·sub-delims·`:`·`@`)만 그대로 둔다 (`encodeURIComponent`보다 덜 인코딩).
 * 사람이 탐색기로 넣은 `내 스샷 #1.png`의 `#`이 조각으로 잘려나가지 않게 한다
 */
function encodePathSegment(s: string): string {
  return encodeURIComponent(s).replace(/%(24|26|2B|2C|3B|3D|3A|40)/g, (m) => decodeURIComponent(m));
}

/** UTC 시각 문자열 — 소수부는 0·3·6·9자리 중 필요한 만큼 (`toISOString`은 항상 3자리라 직접 만든다) */
function instantText(ns: bigint): string {
  const sec = ns / 1_000_000_000n, nano = Number(ns % 1_000_000_000n);
  const base = new Date(Number(sec) * 1000).toISOString().slice(0, 19);
  if (nano === 0) return `${base}Z`;
  const digits = nano.toString().padStart(9, "0");
  const frac = nano % 1_000_000 === 0 ? digits.slice(0, 3) : nano % 1000 === 0 ? digits.slice(0, 6) : digits;
  return `${base}.${frac}Z`;
}

const screenshotUrl = (entryId: number, name: string) => `/api/backlog/${entryId}/screenshots/${encodePathSegment(name)}`;

/**
 * 썸네일 주소 — 신선한 게 있거나, 지금 만들 수 있고 전에 실패한 적이 없을 때만.
 * 일렉트론 없이 도는 서버면 null → 화면이 원본(`url`)을 쓴다.
 * `?v=`는 원본 수정시각이다 — 같은 이름에 다른 파일이 들어오면 주소가 바뀌어 캐시가 깨진다
 */
function thumbUrlOf(entryId: number, folder: string, name: string, st: fs.BigIntStats): string | null {
  const kind = mediaKindOf(name);
  if (kind === null) return null;
  const ms = mtimeMsOf(st);
  const ready = isFresh(thumbPathOf(folder, name), ms) || (canMakeThumbs() && !knownFailure(path.join(folder, name), ms, st.size));
  return ready ? `${screenshotUrl(entryId, name)}/thumb?v=${ms}` : null;
}

function statOf(folder: string, name: string): fs.BigIntStats {
  try { return fs.statSync(path.join(folder, name), { bigint: true }); } catch (e) { throw new FileIo(e); }
}

function describe(entryId: number, folder: string, name: string, st: fs.BigIntStats = statOf(folder, name)) {
  return {
    fileName: name,
    // 원본도 1년 immutable 캐시라 버전을 단다 — 마지막 번호를 지우고 다시 올리면 같은 이름이 돌아와 옛 그림이 떴다
    url: `${screenshotUrl(entryId, name)}?v=${mtimeMsOf(st)}`,
    sizeBytes: Number(st.size),
    contentType: mediaContentTypeOf(name),
    takenAt: instantText(st.mtimeNs),
    thumbUrl: thumbUrlOf(entryId, folder, name, st),
  };
}

export async function listScreenshots(entryId: number) {
  const folder = await db().transaction((tx) => folderOf(tx, entryId, false, false));
  if (folder === null) return [];
  const all = localList(folder);
  // 목록 읽기는 썸네일 폴더 청소를 겸한다 — 읽는 요청이지만 DB가 아니라 캐시만 만진다 (유지)
  pruneOrphans(folder, new Set(all));
  // 서빙할 수 없는 이름(점 파일·`.DS_Store`·미디어 아닌 것)은 목록에도 내지 않는다 — 눌러도 열리지 않는 항목이 된다
  return all.filter(isServableName).map((name) => describe(entryId, folder, name));
}

/** `001.png`, `002.jpg` … 가장 큰 번호 다음. 개수 + 1이면 중간을 지웠을 때 덮어쓴다 */
function nextName(folder: string, extension: string): string {
  let max = 0;
  for (const name of localList(folder)) {
    const base = name.replace(/\..*$/, "");
    if (!/^[0-9]+$/.test(base)) continue;
    const n = Number(base);
    // int 범위를 넘는 번호는 파싱 실패(500)로 둔다 — 기존 동작 유지, 실데이터엔 없다
    if (n > 2147483647) throw new Error(`For input string: "${base}"`);
    max = Math.max(max, n);
  }
  return `${String(max + 1).padStart(3, "0")}.${extension}`;
}

/**
 * 한 장 저장 (영상도 같은 문). **검증이 항목 확인보다 먼저다** — 기존 오류 우선순위 유지.
 * @param takenAtMillis 원본의 수정시각. 파일에 심어야 "찍은 순서"로 정렬된다
 */
export async function saveScreenshot(entryId: number, fileName: string | null,
                                     bytes: Uint8Array, takenAtMillis: number | null) {
  const contentType = mediaContentType(fileName, bytes.length);
  if (!magicMatches(bytes.subarray(0, MAGIC_LENGTH), contentType)) throw new InvalidInput("파일 내용이 형식과 맞지 않습니다");

  const saved = await db().transaction(async (tx) => {
    const folder = (await folderOf(tx, entryId, true, true))!;
    // 원문에서 마지막 점 뒤 (검증은 strip한 이름이었다)
    const raw = fileName!;
    const extension = normalize(raw.slice(raw.lastIndexOf(".") + 1))?.toLowerCase() ?? "";
    const stored = nextName(folder, extension);
    // 끝번호를 지우고 다시 올리면 같은 이름이 돌아온다 — 옛 썸네일을 먼저 치운다
    dropThumb(folder, stored);
    localSaveAs(folder, stored, bytes);
    if (takenAtMillis !== null && takenAtMillis > 0) {
      const file = path.join(folder, stored);
      try {
        fs.utimesSync(file, fs.statSync(file).atime, new Date(takenAtMillis));
      } catch (e) {
        console.warn(`원본 시각을 심지 못했습니다. ${stored}`, e);   // 못 심어도 파일은 멀쩡하다
      }
    }
    return { folder, stored, item: describe(entryId, folder, stored) };
  });
  // 트랜잭션 밖에서, 기다리지 않고 — 그리드가 열릴 때쯤엔 이미 있다
  const kind = mediaKindOf(saved.stored);
  if (kind !== null) warmThumb(path.join(saved.folder, saved.stored), kind === "IMAGE" ? "image" : "video");
  return saved.item;
}

/** 스크린샷으로 읽히는 이름: 조각 하나, 점으로 시작하지 않음, 이미지·영상 확장자 */
function isServableName(name: string): boolean {
  return isPlainFileName(name) && !name.startsWith(".") && mediaKindOf(name) !== null;
}

/** 원본 경로 — 바이트가 아니라 경로를 준다 (영상 200MB, Range 재생) */
export async function resolveScreenshot(entryId: number, fileName: string): Promise<string> {
  return (await locate(entryId, fileName)).file;
}

async function locate(entryId: number, fileName: string) {
  const folder = await db().transaction((tx) => folderOf(tx, entryId, false, false));
  // 썸네일 폴더 안은 스크린샷이 아니다 — 없는 것과 같게
  if (folder === null || pointsIntoThumbs(fileName) || !localExists(folder, fileName) || !isServableName(fileName)) {
    throw new InvalidInput(`스크린샷이 없습니다: ${fileName}`);
  }
  return { folder, file: localResolve(folder, fileName) };
}

/**
 * 썸네일 경로. 없으면 **이 요청에서** 만든다 (줄 서서, 한 장만). 못 만들면 404 — 화면은 원본으로 물러난다.
 * 원본이 없으면 원본 조회와 같은 400
 */
export async function resolveThumb(entryId: number, fileName: string): Promise<string> {
  const { file } = await locate(entryId, fileName);
  const kind = mediaKindOf(fileName);
  const thumb = kind === null ? null : await ensureThumb(file, kind === "IMAGE" ? "image" : "video");
  if (thumb === null) throw new NotFound(`썸네일이 없습니다: ${fileName}`);
  return thumb;
}

/**
 * 여러 장. **실제로 지운 개수**를 센다 — 사람이 폴더를 직접 만지므로 요청 수와 다를 수 있다.
 * 목록에 null이 있으면 아무것도 안 지우고 400 (고친 버그 18, `docs/v2-plan.md`)
 */
export async function deleteScreenshots(entryId: number, fileNames: (string | null)[]) {
  if (fileNames.some((n) => n === null)) throw new InvalidInput("파일 이름은 필수입니다");
  return db().transaction(async (tx) => {
    const folder = await folderOf(tx, entryId, false, true);
    if (folder === null) return 0;
    let deleted = 0;
    for (const name of fileNames) {
      if (pointsIntoThumbs(name!)) continue;   // 썸네일 폴더는 이름으로 못 지운다 (지운 개수에도 안 든다)
      if (!isPlainFileName(name!)) continue;    // 하위 경로(`a/b.png`)로 파고들지 못한다
      if (localDelete(folder, name!)) deleted++;
      // 원본이 이미 없었어도 (탐색기로 지움) 썸네일은 치운다
      dropThumb(folder, name!);
    }
    return deleted;
  });
}

/** 탐색기로 열 경로. **여기서 폴더를 만든다** — 열어보려는 이유가 대개 직접 넣으려는 것이다 */
export async function screenshotFolderPath(entryId: number): Promise<string> {
  const folder = await db().transaction((tx) => folderOf(tx, entryId, true, true));
  try {
    fs.mkdirSync(folder!, { recursive: true });
  } catch (e) {
    throw new FileIo(e);
  }
  return path.resolve(folder!);
}

/** 일렉트론이 클립보드·저장에 쓸 실제 경로. 경로는 서버가 정한다 — 화면이 준 경로를 믿지 않으려고 */
export async function screenshotFilePath(entryId: number, fileName: string): Promise<string> {
  return path.resolve((await locate(entryId, fileName)).file);
}

// ───────────── 갤러리 (게임 전체) ─────────────

export type GalleryKind = "ALL" | MediaKind;

interface Owned { entryId: number; gameId: number; name: string; mediaFolder: string | null; displayName: string }

/**
 * 내 살아 있는 항목마다 폴더 하나. `folderOf`와 같은 규칙인데 **한 번의 조회로** —
 * 칸이 빈 게임은 이름으로 찾아보되 저장하지 않는다 (읽기 요청이 DB를 바꾸지 않게)
 */
async function entryFolders() {
  const { owned, owners } = await db().transaction(async (tx) => ({
    owned: await rows<Owned>(tx, sql`select b.id as "entryId", g.id as "gameId", g.name, g.media_folder as "mediaFolder",
        b.display_name as "displayName"
      from backlog_entry b join game g on g.id = b.game_id
      where b.deleted_at is null
      order by b.display_name_sort_key, b.id`),
    owners: await rows<{ id: number; mediaFolder: string }>(tx,
      sql`select id, media_folder as "mediaFolder" from game where media_folder is not null`),
  }));
  const ownerOf = new Map(owners.map((o) => [o.mediaFolder, o.id]));
  const out: { entry: Owned; folder: string }[] = [];
  for (const entry of owned) {
    try {
      const slugName = entry.mediaFolder ?? mediaSlugGiven({ id: entry.gameId, name: entry.name }, (f) => ownerOf.get(f));
      const folder = mediaFolder(slugName);
      if (isDirectory(folder)) out.push({ entry, folder });
    } catch {
      // 폴더 이름이 데이터 루트 밖을 가리키는 행 — 단건 조회에선 500이지만 목록 전체를 죽이진 않는다
    }
  }
  return out;
}

/**
 * 스크린샷 관리자 — 내 게임 전체(또는 하나)의 사진·영상, **찍은 시각 최신순**.
 *
 * 파일을 열지 않는다 (stat만). 수천 장이어도 폴더 수 × readdir + 파일 수 × stat 두 번이다.
 * `games`는 거르기 전 전체 — 위쪽 고르기 목록이 지금 필터와 상관없이 같은 게임을 보여야 한다
 */
export async function listGallery(entryId: number | null, kind: GalleryKind) {
  if (entryId !== null) await db().transaction((tx) => findAliveEntry404(tx, entryId));
  const games: { entryId: number; gameName: string; imageCount: number; videoCount: number }[] = [];
  const items: (ReturnType<typeof describe> & { entryId: number; gameName: string; kind: MediaKind; mtimeNs: bigint })[] = [];
  for (const { entry, folder } of await entryFolders()) {
    const names = localList(folder);
    pruneOrphans(folder, new Set(names));
    let images = 0, videos = 0;
    for (const name of names) {
      // 항목 목록과 같은 거름 — `._001.png`(맥 AppleDouble) 같은 점 파일은 열리지 않는 칸이 된다
      if (!isServableName(name)) continue;
      const k = mediaKindOf(name);
      if (k === null) continue;
      if (k === "IMAGE") images++; else videos++;
      if ((entryId !== null && entry.entryId !== entryId) || (kind !== "ALL" && kind !== k)) continue;
      let st: fs.BigIntStats;
      try { st = fs.statSync(path.join(folder, name), { bigint: true }); } catch { continue; }   // 읽는 사이 지워짐
      items.push({ entryId: entry.entryId, gameName: entry.displayName, kind: k, ...describe(entry.entryId, folder, name, st), mtimeNs: st.mtimeNs });
    }
    if (images + videos > 0) games.push({ entryId: entry.entryId, gameName: entry.displayName, imageCount: images, videoCount: videos });
  }
  items.sort((a, b) => (a.mtimeNs !== b.mtimeNs ? (a.mtimeNs < b.mtimeNs ? 1 : -1)
    : a.entryId !== b.entryId ? a.entryId - b.entryId : a.fileName < b.fileName ? 1 : a.fileName > b.fileName ? -1 : 0));
  return {
    games,
    items: items.map((it) => ({
      entryId: it.entryId, gameName: it.gameName, fileName: it.fileName, kind: it.kind, contentType: it.contentType,
      sizeBytes: it.sizeBytes, takenAt: it.takenAt, url: it.url, thumbUrl: it.thumbUrl,
    })),
  };
}
