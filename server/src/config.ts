/**
 * 기동 설정. **전부 환경변수로 받는다** — 일렉트론이 `utilityProcess`를 띄우며 넣어준다.
 *
 * 인자로는 안 받는다 — 인자는 `ps`로 같은 계정의 다른 프로세스에 보인다.
 * 자격증명이 섞이는 값은 환경변수로만 받는다.
 */

export type DbTarget =
  | { kind: "pglite"; dir: string }          // 로컬 세이브파일 (데이터 폴더)
  | { kind: "postgres"; url: string; user: string | null; password: string | null; schema: string | null }; // 클라우드 (Neon)

export interface Config {
  port: number;
  host: string;
  db: DbTarget;
  /** 미디어(커버 LOCAL·스크린샷) 루트. 없으면 미디어 기능이 막힌다 */
  dataRoot: string | null;
  /** 정적 프론트(`out/`) 폴더. 없으면 API만 연다 */
  staticDir: string | null;
  /** dev·test에서만 `X-Member-Id` 헤더를 읽는다 (테스트 장치, 인증 아님) */
  allowMemberOverride: boolean;
  /**
   * 데스크탑 CORS를 거는가 — dev·test가 아니면 건다.
   * 개발 중엔 프론트 개발 서버가 프록시로 붙어서 출처가 `localhost:3000`이다 — 걸면 막힌다
   */
  desktopCors: boolean;
  /** 부팅 기본값. 앱 안(`app_setting`)에서 넣은 값이 있으면 그게 이긴다 */
  igdb: { clientId: string | null; clientSecret: string | null };
  storage: {
    endpoint: string | null;
    bucket: string | null;
    accessKey: string | null;
    secretKey: string | null;
    publicBaseUrl: string | null;
  };
  media: { useStorageForCovers: boolean; useStorageForScreenshots: boolean };
  translateApiKey: string | null;
}

const blank = (v: string | undefined) => (v === undefined || v.trim() === "" ? null : v.trim());
const flag = (v: string | undefined) => v?.trim().toLowerCase() === "true";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `jdbc:postgresql://...` 형태도 받는다 — 이미 저장된 연결 설정이 그 형식이다
  const dbUrl = blank(env.STARLOG_DB_URL)?.replace(/^jdbc:/, "") ?? null;
  const dbDir = blank(env.STARLOG_DB_DIR);
  if (!dbUrl && !dbDir) throw new Error("STARLOG_DB_DIR(로컬) 또는 STARLOG_DB_URL(클라우드) 중 하나가 필요합니다");
  return {
    port: Number(env.STARLOG_PORT ?? 0),
    host: env.STARLOG_HOST ?? "127.0.0.1",
    db: dbUrl
      ? { kind: "postgres", url: dbUrl, user: blank(env.STARLOG_DB_USER), password: blank(env.STARLOG_DB_PASSWORD), schema: blank(env.STARLOG_DB_SCHEMA) }
      : { kind: "pglite", dir: dbDir! },
    dataRoot: blank(env.STARLOG_DATA_ROOT),
    staticDir: blank(env.STARLOG_STATIC_DIR),
    allowMemberOverride: ["dev", "test"].includes(env.STARLOG_PROFILE ?? ""),
    desktopCors: !["dev", "test"].includes(env.STARLOG_PROFILE ?? ""),
    igdb: { clientId: blank(env.APP_IGDB_CLIENT_ID), clientSecret: blank(env.APP_IGDB_CLIENT_SECRET) },
    storage: {
      endpoint: blank(env.APP_STORAGE_ENDPOINT),
      bucket: blank(env.APP_STORAGE_BUCKET),
      accessKey: blank(env.APP_STORAGE_ACCESS_KEY),
      secretKey: blank(env.APP_STORAGE_SECRET_KEY),
      publicBaseUrl: blank(env.APP_STORAGE_PUBLIC_BASE_URL),
    },
    media: {
      useStorageForCovers: flag(env.STARLOG_MEDIA_USE_STORAGE_FOR_COVERS),
      useStorageForScreenshots: flag(env.STARLOG_MEDIA_USE_STORAGE_FOR_SCREENSHOTS),
    },
    translateApiKey: blank(env.TRANSLATE_API_KEY),
  };
}

let current: Config | null = null;
export function setConfig(c: Config) { current = c; }
export function config(): Config {
  if (!current) throw new Error("config가 아직 안 정해졌습니다");
  return current;
}
