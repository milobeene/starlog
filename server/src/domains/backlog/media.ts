/**
 * 커버·스크린샷 — 자바 `CoverImageService`·`CoverRecordService`·`CoverImageValidator`·
 * `ScreenshotService`·`MediaFileValidator`.
 *
 * 스토리지·파일시스템 왕복은 **트랜잭션 밖**에서, DB는 짧은 트랜잭션으로 (자바도 커버 서비스에
 * `@Transactional`이 없었다). PGlite는 트랜잭션 동안 다른 요청을 다 세운다.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, type Db } from "../../db/client";
import { coverImage, game } from "../../db/schema";
import { FileIo, InvalidInput } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { normalize } from "../../common/text";
import {
  STORAGE_LIMITS, coverTarget, coversDir, fileStorage, localDelete, localExists, localList, localRead,
  localResolve, localSave, localSaveAs, mediaFolder, type CoverLocation,
} from "../../common/storage";
import { recordApiCall } from "../system/service";
import { assignMediaFolder, uniqueMediaSlug } from "../game/service";
import { findOwned, findOwnedAlive404 } from "./shared";
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

/** 커버 — 발급 단계는 클라이언트가 **선언한** 크기를 본다 (`CoverImageValidator`) */
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

/** 스크린샷·영상 (`MediaFileValidator.resolveContentType`) — 영상은 상한 자릿수가 다르다 */
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

/** 확장자 → MIME. DB에 행이 없어서 이름에서 되돌린다 (`MediaFileValidator.contentTypeOf`) */
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

const keyPrefix = (memberId: number, entryId: number) => `covers/${memberId}/${entryId}/`;

/**
 * 확장자 — **검증과 같은 문자열(strip한 이름)에서** 뽑는다. 원문을 쓰면 `"cover.png "`에서
 * `"png "`가 나와 확정 단계에서 항상 400이 된다
 */
const coverExtension = (fileName: string) => { const n = normalize(fileName)!; return n.slice(n.lastIndexOf(".") + 1).toLowerCase(); };

interface Replaced { storageKey: string; location: CoverLocation }

/** 0단계 — 어디에 어떻게 올릴지. EXTERNAL이면 허가증까지 함께 준다 */
export async function prepareCover(memberId: number, entryId: number, fileName: string | null, sizeBytes: number) {
  await db().transaction((tx) => findOwned(tx, memberId, entryId));
  const contentType = coverContentType(fileName, sizeBytes);
  if (coverTarget() === "LOCAL") {
    return { mode: "LOCAL", uploadUrl: null, storageKey: null, contentType, expiresInSeconds: null };
  }
  const storageKey = keyPrefix(memberId, entryId) + crypto.randomUUID() + "." + coverExtension(fileName!);
  const upload = await fileStorage().presignUpload(storageKey, contentType, sizeBytes, STORAGE_LIMITS.uploadUrlTtlSeconds);
  return { mode: "EXTERNAL", uploadUrl: upload.uploadUrl, storageKey: upload.storageKey, contentType, expiresInSeconds: upload.expiresInSeconds };
}

/** 커버 행 붙이기 — 있으면 행을 갈아끼우지 않고 값만 바꾼다 (유니크 제약 아래 DELETE+INSERT 순서 함정) */
async function attach(memberId: number, entryId: number, storageKey: string, contentType: string,
                      sizeBytes: number, location: CoverLocation): Promise<Replaced | null> {
  return db().transaction(async (tx) => {
    await findOwned(tx, memberId, entryId);
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

/** 옛 파일 지우기 — **DB 커밋 뒤에.** 반대로 하면 DB엔 있는데 파일이 없는 최악이 나온다 */
async function removeFile(target: Replaced) {
  if (target.location === "LOCAL") { localDelete(coversDir(), target.storageKey); return; }
  await fileStorage().delete(target.storageKey);
  await recordApiCall("STORAGE", "delete", true);
}

/** EXTERNAL 확정. 클라이언트의 "올렸어요"를 안 믿고 HEAD와 매직 넘버로 실물을 본다 */
export async function confirmExternalCover(memberId: number, entryId: number, rawKey: string | null) {
  await db().transaction((tx) => findOwned(tx, memberId, entryId));
  const storageKey = normalize(rawKey);
  if (storageKey === null) throw new InvalidInput("storageKey는 필수입니다");
  // 남의 key(다른 경로)를 자기 항목 커버로 붙이는 것을 막는다
  if (!storageKey.startsWith(keyPrefix(memberId, entryId))) throw new InvalidInput("이 항목의 업로드 경로가 아닙니다");

  const stored = await fileStorage().head(storageKey);    // 미설정이면 여기서 502 — 기록 전에 던진다
  await recordApiCall("STORAGE", "head", stored !== null);
  if (stored === null) throw new InvalidInput("업로드된 파일이 없습니다");
  const head = await fileStorage().readHead(storageKey, MAGIC_LENGTH);

  // 타입은 스토리지가 적어둔 값(=클라이언트가 보낸 값)이 아니라 확장자에서 우리가 정한다
  const contentType = coverContentType(storageKey, stored.sizeBytes);
  validateStoredCover(stored.sizeBytes, head, contentType);

  const previous = await attach(memberId, entryId, storageKey, contentType, stored.sizeBytes, "EXTERNAL");
  // PUT 재시도로 같은 key가 다시 오면 방금 붙인 객체를 지우게 된다 — 같은 key는 건너뛴다
  if (previous && !(previous.location === "EXTERNAL" && previous.storageKey === storageKey)) await removeFile(previous);
}

/** LOCAL 저장 — 바이트가 백엔드를 지나간다 (왕복 셋 → 하나) */
export async function saveLocalCover(memberId: number, entryId: number, fileName: string | null, bytes: Uint8Array) {
  await db().transaction((tx) => findOwned(tx, memberId, entryId));
  const contentType = coverContentType(fileName, bytes.length);
  validateStoredCover(bytes.length, bytes.subarray(0, MAGIC_LENGTH), contentType);
  const stored = localSave(coversDir(), bytes, coverExtension(fileName!));
  const previous = await attach(memberId, entryId, stored, contentType, bytes.length, "LOCAL");
  if (previous) await removeFile(previous);
}

export async function readLocalCover(memberId: number, entryId: number) {
  const cover = await db().transaction(async (tx): Promise<CoverRow | undefined> => {
    await findOwned(tx, memberId, entryId);
    const [row] = await tx.select().from(coverImage).where(eq(coverImage.backlogEntryId, entryId));
    return row;
  });
  if (!cover || cover.location !== "LOCAL") throw new InvalidInput("로컬 커버가 없습니다");
  return { bytes: localRead(coversDir(), cover.storageKey), contentType: cover.contentType };
}

/** 삭제 — 행을 지우고(커밋) 파일을 지운다. 최악이 고아 파일이다 (K-4) */
export async function deleteCover(memberId: number, entryId: number) {
  const target = await db().transaction(async (tx): Promise<Replaced | null> => {
    await findOwned(tx, memberId, entryId);
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
 * @param persist 칸에 적은 값을 저장할지. 자바는 목록·읽기가 `readOnly`라 적어도 저장되지 않았다
 */
async function folderOf(d: Db, memberId: number, entryId: number, create: boolean, persist: boolean): Promise<string | null> {
  const entry = await findOwnedAlive404(d, memberId, entryId);
  const [g] = await d.select({ id: game.id, name: game.name, mediaFolder: game.mediaFolder }).from(game).where(eq(game.id, entry.gameId));
  if (g!.mediaFolder !== null) return mediaFolder(g!.mediaFolder);

  const candidate = await uniqueMediaSlug(d, g!);
  const folder = mediaFolder(candidate);
  if (isDirectory(folder)) {
    if (persist) await assignMediaFolder(d, g!, candidate);
    return folder;
  }
  if (!create) return null;
  return mediaFolder(persist ? await assignMediaFolder(d, g!, candidate) : candidate);
}

function isDirectory(p: string) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/**
 * 스프링 `UriUtils.encodePathSegment` — pchar(비예약 문자·sub-delims·`:`·`@`)만 그대로.
 * 사람이 탐색기로 넣은 `내 스샷 #1.png`의 `#`이 조각으로 잘려나가지 않게 한다
 */
function encodePathSegment(s: string): string {
  return encodeURIComponent(s).replace(/%(24|26|2B|2C|3B|3D|3A|40)/g, (m) => decodeURIComponent(m));
}

/** 자바 `Instant.toString()` — 소수부는 0·3·6·9자리 중 필요한 만큼 */
function instantText(ns: bigint): string {
  const sec = ns / 1_000_000_000n, nano = Number(ns % 1_000_000_000n);
  const base = new Date(Number(sec) * 1000).toISOString().slice(0, 19);
  if (nano === 0) return `${base}Z`;
  const digits = nano.toString().padStart(9, "0");
  const frac = nano % 1_000_000 === 0 ? digits.slice(0, 3) : nano % 1000 === 0 ? digits.slice(0, 6) : digits;
  return `${base}.${frac}Z`;
}

function describe(entryId: number, folder: string, name: string) {
  const file = path.join(folder, name);
  let st: fs.BigIntStats;
  try { st = fs.statSync(file, { bigint: true }); } catch (e) { throw new FileIo(e); }
  return {
    fileName: name,
    url: `/api/backlog/${entryId}/screenshots/${encodePathSegment(name)}`,
    sizeBytes: Number(st.size),
    contentType: mediaContentTypeOf(name),
    takenAt: instantText(st.mtimeNs),
  };
}

export async function listScreenshots(memberId: number, entryId: number) {
  const folder = await db().transaction((tx) => folderOf(tx, memberId, entryId, false, false));
  if (folder === null) return [];
  return localList(folder).map((name) => describe(entryId, folder, name));
}

/** `001.png`, `002.jpg` … 가장 큰 번호 다음. 개수 + 1이면 중간을 지웠을 때 덮어쓴다 */
function nextName(folder: string, extension: string): string {
  let max = 0;
  for (const name of localList(folder)) {
    const base = name.replace(/\..*$/, "");
    if (!/^[0-9]+$/.test(base)) continue;
    const n = Number(base);
    // 자바 Integer.parseInt — int 범위를 넘으면 NumberFormatException(500)
    if (n > 2147483647) throw new Error(`For input string: "${base}"`);
    max = Math.max(max, n);
  }
  return `${String(max + 1).padStart(3, "0")}.${extension}`;
}

/**
 * 한 장 저장 (영상도 같은 문). **검증이 소유권보다 먼저다** — 자바 순서 그대로.
 * @param takenAtMillis 원본의 수정시각. 파일에 심어야 "찍은 순서"로 정렬된다
 */
export async function saveScreenshot(memberId: number, entryId: number, fileName: string | null,
                                     bytes: Uint8Array, takenAtMillis: number | null) {
  const contentType = mediaContentType(fileName, bytes.length);
  if (!magicMatches(bytes.subarray(0, MAGIC_LENGTH), contentType)) throw new InvalidInput("파일 내용이 형식과 맞지 않습니다");

  return db().transaction(async (tx) => {
    const folder = (await folderOf(tx, memberId, entryId, true, true))!;
    // 원문에서 마지막 점 뒤 (검증은 strip한 이름이었다) — 자바 extensionOf
    const raw = fileName!;
    const extension = normalize(raw.slice(raw.lastIndexOf(".") + 1))?.toLowerCase() ?? "";
    const stored = nextName(folder, extension);
    localSaveAs(folder, stored, bytes);
    if (takenAtMillis !== null && takenAtMillis > 0) {
      const file = path.join(folder, stored);
      try {
        fs.utimesSync(file, fs.statSync(file).atime, new Date(takenAtMillis));
      } catch (e) {
        console.warn(`원본 시각을 심지 못했습니다. ${stored}`, e);   // 못 심어도 파일은 멀쩡하다
      }
    }
    return describe(entryId, folder, stored);
  });
}

/** 원본 경로 — 바이트가 아니라 경로를 준다 (영상 200MB, Range 재생) */
export async function resolveScreenshot(memberId: number, entryId: number, fileName: string): Promise<string> {
  const folder = await db().transaction((tx) => folderOf(tx, memberId, entryId, false, false));
  if (folder === null || !localExists(folder, fileName)) throw new InvalidInput(`스크린샷이 없습니다: ${fileName}`);
  return localResolve(folder, fileName);
}

/** 여러 장. **실제로 지운 개수**를 센다 — 사람이 폴더를 직접 만지므로 요청 수와 다를 수 있다 */
export async function deleteScreenshots(memberId: number, entryId: number, fileNames: (string | null)[]) {
  return db().transaction(async (tx) => {
    const folder = await folderOf(tx, memberId, entryId, false, true);
    if (folder === null) return 0;
    let deleted = 0;
    for (const name of fileNames) {
      // 자바는 null 이름에서 Path.resolve가 NPE(삼키지 않는 예외) → 500
      if (name === null) throw new Error("fileName is null");
      if (localDelete(folder, name)) deleted++;
    }
    return deleted;
  });
}

/** 탐색기로 열 경로. **여기서 폴더를 만든다** — 열어보려는 이유가 대개 직접 넣으려는 것이다 */
export async function screenshotFolderPath(memberId: number, entryId: number): Promise<string> {
  const folder = await db().transaction((tx) => folderOf(tx, memberId, entryId, true, true));
  try {
    fs.mkdirSync(folder!, { recursive: true });
  } catch (e) {
    throw new FileIo(e);
  }
  return path.resolve(folder!);
}
