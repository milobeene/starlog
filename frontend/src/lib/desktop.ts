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

export type IngestPhase = "copying" | "verifying" | "committing" | "done" | "failed" | "rolledBack";

export type IngestJob = {
  batchId: string;
  entryId: number;
  phase: IngestPhase;
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  /** 끝났을 때 최종 파일 이름 */
  committed: string[];
  failures: { source: string; reason: string }[];
  message: string | null;
  /** 옮기기(원본을 휴지통으로)인지. 옛 메인에는 없다 */
  mode?: "add" | "move";
  /** 휴지통으로 간 원본 수 · 확정 뒤 휴지통으로 못 보낸 원본(사진은 이미 STARLOG 안이다) */
  trashed?: number;
  trashFailures?: { source: string; reason: string }[];
};

/* ── 외부 스크린샷 폴더 (스팀·ShareX …) ── */

export type SourceKind = "steam" | "folder";

export interface ExternalSource {
  id: string;
  kind: SourceKind;
  name: string;
  /** 사용자가 고른 폴더. 화면에 보여주기만 한다 — 화면이 경로로 뭔가를 시키지는 못한다 */
  path: string;
  /** 폴더가 지금 열리는가 (뽑아 둔 외장 디스크가 빠졌을 때 false) */
  ok: boolean;
  reason: string | null;
}

export interface InboxItem {
  /** 등록 폴더 기준 상대 경로(`/`). 파일을 가리키는 유일한 이름이다 */
  rel: string;
  name: string;
  kind: "IMAGE" | "VIDEO";
  contentType: string;
  sizeBytes: number;
  takenAtMs: number;
  /** `starlog-media://src/…` · `srcthumb/…` */
  url: string;
  thumbUrl: string;
  placeholder: string | null;
  width: number | null;
  height: number | null;
}

export interface InboxGroup {
  /** 스팀은 appid, 폴더는 상대 하위 폴더(빈 문자열 = 바로 아래) */
  key: string;
  title: string;
  sub: string | null;
  count: number;
  items: InboxItem[];
}

export interface InboxScan {
  sourceId: string;
  kind: SourceKind;
  /** 파일이 너무 많아 훑기가 중간에 멈췄다 — 목록이 전부가 아니다 */
  truncated?: boolean;
  groups: InboxGroup[];
}

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
 * 커버를 어디에 둘지 (2026-10-25, 예전 "스토리지 사용" 체크박스 자리). 서버 `STARLOG_COVER_TARGET`과 같은 글자.
 * 못 하는 쪽(스토리지 자격증명이 없다 등)을 고르면 서버가 db로 떨어뜨린다. 스크린샷은 늘 데이터 폴더다
 */
export type CoverTarget = "db" | "local" | "storage";

/** 비밀 칸. `connections.list()`는 이 칸들을 가려서(`••••abcd`) 준다 */
export type SecretFieldPath =
  | "db.password"
  | "storage.accessKey"
  | "storage.secretKey"
  | "igdb.clientSecret"
  | "translate.apiKey";

export interface ConnectionProfile {
  name: string;
  /**
   * 저장된 진짜 값이 있는 비밀 칸 (목록에서 온 것만). 그 칸의 값은 **가린 모양**이다 —
   * 그대로 저장·테스트하면 일렉트론이 진짜 값으로 바꿔 쓰고, 눈 버튼은 `connections.reveal`로 받아온다
   */
  hasSecret?: Partial<Record<SecretFieldPath, boolean>>;
  /** 키체인에서 못 푼 연결. 비밀 칸을 다시 입력해야 한다 */
  locked?: boolean;
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
  /** 옛 연결은 없다 — 일렉트론이 읽을 때 채워 준다 (옛 체크박스가 켜져 있었으면 storage, 아니면 db) */
  coverTarget?: CoverTarget;
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
       * 무엇을 띄우려다(또는 열고 있다가) 실패했나.
       *
       * ⚠️ **화면 상태로는 못 안다** — 앱 안에서 서버가 죽으면 입구로 라우팅되며 무엇을 열고
       * 있었는지를 잃는다. 그래서 일렉트론이 실어 보낸다
       */
      mode?: LaunchMode;
      target?: string;
    };

/** 백업 한 벌 (9단계). 세이브 폴더를 묶은 `.tar.gz`다 — 되돌리면 새 세이브파일이 하나 생긴다 */
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

/** 클라우드 백업 한 장 (2026-10-25). 지금 연결의 내보내기 JSON을 gzip한 것 — 풀면 새 로컬 세이브가 생긴다 */
export type CloudBackupKind = "auto" | "manual";

export interface CloudBackupFile {
  kind: CloudBackupKind;
  fileName: string;
  label: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CloudBackupList {
  /** 최신이 앞. 자동·수동이 섞여 있다 */
  items: CloudBackupFile[];
  /** 종류별 폴더의 절대 경로. 아직 없으면 null */
  folders: Record<CloudBackupKind, string | null>;
  autoCount: number;
  keepAuto: number;
}

/** 메인이 들고 있는 마지막 상태. `seq`가 같으면 이미 본 것이다 */
export interface CloudBackupStatus {
  seq: number;
  kind: CloudBackupKind;
  phase: "running" | "done" | "failed" | "skipped";
  target: string;
  fileName?: string;
  sizeBytes?: number;
  autoCount?: number;
  keepAuto: number;
  message?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  code: string | null;
  /** ⚠️ `scope: "storage"`면 null이다 — DB는 안 봤다 (스토리지는 메모리 DB 시험용으로 본다) */
  database: { ok: boolean } | null;
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

/** 스크린샷·영상 한 개 — 파일명은 게임 폴더 안에서만 유일하다 */
export interface MediaTarget {
  entryId: number;
  fileName: string;
}

export interface StarlogBridge {
  settings: {
    get(): Promise<{
      dataRoot: string;
      dirs: Record<string, string>;
      lastMode: LaunchMode | null;
      /** 로컬 세이브의 커버 위치. 옛 일렉트론엔 없다 */
      localCoverTarget?: Exclude<CoverTarget, "storage">;
    }>;
    setDataRoot(dir: string): Promise<unknown>;
    /** 로컬 세이브의 커버 위치 — 다음에 세이브를 열 때부터. 옛 preload에는 없다 → `?.` */
    setLocalCoverTarget?(value: Exclude<CoverTarget, "storage">): Promise<unknown>;
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
  /**
   * 배경 색 캐시·프리셋 (F4). 일렉트론이 `settings.json`에 들고 있다 — 입구는 백엔드가 없어
   * 프로필을 못 읽고, 본 앱 포트가 매번 달라 localStorage도 이어지지 않는다.
   * 옛 preload에는 없을 수 있다 → 부르는 쪽은 `?.`로 쓴다
   */
  background?: {
    /** 동기. 첫 프레임 전에 알아야 기본색이 번쩍이지 않는다 */
    get(): { colors: string[] | null };
    set(patch: { colors?: string[] | null }): void;
  };
  /**
   * 스크린샷 공유 (F5). 옛 preload에는 없을 수 있다 → 부르는 쪽은 `?.`로 쓴다.
   * `copy`는 하나면 그림(PNG·JPEG) 또는 파일, **둘 이상이면 전부 파일 참조**다 (최대 500)
   */
  media?: {
    copy(target: MediaTarget | MediaTarget[]): Promise<
      | { ok: true; as: "image" | "file"; count: number }
      | { ok: false; reason: "NOT_FOUND"; failed: MediaTarget[] }
      | { ok: false; reason: "UNSUPPORTED" }
    >;
    /** 호출할 때마다 폴더를 묻는다. 취소하면 `canceled: true` */
    saveTo(targets: MediaTarget[]): Promise<
      | { canceled: true }
      | {
          canceled: false;
          folder: string;
          saved: MediaTarget[];
          failed: (MediaTarget & { reason: string })[];
        }
    >;
    /** 배경 썸네일 진행 (세션을 열 때). 20장 미만이면 안 온다. 옛 preload에는 없다 */
    onProgress?(callback: (p: { phase: "run" | "done" | "canceled"; done: number; total: number }) => void): () => void;
    /** 게임 폴더가 바뀌었다 (탐색기로 넣고 지움) — 열린 목록을 다시 읽는다 */
    onChanged?(callback: (c: { folder: string; thumbs?: boolean }) => void): () => void;
    /** 배경 썸네일 중단 */
    cancelPrepare?(): Promise<number>;
    /** 끌어놓은 파일의 실제 경로 (클립보드·Blob이면 null). 옛 preload에는 없다 */
    pathOf?(file: File): string | null;
    /** 경로로 넣기 — 메인이 복사·검증·커밋한다. 바로 `{batchId}`, 진행은 `onIngest`·`ingestStatus` */
    ingest?(req: { entryId: number; sources: string[]; takenAt?: Record<string, number> }): Promise<{ batchId: string }>;
    onIngest?(callback: (job: IngestJob) => void): () => void;
    ingestStatus?(): Promise<IngestJob[]>;
    /** 미디어 폴더가 있는 드라이브 — 남은 공간과 사용자가 붙인 이름 */
    driveInfo?(): Promise<{ root: string; label: string | null; freeBytes: number; totalBytes: number }>;
    setDriveLabel?(label: string | null): Promise<void>;
    /** 속도 기록이 켜져 있나 (동기) · 기록 한 줄 — `STARLOG_MEDIA_TIMING=1`일 때만 남는다 */
    timingOn?(): boolean;
    timing?(event: string, data: Record<string, number | string | boolean>): void;
  };
  /** 외부 스크린샷 폴더. 옛 preload에는 없다 → `?.` */
  sources?: {
    list(): Promise<ExternalSource[]>;
    /** 폴더는 일렉트론이 네이티브 창으로 고른다. 취소하면 `canceled: true` */
    add(req: { kind: SourceKind; name: string }): Promise<{ canceled: true } | { canceled: false; source: ExternalSource }>;
    rename(id: string, name: string): Promise<void>;
    remove(id: string): Promise<boolean>;
    scan(id: string): Promise<InboxScan>;
    /** `{appid: entryId}` — 이 PC에서 마지막으로 그 appid를 옮긴 게임 */
    memory(): Promise<Record<string, number>>;
    watch(): Promise<void>;
    unwatch(): Promise<void>;
    onChanged(callback: (c: { sourceId: string }) => void): () => void;
    /** 복사·검증·확정이 다 끝난 뒤에만 원본을 휴지통으로. 진행은 `media.onIngest`(`mode: "move"`) */
    move(req: { sourceId: string; groupKey: string; rels: string[]; entryId: number }): Promise<{ batchId: string }>;
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
    /** 비밀 칸은 가려서 온다 (`hasSecret`) */
    list(): Promise<ConnectionProfile[]>;
    /** 가린 값을 안 고쳤으면 저장된 진짜 값이 남는다. 이름을 고쳤으면 `previousName`에 옛 이름 */
    save(profile: ConnectionProfile, options?: { previousName?: string }): Promise<ConnectionProfile[]>;
    remove(name: string): Promise<ConnectionProfile[]>;
    /** 눈 버튼 — 저장된 연결 `name`의 칸 하나. 옛 preload에는 없다 */
    reveal?(name: string, field: SecretFieldPath): Promise<string>;
    /**
     * 연결 테스트. **부분별로 답한다** — "연결 실패" 한 줄이면 DB가 문제인지
     * 키가 문제인지 알 수가 없다. 안 채운 항목은 `null`(=시험하지 않음)
     */
    test(
      profile: ConnectionProfile,
      /**
       * `"all"`은 전부, 나머지는 그 하나만 본다.
       * DB는 **열어 보기만** 하고(스키마를 만들지 않는다), 스토리지·키는 **메모리 DB** 시험용으로 본다 —
       * 사용자의 DB가 틀려도 스토리지만 따로 볼 수 있어야 섹션별 테스트가 뜻을 갖는다
       */
      options?: { scope?: "all" | "db" | "storage"; previousName?: string },
    ): Promise<ConnectionTestResult>;
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
    resume(): Promise<{ port: number; reload?: boolean } | null>;
    /**
     * 지금 서버의 API 토큰 (**동기**). 서버를 띄울 때마다 바뀐다. 옛 preload에는 없다.
     * `lib/api.ts`가 `X-Starlog-Token`에, 미디어 주소에는 `t=`로 싣는다
     */
    token?(): string | null;
  };
  /** 클라우드 → 로컬 세이브파일. DB 커버는 따라오고, ⚠️ 스토리지·로컬 폴더 커버는 실물이 안 따라온다 */
  cloudToSaveFile(saveName: string): Promise<{ saveName: string }>;
  /**
   * 클라우드 백업. 대상은 언제나 **지금 세션**이다. 옛 preload에는 없다 → `?.`로 쓴다.
   * 자동은 하루 한 번·10개까지(넘치면 오래된 것부터), 수동은 저절로 안 지운다
   */
  cloudBackups?: {
    list(): Promise<CloudBackupList>;
    /** `<연결> 2026-10-25 18.10` — 수동 폴더에 있으면 `-2`… */
    suggestName(): Promise<string>;
    create(name: string): Promise<CloudBackupStatus>;
    /** 새 로컬 세이브로 푼다. 이름을 안 주면 겹치지 않는 이름을 짓는다 */
    restore(kind: CloudBackupKind, fileName: string, saveName?: string): Promise<{ saveName: string }>;
    /** 수동만 */
    remove(kind: CloudBackupKind, fileName: string): Promise<boolean>;
    openFolder(kind: CloudBackupKind): Promise<void>;
    status(): Promise<Record<CloudBackupKind, CloudBackupStatus | null>>;
    onStatus(callback: (status: CloudBackupStatus) => void): () => void;
  };
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
  /**
   * 성공하면 `port`가 온다. 그 포트로 API 주소를 세우고 화면이 스스로 들어간다.
   * `reload`면 지금 문서의 CSP에 이 연결의 스토리지 주소가 없다 — 문서를 새로 받아야 커버가 뜬다.
   * `resume`은 [최근 접속] — 없어진 세이브를 같은 이름의 빈 세이브로 만들지 않고 거절한다.
   * `code: "SUPERSEDED"`는 [취소]나 뒤이은 기동에 밀린 것이다 — 아무것도 띄우지 않는다
   */
  launch(request: {
    mode: LaunchMode;
    target: string;
    resume?: boolean;
  }): Promise<{ ok: boolean; code?: string; port?: number; reload?: boolean }>;
  /** 기동 대기 중의 [취소]. 옛 preload에는 없다 */
  cancelLaunch?(): Promise<boolean>;
  /** 앱 안에서 서버가 죽어 입구로 왔을 때의 이유. 한 번 가져가면 지워진다. 옛 preload에는 없다 */
  takeLaunchError?(): Promise<Extract<LaunchProgress, { phase: "error" }> | null>;
  onProgress(callback: (p: LaunchProgress) => void): () => void;
  backToEntry(): Promise<boolean>;
  /**
   * 지금 백엔드 포트 (**동기**). `lib/apiBase.ts`가 모듈을 불러올 때 쓴다 —
   * 그 시점에 비동기로 물어보면 첫 요청 몇 개가 주소 없이 나간다
   */
  backendPort(): number | null;
  /**
   * "입구로 가라". 백엔드가 혼자 죽었거나 앱 안에서 [나가기]를 눌렀을 때 온다.
   * 죽은 이유는 이 이벤트에 안 실린다 — 입구가 마운트되며 `takeLaunchError`로 가져간다
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
 * **백엔드는 코드만 넘기고 문장은 여기 있다** (`server/src/diagnose.ts`).
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
  /* 90초 안에 안 떴다 — 일렉트론이 띄우던 서버를 내렸다. 콜드스타트·느린 회선이면 다시 누르면 된다 */
  TIMEOUT: {
    title: "앱 서버가 제때 뜨지 않았습니다",
    hint: "띄우던 서버는 내렸습니다. 데이터베이스가 깨어나는 중일 수 있으니 잠시 뒤 다시 시도해 주세요.",
  },
  /* [최근 접속]이 가리키던 세이브파일이 사라졌다 — 같은 이름의 빈 세이브를 만들지 않고 멈춘다 */
  SAVE_MISSING: {
    title: "그 세이브파일이 없습니다",
    hint: "지웠거나 이름이 바뀐 것 같습니다. 로컬 세이브파일 목록에서 골라 주세요.",
  },
  CONNECTION_MISSING: {
    title: "그 연결 설정이 없습니다",
    hint: "지웠거나 이름이 바뀐 것 같습니다. 데이터베이스 연결 목록에서 골라 주세요.",
  },
  /* 키체인 항목이 사라졌거나 다른 컴퓨터에서 옮겨 온 connections.json — 지우지 않고 다시 입력을 받는다 */
  CREDENTIALS_LOCKED: {
    title: "저장된 비밀번호를 열지 못했습니다",
    hint: "이 연결의 비밀번호와 키를 다시 입력해 저장해 주세요. 다른 값은 그대로 남아 있습니다.",
  },
  /* 일렉트론이 서버에 실행 토큰을 안 넘겼다 — 정상 설치라면 생길 수 없다 */
  API_TOKEN_MISSING: {
    title: "앱 서버를 안전하게 띄우지 못했습니다",
    hint: "앱을 완전히 종료한 뒤 다시 열어 주세요. 반복되면 앱을 다시 설치해 주세요.",
  },
  /* 환경변수로 개발 모드가 켜진 채 앱을 띄웠다 — 개발 모드는 인증을 끄므로 거절한다 */
  DEV_PROFILE_WITH_TOKEN: {
    title: "개발용 설정이 켜져 있어 열 수 없습니다",
    hint: "STARLOG_PROFILE 환경변수를 지운 뒤 앱을 다시 열어 주세요.",
  },
  BACKEND_DIED: {
    title: "앱 서버가 예기치 않게 종료됐습니다",
    hint: "다시 시도해 주세요. 반복되면 로그 파일을 확인해 주세요.",
  },
  /*
   * DB가 아니라 **앱이 자기 몸을 못 찾는** 경우다 (2026-08-28).
   * 예전엔 이 상황에서 일렉트론이 그냥 죽어 창이 안내도 없이 사라졌다.
   * v2: 자바 시절의 `JAVA_NOT_FOUND`·`JAR_MISSING` 둘이 이거 하나가 됐다 — 서버가 일렉트론 안의 Node로 돈다
   */
  SERVER_MISSING: {
    title: "앱 서버 파일이 없습니다",
    hint: "설치가 온전하지 않습니다. 앱을 다시 설치해 주세요.",
  },
};

export function diagnosticOf(code: string | undefined | null) {
  return DIAGNOSTIC_MESSAGE[code ?? ""] ?? DIAGNOSTIC_MESSAGE.BACKEND_DIED;
}

/**
 * 일렉트론이 던진 오류의 사람 말 부분만. IPC를 건너오면 `Error invoking remote method 'x': Error: …`가
 * 앞에 붙는다 — 그대로 띄우면 안내문보다 그 머리가 먼저 읽힌다
 */
export function bridgeMessage(caught: unknown, fallback: string): string {
  const raw = caught instanceof Error ? caught.message : typeof caught === "string" ? caught : "";
  const clean = raw.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, "").trim();
  return clean || fallback;
}
