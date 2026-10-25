/**
 * 미디어 파일 — 로컬 폴더와 S3 호환 스토리지.
 *
 * 둘로 갈린다:
 *   - **로컬 폴더**(데이터 루트) — 커버 LOCAL·스크린샷. 경로를 우리가 조립하므로 탈출 검사가 여기 있다
 *   - **S3 호환 스토리지**(R2) — 커버 EXTERNAL. 자격증명이 없으면 "미설정" 구현이 자리를 지킨다
 *   (커버 DB는 파일이 아니라 `cover_image.data`다 — 여기엔 고르는 규칙 `coverTarget`만 있다)
 *
 * 로컬 폴더가 스토리지 포트를 흉내 내지 않는 이유 — 프리사인드 URL은
 * 오브젝트 스토리지에만 있는 개념이고, 업로드 경로 자체가 갈린다 (architecture §4).
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { AwsV4Signer } from "aws4fetch";
import { config } from "../../config";
import { ExternalApi, FileIo, InvalidInput } from "../errors";
import { THUMB_DIR } from "./thumbs";

// ───────────── 설정 ─────────────

/**
 * 고정값이다 — 일렉트론이 바꿔 넘긴 적이 없다.
 * 지역만 환경변수로 받는다 (R2는 의미가 없어도 서명에 들어간다)
 */
export const STORAGE_LIMITS = {
  /** 커버 한 장 (5MB) */
  maxUploadBytes: 5 * 1024 * 1024,
  /** 스크린샷 한 장 (20MB) */
  maxScreenshotBytes: 20 * 1024 * 1024,
  /** 영상 하나 (200MB) */
  maxVideoBytes: 200 * 1024 * 1024,
  /** 업로드 허가증 유효 시간 (10분, 초 단위) */
  uploadUrlTtlSeconds: 600,
} as const;

function region(): string {
  const r = process.env.APP_STORAGE_REGION;
  return r === undefined || r.trim() === "" ? "auto" : r;
}

/** 넷 다 있어야 한다 */
export function storageHasCredentials(): boolean {
  const s = config().storage;
  return !!(s.endpoint && s.bucket && s.accessKey && s.secretKey);
}

// ───────────── 데이터 루트 ─────────────

/** 안 넘어오면 개발 환경으로 본다 — 임시 폴더로 떨어뜨린다 */
export function dataRoot(): string {
  return config().dataRoot ?? path.join(os.tmpdir(), "starlog-dev-data");
}

/** 개인 업로드 커버 (location = LOCAL) */
export function coversDir(): string {
  return path.join(dataRoot(), "covers");
}

/** 게임별 스크린샷. 그 아래에 slug 폴더가 하나씩 생긴다 */
export function mediaDir(): string {
  return path.join(dataRoot(), "media");
}

/**
 * 기동 때 한 번. 업로드 시점에 만들면 권한 문제를
 * 파일을 받은 뒤에야 안다 — 못 쓰는 데이터 루트는 앱을 열자마자 드러나야 한다
 */
export function ensureMediaDirs(): void {
  fs.mkdirSync(coversDir(), { recursive: true });
  fs.mkdirSync(mediaDir(), { recursive: true });
  console.log(`데이터 루트: ${path.resolve(dataRoot())}`);
}

/**
 * 게임 하나의 스크린샷 폴더.
 * ⚠️ slug를 이어 붙이기 전에 밖으로 나가지 않는지 본다. **500**이 나는 게 맞다 —
 * `AppError`가 아닌 평범한 `Error`로 던져 전역 핸들러가 클라이언트 오류로 접지 않는다
 */
export function mediaFolder(slug: string): string {
  // 조각 하나짜리 이름만 — DB 값이 `a/b`나 `.hidden`이어도 `media/` 바로 아래 폴더 하나만 가리키게 한다
  if (!isSafeFolderName(slug)) throw new Error(`잘못된 폴더 이름입니다: ${slug}`);
  const base = mediaDir();
  const folder = resolveInside(base, slug);
  if (folder === null) throw new Error(`잘못된 폴더 이름입니다: ${slug}`);
  return folder;
}

/** 폴더 이름 하나(조각 하나). 구분자·NUL·`.`·`..`·점으로 시작하는 이름은 안 된다 */
export function isSafeFolderName(name: string): boolean {
  return name !== "" && name.length <= 255 && !name.startsWith(".") && !/[\\/\0]/.test(name);
}

/** 파일 이름 하나(조각 하나). 하위 경로로 파고드는 이름(`a/b.png`)을 막는다 */
export function isPlainFileName(name: string): boolean {
  return name !== "" && name.length <= 255 && name !== "." && name !== ".." && !/[\\/\0]/.test(name);
}

// 커버 키 모양. 엄격하게 — `startsWith`로 보면 `covers/entry-1/../entry-5/x.png`가 통과한다.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IMG_EXT = "(?:jpg|jpeg|png|webp)";
/** 지금 모양 — `covers/entry-<항목>/<uuid>.<ext>` */
const NEW_COVER_KEY = new RegExp(`^covers/entry-([0-9]{1,18})/${UUID}\\.${IMG_EXT}$`);
/** V14 전 모양 — `covers/<회원>/<항목>/<uuid>.<ext>`. 실데이터에 남아 있어 읽기·삭제는 계속 된다 */
const OLD_COVER_KEY = new RegExp(`^covers/[0-9]{1,18}/[0-9]{1,18}/${UUID}\\.${IMG_EXT}$`);
/** LOCAL 커버 — 데이터 루트 `covers/` 바로 아래 파일 이름 하나 */
const LOCAL_COVER_NAME = new RegExp(`^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\\.${IMG_EXT}$`);

/** 이 항목에 새로 붙일 수 있는 EXTERNAL 키인가 (확정 단계) */
export function isNewCoverKeyOf(entryId: number, key: string): boolean {
  return NEW_COVER_KEY.exec(key)?.[1] === String(entryId);
}

/** 스토리지에 HEAD/GET/DELETE를 보내도 되는 키인가 — 새 모양 + 옛 모양 */
export function isExternalCoverKey(key: string): boolean {
  return NEW_COVER_KEY.test(key) || OLD_COVER_KEY.test(key);
}

export function isLocalCoverName(name: string): boolean {
  return LOCAL_COVER_NAME.test(name);
}

/**
 * `name`을 `directory` 아래로 풀고(`normalize`) 그 안에 머무는지 본다.
 * `resolve`는 절대 경로가 오면 그쪽으로 갈아탄다 (`path.join`은 이어 붙인다 — 다르다).
 * `startsWith`는 글자가 아니라 **경로 조각** 단위다 (`/a/covers2`는 `/a/covers` 안이 아니다)
 */
function resolveInside(directory: string, name: string): string | null {
  // NUL이 든 이름은 경로가 될 수 없다 → 평범한 `Error`라 500
  if (name.includes("\0")) throw new Error(`Illegal char <\\0> in path: ${name}`);
  const dir = path.normalize(directory);
  const file = path.normalize(path.isAbsolute(name) ? name : path.join(dir, name));
  const trimmed = file.length > 1 && file.endsWith(path.sep) ? file.slice(0, -1) : file;
  return trimmed === dir || trimmed.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep) ? trimmed : null;
}

// ───────────── 로컬 파일 ─────────────

/** ⚠️ 파일명은 클라이언트에서 오기도 한다 (스크린샷 삭제). 데이터 루트 밖이면 400 */
function safeResolve(directory: string, fileName: string): string {
  const file = resolveInside(directory, fileName);
  if (file === null) throw new InvalidInput(`잘못된 파일 이름입니다: ${fileName}`);
  return file;
}

/**
 * 임시 파일에 쓰고 이름을 바꾼다 — 쓰다가 죽으면 반쯤 쓰인 이미지가 남는다.
 * rename은 같은 볼륨 안에서 원자적이라 "없거나 온전하거나" 둘 중 하나다
 */
function write(target: string, bytes: Uint8Array): void {
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = target + ".tmp";
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, target);
  } catch (e) {
    throw new FileIo(e);   // 500 FILE_IO_ERROR
  }
}

// ⚠️ stat이 아니라 lstat — 심볼릭 링크는 따라가지 않고 "없는 것"으로 본다.
// 미디어 폴더는 사람이 탐색기로 만지는 곳이라 링크 하나로 폴더 밖 파일(비밀·시스템 파일)이 앱을 통해 읽힐 수 있다
export function isRegularFile(p: string): boolean {
  try { return fs.lstatSync(p).isFile(); } catch { return false; }
}

export function isRealDirectory(p: string): boolean {
  try { return fs.lstatSync(p).isDirectory(); } catch { return false; }
}
const isDirectory = isRealDirectory;

/**
 * 파일 하나 저장. **원본 파일명을 안 쓴다** — uuid면 경로 탈출·중복·OS 금지문자가 통째로 사라진다
 * @returns 저장한 이름 (`<uuid>.<ext>`)
 */
export function localSave(directory: string, bytes: Uint8Array, extension: string): string {
  const name = `${crypto.randomUUID()}.${extension}`;
  write(path.join(directory, name), bytes);
  return name;
}

/** 이름을 지정해 저장 (스크린샷). 이미 있으면 덮어쓴다 */
export function localSaveAs(directory: string, fileName: string, bytes: Uint8Array): void {
  // 검사 없이 조립한다 (이름은 서버가 만든 순번)
  write(path.isAbsolute(fileName) ? fileName : path.join(directory, fileName), bytes);
}

export function localRead(directory: string, fileName: string): Buffer {
  const file = safeResolve(directory, fileName);
  // 없는 파일은 아래 읽기에서 그대로 500이다. 링크·폴더·하위 경로만 여기서 막는다
  let st: fs.Stats | null = null;
  try { st = fs.lstatSync(file); } catch { /* 없음 */ }
  if (!isPlainFileName(fileName) || (st !== null && !st.isFile())) throw new InvalidInput(`잘못된 파일 이름입니다: ${fileName}`);
  try {
    return fs.readFileSync(file);
  } catch (e) {
    throw new FileIo(e);
  }
}

export function localExists(directory: string, fileName: string): boolean {
  const file = safeResolve(directory, fileName);   // 밖으로 나가는 이름은 여기서 400
  return isPlainFileName(fileName) && isRegularFile(file);
}

/** 검증을 마친 경로 — 바이트로 읽지 않고 경로만 필요한 쪽 (영상 스트리밍) */
export function localResolve(directory: string, fileName: string): string {
  const file = safeResolve(directory, fileName);
  if (!isPlainFileName(fileName)) throw new InvalidInput(`잘못된 파일 이름입니다: ${fileName}`);
  return file;
}

/**
 * 실패해도 던지지 않는다 — 여러 장을 지울 때 하나 때문에 전부 멈추면 안 된다.
 * @returns 실제로 지웠으면 true. 이미 없었거나 실패했으면 false
 *
 * **빈 폴더도 지우고**, 안 빈 폴더면 실패(false)다
 */
export function localDelete(directory: string, fileName: string): boolean {
  try {
    const file = safeResolve(directory, fileName);
    let st: fs.Stats;
    try { st = fs.lstatSync(file); } catch { return false; }
    if (st.isDirectory()) fs.rmdirSync(file);
    else fs.unlinkSync(file);
    return true;
  } catch (e) {
    console.warn(`파일 삭제 실패 — 무시한다. ${fileName}`, e);
    return false;
  }
}

/** 폴더 안의 파일 이름들 (이름순). 폴더가 없으면 빈 목록 */
export function localList(directory: string): string[] {
  if (!isDirectory(directory)) return [];
  try {
    return fs.readdirSync(directory)
      .filter((n) => isRegularFile(path.join(directory, n)))
      .sort();   // 기본 sort = UTF-16 코드 단위 순서
  } catch (e) {
    throw new FileIo(e);
  }
}

/**
 * 폴더 하나의 실제 크기 (하위 폴더 포함). 실패하면 0 — 시스템 화면이 이것 때문에 죽으면 안 된다.
 * 썸네일 폴더(`.thumbs`)는 안 센다 — 사용자가 올린 것이 아니라 캐시다
 */
export function folderSize(dir: string): number {
  if (!isDirectory(dir)) return 0;
  try {
    let total = 0;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== THUMB_DIR) walk(p); }
        else {
          try { const st = fs.lstatSync(p); if (st.isFile()) total += st.size; } catch { /* 못 읽는 파일은 0으로 센다 */ }
        }
      }
    };
    walk(dir);
    return total;
  } catch {
    return 0;
  }
}

// ───────────── 무엇을 어디에 ─────────────

export type CoverLocation = "LOCAL" | "EXTERNAL" | "DB";

/**
 * 고른 대로 못 하면 **DB**다 — 스토리지는 자격증명이, 로컬 폴더는 데이터 루트가 있어야 한다.
 * 예전엔 LOCAL로 떨어졌는데, DB는 어디서 열어도 따라다니고 백업에도 실려 가장 잃기 어렵다.
 * 켜진 채로 실패(502)하게 두지 않는다
 */
export function coverTarget(): CoverLocation {
  const c = config();
  if (c.media.coverTarget === "storage" && storageHasCredentials()) return "EXTERNAL";
  if (c.media.coverTarget === "local" && c.dataRoot !== null) return "LOCAL";
  return "DB";
}

// ───────────── 오브젝트 스토리지 ─────────────

export interface PresignedUpload { uploadUrl: string; storageKey: string; expiresInSeconds: number }
export interface StoredObject { contentType: string | null; sizeBytes: number }

export interface FileStoragePort {
  /** contentType·sizeBytes를 **서명에 넣는다** — 다른 타입·크기로 올리면 스토리지가 거부한다 (K-3) */
  presignUpload(storageKey: string, contentType: string, sizeBytes: number, expiresInSeconds: number): Promise<PresignedUpload>;
  /** 실제로 올라갔는지 + 실제 타입·크기. 없으면 null */
  head(storageKey: string): Promise<StoredObject | null>;
  /** 앞부분 몇 바이트만 (매직 넘버 검사). 없으면 빈 배열 */
  readHead(storageKey: string, length: number): Promise<Uint8Array>;
  /**
   * 실패해도 던지지 않는다 — DB 커밋 **뒤에** 불린다 (K-4).
   * 성공 true · 실패 false · 스토리지가 없어 **부르지도 않음** null (사용량 기록을 가르려고)
   */
  delete(storageKey: string): Promise<boolean | null>;
  /** 공개 조회 URL. 공개 주소가 없으면 null */
  publicUrl(storageKey: string): string | null;
  /** 자격증명이 **실제로 먹히는지**. 실패 사유, 성공이면 null */
  checkAccess(): Promise<string | null>;
}

const UNCONFIGURED_MESSAGE = "스토리지 설정이 없습니다 (app.storage.endpoint / bucket / access-key / secret-key)";

/**
 * 자격증명이 없을 때. 기동은 시키고 **부르는 순간에만** 502.
 * 조용히 성공한 척하지 않는다 — 그러면 업로드가 되는 줄 알고 넘어간다
 */
const unconfigured: FileStoragePort = {
  async presignUpload() { throw new ExternalApi("FILE_STORAGE", UNCONFIGURED_MESSAGE); },
  async head() { throw new ExternalApi("FILE_STORAGE", UNCONFIGURED_MESSAGE); },
  async readHead() { throw new ExternalApi("FILE_STORAGE", UNCONFIGURED_MESSAGE); },
  async delete() { return null; /* 커밋 뒤에 불리므로 여기서 터지면 성공한 삭제가 실패로 보인다 */ },
  publicUrl() { return null; },
  async checkAccess() { return "스토리지 자격증명이 설정되지 않았습니다"; },
};

/** S3가 응답은 줬는데 실패인 경우. 연결 실패·타임아웃은 이 타입이 아니다 (`head`·`readHead`가 이걸로 갈라낸다) */
class S3Status extends Error {
  constructor(readonly status: number, readonly errorCode: string | null) { super(`S3 ${status} ${errorCode ?? ""}`); }
}

/**
 * S3 호환. R2·MinIO가 쓰는 **경로 방식**(`endpoint/bucket/key`)이다 —
 * 가상 호스트 방식으로 두면 R2에서 서명이 어긋난다.
 *
 * 서명은 aws4fetch, 전송은 fetch. aws4fetch의 `AwsClient.fetch`는 재시도를 10번까지 하므로 안 쓰고
 * 재시도(3번 시도, 5xx·429·연결 실패만)를 `send`에서 직접 한다
 */
class S3Storage implements FileStoragePort {
  constructor(private readonly s: { endpoint: string; bucket: string; accessKey: string; secretKey: string; publicBaseUrl: string | null }) {}

  /** 경로 방식 URL. 키 인코딩은 `encodeKey` */
  private objectUrl(key: string | null): string {
    const base = `${this.s.endpoint.replace(/\/+$/, "")}/${encodeKey(this.s.bucket)}`;
    return key === null ? base : `${base}/${encodeKey(key)}`;
  }

  private signer(method: string, url: string, headers: Record<string, string> = {}, signQuery = false, datetime?: string) {
    return new AwsV4Signer({
      method, url, headers, signQuery, datetime,
      accessKeyId: this.s.accessKey, secretAccessKey: this.s.secretKey,
      service: "s3", region: region(),
      allHeaders: true,   // ⚠️ 기본은 content-type·content-length를 서명에서 뺀다. 둘 다 넣어야 SignedHeaders가 content-length;content-type;host가 되고, 다른 타입·크기 업로드를 스토리지가 거부한다 (K-3)
    });
  }

  /** 서명 + 전송 + 재시도. 응답은 받았는데 2xx가 아니면 `S3Status` */
  private async send(method: string, key: string | null, headers: Record<string, string> = {}): Promise<Response> {
    // DB에 들어 있던 키·가져온 키가 `..`로 다른 객체를 가리키는 일을 여기서 끊는다 — HEAD·GET·DELETE 모두 이 길을 지난다
    if (key !== null && !isExternalCoverKey(key)) throw new Error(`허용되지 않는 스토리지 키: ${JSON.stringify(key).slice(0, 80)}`);
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      try {
        const signed = await this.signer(method, this.objectUrl(key), headers).sign();
        const res = await fetch(signed.url, { method, headers: signed.headers, signal: AbortSignal.timeout(30_000) });
        if (res.ok) return res;
        const body = method === "HEAD" ? "" : await res.text().catch(() => "");
        const err = new S3Status(res.status, /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? null);
        if (res.status >= 500 || res.status === 429) { last = err; continue; }
        throw err;
      } catch (e) {
        if (e instanceof S3Status) throw e;
        last = e;   // 연결 실패·타임아웃
      }
    }
    throw last;
  }

  async presignUpload(storageKey: string, contentType: string, sizeBytes: number, expiresInSeconds: number, datetime?: string): Promise<PresignedUpload> {
    if (!isExternalCoverKey(storageKey)) throw new Error("허용되지 않는 스토리지 키");
    return { uploadUrl: await this.presignUrl(storageKey, contentType, sizeBytes, expiresInSeconds, datetime), storageKey, expiresInSeconds };
  }

  /**
   * 이전 AWS SDK(`S3Presigner`)가 만들던 URL과 **같은 문자열**을 만든다 — 쿼리 순서까지 (`Algorithm·Date·SignedHeaders·Credential·Expires·Signature`).
   * 순서는 서명에 영향이 없지만(정규화 때 정렬한다), 같은 문자열이어야 SDK로 뽑은 기대값을 고정 시각 테스트로 대조할 수 있다 (`presign.test.ts`).
   * `datetime`은 테스트용 (`20261024T094951Z`)
   */
  async presignUrl(storageKey: string, contentType: string, sizeBytes: number, expiresInSeconds: number, datetime?: string): Promise<string> {
    const url = `${this.objectUrl(storageKey)}?X-Amz-Expires=${expiresInSeconds}`;
    const signed = await this.signer("PUT", url, { "content-type": contentType, "content-length": String(sizeBytes) }, true, datetime).sign();
    const q = signed.url.searchParams;
    const order = ["X-Amz-Algorithm", "X-Amz-Date", "X-Amz-SignedHeaders", "X-Amz-Credential", "X-Amz-Expires", "X-Amz-Signature"];
    return `${this.objectUrl(storageKey)}?${order.map((k) => `${k}=${encodeStrict(q.get(k) ?? "")}`).join("&")}`;
  }

  async head(storageKey: string): Promise<StoredObject | null> {
    try {
      const res = await this.send("HEAD", storageKey);
      return { contentType: res.headers.get("content-type"), sizeBytes: Number(res.headers.get("content-length") ?? 0) };
    } catch (e) {
      // HEAD 404 = 업로드가 실제로 안 일어났다. 장애가 아니라 정상 분기다
      if (e instanceof S3Status && e.status === 404) return null;
      // 연결 실패·타임아웃도 502 — 스토리지 장애는 우리 오류(500)가 아니다 (고친 버그 9, `docs/v2-plan.md`)
      console.error(`스토리지 조회 실패 — key=${storageKey}`, e);
      throw new ExternalApi("FILE_STORAGE", "업로드된 파일을 확인하지 못했습니다");
    }
  }

  async readHead(storageKey: string, length: number): Promise<Uint8Array> {
    // Range로 앞부분만 받는다. 5MB 파일을 통째로 메모리에 올리지 않기 위해서다
    let res: Response;
    try {
      res = await this.send("GET", storageKey, { range: `bytes=0-${length - 1}` });
    } catch (e) {
      if (e instanceof S3Status && e.errorCode === "NoSuchKey") return new Uint8Array(0);
      console.error(`스토리지 부분 읽기 실패 — key=${storageKey}`, e);   // 연결 실패도 502 (고친 버그 9)
      throw new ExternalApi("FILE_STORAGE", "업로드된 파일을 확인하지 못했습니다");
    }
    try {
      return new Uint8Array(await res.arrayBuffer()).slice(0, length);
    } catch (e) {
      // 본문 읽다 끊김 → 502
      console.error(`스토리지 부분 읽기 실패 — key=${storageKey}`, e);
      throw new ExternalApi("FILE_STORAGE", "업로드된 파일을 확인하지 못했습니다");
    }
  }

  async delete(storageKey: string): Promise<boolean> {
    try {
      await this.send("DELETE", storageKey);
      return true;
    } catch (e) {
      // 던지지 않는다 — 연결 실패까지. DB 커밋 뒤라 던지면 성공한 삭제가 실패로 보인다. 남은 파일은 라이프사이클이 정리한다
      console.warn(`스토리지 파일 삭제 실패 — key=${storageKey} (고아 파일로 남는다)`, e);
      return false;
    }
  }

  publicUrl(storageKey: string): string | null {
    const base = this.s.publicBaseUrl;
    if (base === null || base.trim() === "") return null;
    return base.endsWith("/") ? base + storageKey : `${base}/${storageKey}`;
  }

  /** `headBucket` — 존재와 권한만 확인하는 가장 싼 호출. 실패를 종류별로 갈라야 화면이 쓸모 있다 */
  async checkAccess(): Promise<string | null> {
    try {
      await this.send("HEAD", null);
      return null;
    } catch (e) {
      if (e instanceof S3Status) {
        if (e.status === 401 || e.status === 403) return "액세스 키 또는 시크릿 키가 거부되었습니다";
        if (e.status === 404) return `버킷을 찾을 수 없습니다: ${this.s.bucket}`;
        return `스토리지가 ${e.status}로 응답했습니다`;
      }
      return "스토리지에 연결하지 못했습니다";   // 엔드포인트 오타·인터넷 없음
    }
  }
}

/** RFC 3986 unreserved(`A-Za-z0-9-._~`)만 그대로 두고 나머지는 퍼센트 인코딩, `/`는 살린다 */
function encodeKey(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%2F/g, "/");
}

/** 쿼리 값 — `/`까지 인코딩한다 (이전 SDK 출력과 같은 글자) */
function encodeStrict(s: string): string {
  return encodeKey(s).replace(/\//g, "%2F");
}

let port: FileStoragePort | null = null;

/** 설정이 기동 때 굳으므로 처음 부를 때 한 번 고른다 */
export function fileStorage(): FileStoragePort {
  if (port) return port;
  if (!storageHasCredentials()) {
    console.warn("스토리지 자격증명이 없습니다. 커버 업로드가 502로 실패합니다 (app.storage.*)");
    port = unconfigured;
  } else {
    const s = config().storage;
    port = new S3Storage({ endpoint: s.endpoint!, bucket: s.bucket!, accessKey: s.accessKey!, secretKey: s.secretKey!, publicBaseUrl: s.publicBaseUrl });
  }
  return port;
}

/** 테스트 전용 — 고정 시각 서명 대조 */
export const __test = { S3Storage };
