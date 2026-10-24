/**
 * 미디어 파일 — 자바 `common/storage` 패키지 (`MediaPaths`·`LocalFileStore`·`FileStoragePort`·`MediaTargets`).
 *
 * 둘로 갈린다:
 *   - **로컬 폴더**(데이터 루트) — 커버 LOCAL·스크린샷. 경로를 우리가 조립하므로 탈출 검사가 여기 있다
 *   - **S3 호환 스토리지**(R2) — 커버 EXTERNAL. 자격증명이 없으면 "미설정" 구현이 자리를 지킨다
 *
 * 로컬 폴더가 스토리지 포트를 흉내 내지 않는 이유는 자바와 같다 — 프리사인드 URL은
 * 오브젝트 스토리지에만 있는 개념이고, 업로드 경로 자체가 갈린다 (architecture §4).
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { AwsV4Signer } from "aws4fetch";
import { config } from "../../config";
import { ExternalApi, FileIo, InvalidInput } from "../errors";

// ───────────── 설정 (자바 `StorageProperties`) ─────────────

/**
 * 자바 기본값 그대로. 자바는 `app.storage.*`로 바꿀 수 있었지만 일렉트론이 넘긴 적이 없다 —
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

/** 넷 다 있어야 한다 (`StorageProperties.hasCredentials`) */
export function storageHasCredentials(): boolean {
  const s = config().storage;
  return !!(s.endpoint && s.bucket && s.accessKey && s.secretKey);
}

// ───────────── 데이터 루트 (자바 `MediaPaths`) ─────────────

/** 안 넘어오면 개발 환경으로 본다 — 임시 폴더로 떨어뜨린다 (자바와 같은 이름) */
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
 * 기동 때 한 번 (자바 `@PostConstruct ensure`). 업로드 시점에 만들면 권한 문제를
 * 파일을 받은 뒤에야 안다 — 못 쓰는 데이터 루트는 앱을 열자마자 드러나야 한다
 */
export function ensureMediaDirs(): void {
  fs.mkdirSync(coversDir(), { recursive: true });
  fs.mkdirSync(mediaDir(), { recursive: true });
  console.log(`데이터 루트: ${path.resolve(dataRoot())}`);
}

/**
 * 게임 하나의 스크린샷 폴더.
 * ⚠️ slug를 이어 붙이기 전에 밖으로 나가지 않는지 본다. 자바는 `IllegalArgumentException`이라
 * 전역 핸들러가 못 잡고 **500**이 났다 — 그래서 `AppError`가 아닌 평범한 `Error`로 던진다
 */
export function mediaFolder(slug: string): string {
  const base = mediaDir();
  const folder = resolveInside(base, slug);
  if (folder === null) throw new Error(`잘못된 폴더 이름입니다: ${slug}`);
  return folder;
}

/**
 * 자바 `directory.resolve(name).normalize()` + `startsWith(directory)`.
 * `resolve`는 절대 경로가 오면 그쪽으로 갈아탄다 (`path.join`은 이어 붙인다 — 다르다).
 * `startsWith`는 글자가 아니라 **경로 조각** 단위다 (`/a/covers2`는 `/a/covers` 안이 아니다)
 */
function resolveInside(directory: string, name: string): string | null {
  // 자바 Path는 NUL이 든 이름에서 InvalidPathException(=IllegalArgumentException)을 던진다 → 500
  if (name.includes("\0")) throw new Error(`Illegal char <\\0> in path: ${name}`);
  const dir = path.normalize(directory);
  const file = path.normalize(path.isAbsolute(name) ? name : path.join(dir, name));
  const trimmed = file.length > 1 && file.endsWith(path.sep) ? file.slice(0, -1) : file;
  return trimmed === dir || trimmed.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep) ? trimmed : null;
}

// ───────────── 로컬 파일 (자바 `LocalFileStore`) ─────────────

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
    throw new FileIo(e);   // 자바 UncheckedIOException → 500 FILE_IO_ERROR
  }
}

function isRegularFile(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDirectory(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

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
  // 자바 `directory.resolve(fileName)` — 검사 없이 조립한다 (이름은 서버가 만든 순번)
  write(path.isAbsolute(fileName) ? fileName : path.join(directory, fileName), bytes);
}

export function localRead(directory: string, fileName: string): Buffer {
  const file = safeResolve(directory, fileName);
  try {
    return fs.readFileSync(file);
  } catch (e) {
    throw new FileIo(e);
  }
}

export function localExists(directory: string, fileName: string): boolean {
  return isRegularFile(safeResolve(directory, fileName));
}

/** 검증을 마친 경로 — 바이트로 읽지 않고 경로만 필요한 쪽 (영상 스트리밍) */
export function localResolve(directory: string, fileName: string): string {
  return safeResolve(directory, fileName);
}

/**
 * 실패해도 던지지 않는다 — 여러 장을 지울 때 하나 때문에 전부 멈추면 안 된다.
 * @returns 실제로 지웠으면 true. 이미 없었거나 실패했으면 false
 *
 * 자바 `Files.deleteIfExists`는 **빈 폴더도 지우고**, 안 빈 폴더면 실패(false)다 — 그대로 따른다
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
      .sort();   // 자바 String 자연 순서 = UTF-16 코드 단위 순서 = JS 기본 sort
  } catch (e) {
    throw new FileIo(e);
  }
}

/** 폴더 하나의 실제 크기 (하위 폴더 포함). 실패하면 0 — 시스템 화면이 이것 때문에 죽으면 안 된다 */
export function folderSize(dir: string): number {
  if (!isDirectory(dir)) return 0;
  try {
    let total = 0;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else {
          try { const st = fs.statSync(p); if (st.isFile()) total += st.size; } catch { /* 자바도 0으로 센다 */ }
        }
      }
    };
    walk(dir);
    return total;
  } catch {
    return 0;
  }
}

// ───────────── 무엇을 어디에 (자바 `MediaTargets`) ─────────────

export type CoverLocation = "LOCAL" | "EXTERNAL";

/** 체크했더라도 자격증명이 없으면 로컬이다. 켜진 채로 실패하게 두지 않는다 */
export function coverTarget(): CoverLocation {
  return config().media.useStorageForCovers && storageHasCredentials() ? "EXTERNAL" : "LOCAL";
}

export function screenshotsToStorage(): boolean {
  return config().media.useStorageForScreenshots && storageHasCredentials();
}

// ───────────── 오브젝트 스토리지 (자바 `FileStoragePort`) ─────────────

export interface PresignedUpload { uploadUrl: string; storageKey: string; expiresInSeconds: number }
export interface StoredObject { contentType: string | null; sizeBytes: number }

export interface FileStoragePort {
  /** contentType·sizeBytes를 **서명에 넣는다** — 다른 타입·크기로 올리면 스토리지가 거부한다 (K-3) */
  presignUpload(storageKey: string, contentType: string, sizeBytes: number, expiresInSeconds: number): Promise<PresignedUpload>;
  /** 실제로 올라갔는지 + 실제 타입·크기. 없으면 null */
  head(storageKey: string): Promise<StoredObject | null>;
  /** 앞부분 몇 바이트만 (매직 넘버 검사). 없으면 빈 배열 */
  readHead(storageKey: string, length: number): Promise<Uint8Array>;
  /** 실패해도 던지지 않는다 — DB 커밋 **뒤에** 불린다 (K-4) */
  delete(storageKey: string): Promise<void>;
  /** 공개 조회 URL. 공개 주소가 없으면 null */
  publicUrl(storageKey: string): string | null;
  /** 자격증명이 **실제로 먹히는지**. 실패 사유, 성공이면 null */
  checkAccess(): Promise<string | null>;
}

const UNCONFIGURED_MESSAGE = "스토리지 설정이 없습니다 (app.storage.endpoint / bucket / access-key / secret-key)";

/**
 * 자격증명이 없을 때 (자바 `UnconfiguredFileStorage`). 기동은 시키고 **부르는 순간에만** 502.
 * 조용히 성공한 척하지 않는다 — 그러면 업로드가 되는 줄 알고 넘어간다
 */
const unconfigured: FileStoragePort = {
  async presignUpload() { throw new ExternalApi("FILE_STORAGE", UNCONFIGURED_MESSAGE); },
  async head() { throw new ExternalApi("FILE_STORAGE", UNCONFIGURED_MESSAGE); },
  async readHead() { throw new ExternalApi("FILE_STORAGE", UNCONFIGURED_MESSAGE); },
  async delete() { /* 커밋 뒤에 불리므로 여기서 터지면 성공한 삭제가 실패로 보인다 */ },
  publicUrl() { return null; },
  async checkAccess() { return "스토리지 자격증명이 설정되지 않았습니다"; },
};

/** S3가 돌려준 실패. 자바 `S3Exception`(응답은 받았다) 자리 */
class S3Status extends Error {
  constructor(readonly status: number, readonly errorCode: string | null) { super(`S3 ${status} ${errorCode ?? ""}`); }
}

/**
 * S3 호환 (자바 `S3CompatibleFileStorage`). R2·MinIO가 쓰는 **경로 방식**(`endpoint/bucket/key`)이다 —
 * 가상 호스트 방식으로 두면 R2에서 서명이 어긋난다 (자바 `pathStyleAccessEnabled(true)`).
 *
 * 서명은 aws4fetch, 전송은 fetch. aws4fetch의 `AwsClient.fetch`는 재시도를 10번까지 하므로 안 쓰고
 * SDK 기본(3번 시도, 5xx·429·연결 실패만)을 직접 흉내 낸다
 */
class S3Storage implements FileStoragePort {
  constructor(private readonly s: { endpoint: string; bucket: string; accessKey: string; secretKey: string; publicBaseUrl: string | null }) {}

  /** SDK `urlEncodeIgnoreSlashes` — RFC 3986 unreserved만 그대로, `/`는 살린다 */
  private objectUrl(key: string | null): string {
    const base = `${this.s.endpoint.replace(/\/+$/, "")}/${encodeKey(this.s.bucket)}`;
    return key === null ? base : `${base}/${encodeKey(key)}`;
  }

  private signer(method: string, url: string, headers: Record<string, string> = {}, signQuery = false, datetime?: string) {
    return new AwsV4Signer({
      method, url, headers, signQuery, datetime,
      accessKeyId: this.s.accessKey, secretAccessKey: this.s.secretKey,
      service: "s3", region: region(),
      allHeaders: true,   // ⚠️ 기본은 content-type·content-length를 서명에서 뺀다. SDK는 넣는다 — 그게 K-3의 절반이다
    });
  }

  /** 서명 + 전송 + SDK식 재시도. 응답은 받았는데 2xx가 아니면 `S3Status` */
  private async send(method: string, key: string | null, headers: Record<string, string> = {}): Promise<Response> {
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
        last = e;   // 연결 실패·타임아웃 — 자바 SdkClientException
      }
    }
    throw last;
  }

  async presignUpload(storageKey: string, contentType: string, sizeBytes: number, expiresInSeconds: number, datetime?: string): Promise<PresignedUpload> {
    return { uploadUrl: await this.presignUrl(storageKey, contentType, sizeBytes, expiresInSeconds, datetime), storageKey, expiresInSeconds };
  }

  /**
   * SDK와 **같은 문자열**을 만든다 — 쿼리 순서까지 (`Algorithm·Date·SignedHeaders·Credential·Expires·Signature`).
   * 순서는 서명에 영향이 없지만(정규화 때 정렬한다), 같은 문자열이어야 고정 시각 테스트로 대조할 수 있다.
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
      if (e instanceof S3Status) {
        console.error(`스토리지 조회 실패 — key=${storageKey}`, e);
        throw new ExternalApi("FILE_STORAGE", "업로드된 파일을 확인하지 못했습니다");
      }
      throw e;   // ⚠️ 자바는 연결 실패(SdkClientException)를 안 잡아서 500이었다 — 그대로
    }
  }

  async readHead(storageKey: string, length: number): Promise<Uint8Array> {
    // Range로 앞부분만 받는다. 5MB 파일을 통째로 메모리에 올리지 않기 위해서다
    let res: Response;
    try {
      res = await this.send("GET", storageKey, { range: `bytes=0-${length - 1}` });
    } catch (e) {
      if (e instanceof S3Status && e.errorCode === "NoSuchKey") return new Uint8Array(0);
      if (e instanceof S3Status) {
        console.error(`스토리지 부분 읽기 실패 — key=${storageKey}`, e);
        throw new ExternalApi("FILE_STORAGE", "업로드된 파일을 확인하지 못했습니다");
      }
      throw e;   // 자바와 같이 500
    }
    try {
      return new Uint8Array(await res.arrayBuffer()).slice(0, length);
    } catch (e) {
      // 자바 IOException(본문 읽다 끊김) → 502
      console.error(`스토리지 부분 읽기 실패 — key=${storageKey}`, e);
      throw new ExternalApi("FILE_STORAGE", "업로드된 파일을 확인하지 못했습니다");
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.send("DELETE", storageKey);
    } catch (e) {
      // 던지지 않는다 — 연결 실패까지 (자바가 SdkException을 넓게 잡은 이유). 남은 파일은 라이프사이클이 정리한다
      console.warn(`스토리지 파일 삭제 실패 — key=${storageKey} (고아 파일로 남는다)`, e);
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

/** 쿼리 값 — `/`까지 인코딩한다 (SDK가 만든 URL과 같은 글자) */
function encodeStrict(s: string): string {
  return encodeKey(s).replace(/\//g, "%2F");
}

let port: FileStoragePort | null = null;

/** 자바는 기동 때 빈을 하나 골랐다. 설정이 기동 때 굳으므로 처음 부를 때 한 번 고른다 */
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
