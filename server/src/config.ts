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
  /** dev·test 프로필 — 일렉트론 없이 시험하는 장치(썸네일 복사 등)를 연다 */
  devProfile: boolean;
  /**
   * API 토큰 — 일렉트론이 서버를 띄울 때마다 새로 만들어 넣는다. 있으면 `/api/*`가 전부 이걸 요구한다.
   * 로컬 포트는 같은 맥의 아무 프로세스·브라우저 탭이나 두드릴 수 있어서, "누가 부르는가"를 가를 게 이것뿐이다.
   * dev·test 프로필(골든·`npm run dev`)만 없이 돈다 — 운영 프로필은 없으면 기동을 거절한다 (`main.ts`)
   */
  apiToken: string | null;
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
    devProfile: ["dev", "test"].includes(env.STARLOG_PROFILE ?? ""),
    apiToken: blank(env.STARLOG_API_TOKEN),
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

/**
 * 운영 프로필은 토큰 없이 안 뜬다 — 없으면 같은 맥의 아무 프로세스·탭이 API를 그대로 부른다.
 * 거꾸로 토큰이 있는데 dev·test면 거절한다: 일렉트론은 늘 토큰을 넣으므로 그 조합은
 * 누가 환경변수로 시험 장치(썸네일 복사·개발 출처 CORS)를 앱에 끼워 넣으려는 것이다
 */
export function unsafeStartup(c: Config): "API_TOKEN_MISSING" | "DEV_PROFILE_WITH_TOKEN" | null {
  if (c.devProfile && c.apiToken !== null) return "DEV_PROFILE_WITH_TOKEN";
  if (!c.devProfile && c.apiToken === null) return "API_TOKEN_MISSING";
  return null;
}

let current: Config | null = null;
export function setConfig(c: Config) { current = c; }
export function config(): Config {
  if (!current) throw new Error("config가 아직 안 정해졌습니다");
  return current;
}
