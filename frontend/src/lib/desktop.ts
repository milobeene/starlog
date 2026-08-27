/**
 * 일렉트론 다리 (v1.0 5단계).
 *
 * ## 이 파일만 `window.starlog`를 안다
 *
 * 화면 여기저기서 `(window as any).starlog`를 찾기 시작하면, 브라우저에서 열었을 때
 * 어디가 터지는지 알 수 없게 된다. **한 곳으로 모으고 타입을 붙인다.**
 *
 * ## 브라우저에서는 없는 게 정상이다
 *
 * `npm run dev`로 여는 개발 서버에는 preload가 없다. 그때는 `getBridge()`가 `undefined`를
 * 주고 입구 화면이 예전처럼 `[들어가기]` 하나로 폴백한다 —
 * **백엔드를 고칠 때 일렉트론을 거치지 않는 길이 살아 있어야 한다** (architecture §2).
 */

export type LaunchMode = "local" | "cloud";

export interface SaveFile {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface DbConfig {
  url: string;
  user: string;
  password: string;
  /** PostgreSQL 스키마. 주면 남의 테이블과 한 DB에서 공존한다 (결정 60) */
  schema?: string;
}

export interface StorageConfig {
  endpoint?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  publicBaseUrl?: string;
}

export interface ConnectionProfile {
  name: string;
  db: DbConfig;
  storage?: StorageConfig;
  igdb?: { clientId?: string; clientSecret?: string };
}

export type LaunchProgress =
  | { phase: "starting" }
  | { phase: "waiting" }
  | { phase: "ready" }
  | { phase: "error"; code: string; exitCode?: number };

export interface StarlogBridge {
  settings: {
    get(): Promise<{ dataRoot: string; dirs: Record<string, string>; lastMode: LaunchMode | null }>;
    setDataRoot(dir: string): Promise<unknown>;
  };
  pickFolder(): Promise<string | null>;
  openFolder(which: string): Promise<void>;
  saves: {
    list(): Promise<SaveFile[]>;
    create(name: string): Promise<string>;
    remove(name: string): Promise<boolean>;
  };
  connections: {
    list(): Promise<ConnectionProfile[]>;
    save(profile: ConnectionProfile): Promise<ConnectionProfile[]>;
    remove(name: string): Promise<ConnectionProfile[]>;
    test(profile: ConnectionProfile): Promise<{ ok: boolean; code: string | null }>;
  };
  launch(request: { mode: LaunchMode; target: string }): Promise<{ ok: boolean; code?: string }>;
  onProgress(callback: (p: LaunchProgress) => void): () => void;
  backToEntry(): Promise<boolean>;
}

/**
 * 함수인 이유 — 정적 내보내기는 빌드 때 이 모듈을 Node에서 한 번 실행한다.
 * 모듈 최상단에서 `window`를 읽으면 그 시점에 터진다
 */
export function getBridge(): StarlogBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { starlog?: StarlogBridge }).starlog;
}

/**
 * 진단 코드를 사람 말로.
 *
 * **백엔드는 코드만 넘기고 문장은 여기 있다** (`DiagnosticCode.java`).
 * 예외 메시지를 그대로 보여주면 "Connection to ep-xxx.neon.tech:5432 refused"가 뜬다 —
 * 맞는 말이지만 뭘 고쳐야 하는지는 안 알려준다
 */
export const DIAGNOSTIC_MESSAGE: Record<string, { title: string; hint: string }> = {
  DB_UNREACHABLE: {
    title: "데이터베이스에 연결하지 못했습니다",
    hint: "주소에 오타가 없는지, 인터넷이 연결돼 있는지 확인해 주세요.",
  },
  DB_AUTH_FAILED: {
    title: "사용자명 또는 비밀번호가 맞지 않습니다",
    hint: "눈 버튼을 눌러 입력한 값을 확인해 주세요.",
  },
  DB_NOT_FOUND: {
    title: "그 이름의 데이터베이스가 없습니다",
    hint: "주소 끝의 데이터베이스 이름을 확인해 주세요.",
  },
  DB_NOT_EMPTY: {
    title: "이 데이터베이스는 비어있지 않습니다",
    hint: "다른 프로그램의 테이블이 들어 있습니다. 스키마 칸에 이름을 하나 적으면 그 안에만 만들어 함께 쓸 수 있습니다.",
  },
  SCHEMA_TOO_NEW: {
    title: "앱을 업데이트해야 합니다",
    hint: "이 데이터베이스는 지금 앱보다 최신 버전으로 만들어졌습니다.",
  },
  DB_UNKNOWN_ERROR: {
    title: "데이터베이스 연결에 실패했습니다",
    hint: "자세한 원인은 로그 파일에 남아 있습니다.",
  },
  DB_IN_USE: {
    title: "이 세이브파일을 이미 열고 있습니다",
    hint: "STARLOG가 이미 실행 중인지 확인해 주세요. 방금 창을 닫았다면 잠시 뒤 다시 시도해 주세요.",
  },
  BACKEND_DIED: {
    title: "앱 서버가 예기치 않게 종료됐습니다",
    hint: "다시 시도해 주세요. 반복되면 로그 파일을 확인해 주세요.",
  },
};

export function diagnosticOf(code: string | undefined | null) {
  return DIAGNOSTIC_MESSAGE[code ?? ""] ?? DIAGNOSTIC_MESSAGE.BACKEND_DIED;
}
