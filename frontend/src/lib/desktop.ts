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

/**
 * 무엇을 스토리지에 올릴 것인가 (사용자 결정 2026-08-28).
 *
 * **커버와 스크린샷을 따로 켠다.** 커버는 몇 KB지만 스크린샷은 장당 2~5MB에 수백 장이라
 * 무료 티어 버킷이 먼저 찬다 — 하나로 묶으면 "커버만 클라우드에"가 표현이 안 된다.
 * 체크 안 한 것은 데이터 폴더에 저장된다
 */
export interface MediaTargets {
  covers: boolean;
  screenshots: boolean;
}

export interface ConnectionProfile {
  name: string;
  db: DbConfig;
  storage?: StorageConfig;
  igdb?: { clientId?: string; clientSecret?: string };
  /**
   * Google Cloud Translation API 키.
   *
   * IGDB와 같은 길로 들어간다 — 여기 값은 **부팅 기본값**이고, 앱 안(`app_setting`)에서
   * 넣은 값이 있으면 그게 이긴다
   */
  translate?: { apiKey?: string };
  mediaTargets?: MediaTargets;
}

export type LaunchProgress =
  | { phase: "starting" }
  | { phase: "waiting" }
  | { phase: "ready" }
  /** `message`는 코드가 없는 실패(IPC 예외)의 원문이다 — 진단 코드가 못 담는 사연이 있다 */
  | {
      phase: "error";
      code: string;
      exitCode?: number;
      message?: string;
      /**
       * 무엇을 띄우려다 실패했나.
       *
       * ⚠️ **화면 상태로는 못 안다** — 기동이 실패하면 창이 입구로 **통째로 다시 로드**되어
       * 리액트 상태가 통째로 날아간다. 그래서 일렉트론이 실어 보낸다
       */
      mode?: LaunchMode;
      target?: string;
    };

/** 백업 한 벌 (9단계). 세이브파일과 같은 `.mv.db`라 고르면 바로 열 수 있다 */
export interface BackupFile {
  fileName: string;
  label: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * 백업 목록 + 한도.
 *
 * **한도를 지금 쓰는 값과 나란히 보여줘야 한다** — 안 그러면 "왜 지워졌지"가 생긴다
 */
export interface BackupUsage {
  items: BackupFile[];
  count: number;
  totalBytes: number;
  keepCount: number;
  keepBytes: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  code: string | null;
  database: { ok: boolean };
  storage: { ok: boolean; message?: string } | null;
  igdb: { ok: boolean; message?: string } | null;
  /** ⚠️ 글자를 안 쓰는 방법(`languages`)으로 시험한다 — 번역은 테스트가 곧 돈이 될 수 있다 */
  translate: { ok: boolean; message?: string } | null;
}

/** 지금 붙어 있는 대상. `alive`면 [최근 접속]이 즉시 이동이다 */
export interface SessionInfo {
  mode: LaunchMode;
  target: string;
  alive: boolean;
}

export interface StarlogBridge {
  settings: {
    get(): Promise<{ dataRoot: string; dirs: Record<string, string>; lastMode: LaunchMode | null }>;
    setDataRoot(dir: string): Promise<unknown>;
    /** 바꾸기 전에 살펴본다. `ok: false`면 `reason`을 그대로 보여주면 된다 */
    inspectDataRoot(dir: string): Promise<{
      ok: boolean;
      reason?: string;
      path?: string;
      exists?: boolean;
      /** 네 폴더가 이미 다 있나 */
      ready?: boolean;
      saveCount?: number;
    }>;
  };
  pickFolder(): Promise<string | null>;
  openFolder(which: string): Promise<void>;
  /** 스크린샷 폴더처럼 백엔드가 알려준 절대 경로. 데이터 루트 밖은 일렉트론이 거부한다 */
  openPath(target: string): Promise<void>;
  saves: {
    list(): Promise<SaveFile[]>;
    create(name: string): Promise<string>;
    /** 이름 바꾸기. **백업 폴더도 함께 따라간다** — 안 그러면 백업이 주인을 잃는다 */
    rename(from: string, to: string): Promise<string>;
    remove(name: string): Promise<boolean>;
  };
  connections: {
    list(): Promise<ConnectionProfile[]>;
    save(profile: ConnectionProfile): Promise<ConnectionProfile[]>;
    remove(name: string): Promise<ConnectionProfile[]>;
    /**
     * 연결 테스트. **부분별로 답한다** — "연결 실패" 한 줄이면 DB가 문제인지
     * 키가 문제인지 알 수가 없다. 안 채운 항목은 `null`(=시험하지 않음)
     */
    test(profile: ConnectionProfile): Promise<ConnectionTestResult>;
  };
  backups: {
    usage(saveName: string): Promise<BackupUsage>;
    create(saveName: string): Promise<{ fileName: string; removed: string[] }>;
    /** 되돌리기 — 새 세이브파일 이름을 돌려준다. 원본은 그대로 남는다 */
    restore(saveName: string, fileName: string): Promise<string>;
    remove(saveName: string, fileName: string): Promise<boolean>;
  };
  session: {
    current(): Promise<SessionInfo | null>;
    /**
     * 살아 있는 백엔드의 포트. `null`이면 새로 띄워야 한다.
     *
     * **창을 옮기지 않는다** — 포트만 준다. 옮기는 건 화면 라우터의 일이다
     */
    resume(): Promise<{ port: number } | null>;
  };
  /** 클라우드 → 로컬 세이브파일. ⚠️ 커버 실물은 안 따라온다 */
  cloudToSaveFile(saveName: string): Promise<{ saveName: string }>;
  /**
   * 로컬 세이브파일 → 지금 붙은 데이터베이스. **덮어쓴다.**
   *
   * ⚠️ `safetySaveName`은 덮어쓰기 직전에 자동으로 뜬 안전망이다 —
   * 화면이 이 이름을 알려줘야 "아차" 했을 때 돌아갈 데를 안다
   */
  saveFileToCloud(saveName: string): Promise<{
    entries: number;
    games: number;
    safetySaveName: string;
  }>;
  /** 성공하면 `port`가 온다. 그 포트로 API 주소를 세우고 화면이 스스로 들어간다 */
  launch(request: {
    mode: LaunchMode;
    target: string;
  }): Promise<{ ok: boolean; code?: string; port?: number }>;
  onProgress(callback: (p: LaunchProgress) => void): () => void;
  backToEntry(): Promise<boolean>;
  /**
   * 지금 백엔드 포트 (**동기**). `lib/apiBase.ts`가 모듈을 불러올 때 쓴다 —
   * 그 시점에 비동기로 물어보면 첫 요청 몇 개가 주소 없이 나간다
   */
  backendPort(): number | null;
  /**
   * "입구로 가라". 백엔드가 혼자 죽었거나 앱 안에서 [나가기]를 눌렀을 때 온다.
   * 예전엔 일렉트론이 문서를 다시 로드했지만 이제는 알리기만 한다
   */
  onGoEntry(callback: () => void): () => void;
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
  /*
   * 기동이 **시작도 못 한** 경우 (2026-08-28). 이름 규칙에 안 맞는 세이브파일이 대표적이다 —
   * 탐색기에서 손으로 바꾸면 목록엔 뜨는데 열리지가 않는다. 예전엔 예외가 그냥 사라져서
   * **로딩 화면이 영영 안 걷혔다**
   */
  LAUNCH_REFUSED: {
    title: "이 세이브파일을 열 수 없습니다",
    hint: "파일 이름에 쓸 수 없는 글자가 있는지 확인해 주세요. 목록에서 이름 바꾸기로 고칠 수 있습니다.",
  },
  /*
   * ⚠️ **이 하나만 "할 일"이 정해져 있다** (2026-08-28). 다른 실패는 값을 고치거나
   * 다시 시도하면 되지만, 손상은 **백업에서 되돌리는 것 말고 방법이 없다.**
   * 그래서 안내만 띄우지 않고 입구 화면이 [백업에서 되돌리기] 버튼을 붙인다
   */
  DB_CORRUPTED: {
    title: "세이브파일이 손상됐습니다",
    hint: "파일 일부가 잘렸습니다. 백업에서 되돌리면 그 시점의 기록을 그대로 살릴 수 있습니다.",
  },
  BACKEND_DIED: {
    title: "앱 서버가 예기치 않게 종료됐습니다",
    hint: "다시 시도해 주세요. 반복되면 로그 파일을 확인해 주세요.",
  },
  /*
   * 아래 둘은 DB가 아니라 **앱이 자기 몸을 못 찾는** 경우다 (2026-08-28).
   * 예전엔 이 상황에서 일렉트론이 그냥 죽어 창이 안내도 없이 사라졌다
   */
  JAVA_NOT_FOUND: {
    title: "자바를 찾지 못했습니다",
    hint: "STARLOG를 실행하려면 자바 21 이상이 필요합니다. 설치 후 앱을 다시 열어 주세요.",
  },
  JAR_MISSING: {
    title: "앱 서버 파일이 없습니다",
    hint: "설치가 온전하지 않습니다. 앱을 다시 설치해 주세요.",
  },
};

export function diagnosticOf(code: string | undefined | null) {
  return DIAGNOSTIC_MESSAGE[code ?? ""] ?? DIAGNOSTIC_MESSAGE.BACKEND_DIED;
}
