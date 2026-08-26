/**
 * 백엔드 DTO 미러링. docs/api-design-v0.2.md 기준.
 * 아직 호출부가 없다. api.ts(N-2 이후)가 이 타입으로 응답을 받는다.
 */

export type EntryStatus =
  | "WISHLIST"
  | "BACKLOG"
  | "PLAYING"
  | "PAUSED"
  | "DROPPED"
  | "COMPLETED";

export type PlaythroughStatus = "PLAYING" | "PAUSED" | "DROPPED" | "COMPLETED";

export type AcquisitionMethod =
  | "PURCHASED"
  | "SUBSCRIPTION"
  | "FREE"
  | "GIFT"
  | "BORROWED"
  | "DEMO"
  | "NOT_OWNED";

export type BillingCycle = "MONTHLY" | "YEARLY";
export type GameSource = "IGDB" | "MANUAL";
export type Currency = "KRW" | "USD" | "JPY";

export interface Money {
  amount: number;
  currency: Currency;
}

export interface NamedRef {
  id: number;
  name: string;
}

export interface PlatformAccountRef {
  accountId: number;
  label: string;
  platform: NamedRef;
}

/* ── 목록 카드 (GET /api/backlog) ─────────────────────────── */

export interface LastPlaythroughSummary {
  sequenceNo: number;
  startedOn: string;
  finishedOn: string | null;
  deviceName: string | null;
  emulatorName: string | null;
}

export interface BacklogCard {
  entryId: number;
  coverUrl: string | null;
  displayName: string;
  genres: string[];
  rating: number | null;
  status: EntryStatus;
  lastPlaythrough: LastPlaythroughSummary | null;
  /** 마스터 커버 id (IGDB). coverUrl(개인 업로드)이 null일 때의 폴백 (§6.10) */
  coverImageId: string | null;
  /** 그룹핑 키. 카드에 뿌리는 값이 아니라 사이드바·폴더 뷰가 묶는 데 쓴다 */
  tag: string | null;
}

/* ── 상세 (GET /api/backlog/{entryId}) ────────────────────── */

/**
 * 커버 표시값 — **어느 쪽이 이겼는지 서버가 알려준다** (v1.7).
 * 크기 선택만 화면 몫이라 url이 아니라 imageId가 온다
 */
export interface CoverInfo {
  source: "PERSONAL" | "MASTER" | "NONE";
  url: string | null;
  imageId: string | null;
}

export interface ResolvedInfo {
  name: string;
  developers: string[];
  publishers: string[];
  releasedOn: string | null;
  listPrice: Money | null;
  genres: string[];
  cover: CoverInfo;
}

export interface MasterInfo {
  gameId: number;
  name: string;
  developers: string[];
  publishers: string[];
  releasedOn: string | null;
  listPrice: Money | null;
  genres: string[];
  source: GameSource;
  /** 아래는 상세 화면 전용. 표시값 규칙 밖이라 resolved에 대응 필드가 없다 (§6.2) */
  coverImageId: string | null;
  bannerImageId: string | null;
  summary: string | null;
  storyline: string | null;
  igdbRating: number | null;
  igdbRatingCount: number | null;
  releasePlatforms: string[];
  mainStoryHours: number | null;
  mainExtraHours: number | null;
  completionistHours: number | null;
  timeToBeatSamples: number | null;
}

/** null(스칼라) 또는 [](배열) = 안 덮어씀 */
export interface OverrideInfo {
  name: string | null;
  developers: string[];
  publishers: string[];
  releasedOn: string | null;
  listPrice: Money | null;
}

export interface PersonalRecord {
  rating: number | null;
  playTimeHours: number | null;
  memo: string | null;
}

export interface DeviceRef {
  deviceId: number;
  name: string;
}

export interface EmulatorRef {
  emulatorId: number;
  name: string;
}

export interface InputMethodRef {
  inputMethodId: number;
  name: string;
}

export interface PlatformRef {
  platformId: number;
  name: string;
}

/** 삭제된 계정도 그대로 실린다 — 과거 기록에서는 이름이 계속 보여야 한다 (§6.5) */
export interface AccountRef {
  accountId: number;
  label: string;
}

export interface Playthrough {
  playthroughId: number;
  sequenceNo: number;
  startedOn: string;
  finishedOn: string | null;
  status: PlaythroughStatus;
  label: string | null;
  device: DeviceRef | null;
  platformAccount: AccountRef | null;
  emulator: EmulatorRef | null;
  inputMethod: InputMethodRef | null;
}

export interface Acquisition {
  acquisitionId: number;
  method: AcquisitionMethod;
  platform: PlatformRef | null;
  platformAccount: AccountRef | null;
  subscription: { subscriptionId: number; serviceName: string } | null;
  price: Money | null;
  acquiredOn: string | null;
  label: string | null;
}

export interface BacklogDetail {
  entryId: number;
  status: EntryStatus;
  /** 담은 날짜. 상세 타임라인의 기점 */
  createdAt: string;
  resolved: ResolvedInfo;
  master: MasterInfo;
  overrides: OverrideInfo;
  personalRecord: PersonalRecord;
  /** 개인 태그. 항목당 최대 하나다 (§6.7 v1.6) */
  tag: string | null;
  /** 개인 장르 원본. 폴백 전 값이라 resolved.genres와 다를 수 있다 */
  genres: string[];
  playthroughs: Playthrough[];
  acquisitions: Acquisition[];
}

/* ── 프로필 / 설정 (GET /api/me) ──────────────────────────── */

export interface Profile {
  memberId: number;
  email: string;
  nickname: string;
  memo: string | null;
  /** 구글 sub 자체는 안 내려온다 — 화면은 연결 여부만 알면 된다 */
  googleLinked: boolean;
  /** 비밀번호가 없으면 구글 연결을 해제할 수 없다 (BR-AUTH-01) */
  hasPassword: boolean;
  /** 관리자 메뉴를 보일지 정하는 데만 쓴다. 진짜 방어선은 서버의 hasRole (AUTH-P2) */
  role: "USER" | "ADMIN";
  /**
   * 유체 배경 색 5개. **null이면 "안 골랐다"**는 뜻이고 기본 팔레트를 쓴다 —
   * 빈 배열과 구분해야 기본값을 나중에 바꿔도 안 만진 회원이 따라온다.
   * 읽을 때는 `lib/palette.ts`의 paletteOf()만 쓴다
   */
  backgroundColors: string[] | null;
}

/** 마스터에서 고르는 게 아니라 유형·라벨을 직접 적는다. memo는 마크다운 */
export interface MemberDevice {
  deviceId: number;
  deviceType: string;
  label: string;
  memo: string | null;
}

export interface MemberPlatform {
  platformId: number;
  name: string;
}

export interface MemberEmulator {
  emulatorId: number;
  name: string;
  memo: string | null;
}

export interface MemberInputMethod {
  inputMethodId: number;
  name: string;
}

export interface Subscription {
  subscriptionId: number;
  serviceName: string;
  startedOn: string;
  endedOn: string | null;
  fee: Money;
  billingCycle: BillingCycle;
  active: boolean;
}

export interface MeResponse {
  profile: Profile;
  platforms: MemberPlatform[];
  platformAccounts: PlatformAccountRef[];
  devices: MemberDevice[];
  emulators: MemberEmulator[];
  inputMethods: MemberInputMethod[];
  subscriptions: Subscription[];
}

/* ── 집계 (GET /api/backlog/facets) ───────────────────────── */

export interface FacetCount {
  id: number;
  name: string;
  count: number;
}

export interface StatusCount {
  status: EntryStatus;
  count: number;
}

/* ── 사이드바 전체 목록 (GET /api/backlog/names) ──────────── */

/** 전 항목, 이름순(대소문자 무시), 페이징 없음 */
export interface BacklogName {
  entryId: number;
  displayName: string;
}

/* ── 게임 검색 (GET /api/games?q=) ────────────────────────── */

/**
 * 검색 결과. **마스터에 없는 게임은 `gameId`가 null이고 `externalId`만 있다** —
 * 담을 때 서버가 그 id로 IGDB에서 받아와 마스터를 만든다 (GameResolver)
 */
export interface GameSearchResult {
  gameId: number | null;
  externalId: string | null;
  name: string;
  releasedOn: string | null;
  source: GameSource;
  coverImageId: string | null;
}

/* ── 집계 응답 (GET /api/backlog/facets) ──────────────────── */

export interface FacetsResponse {
  tags: FacetCount[];
  genres: FacetCount[];
  statuses: StatusCount[];
  devices: FacetCount[];
  platformAccounts: FacetCount[];
}

/* ── 통계 (GET /api/stats/**) ─────────────────────────────── */

export interface PlaytimeStats {
  totalHours: number;
  recordedEntries: number;
  top: { entryId: number; displayName: string; hours: number }[];
}

/** period는 `2026-01`. **통화를 합치지 않는다** — 환산은 범위 밖이라 축이 통화별로 갈린다 */
export interface MonthlySpending {
  currencies: string[];
  /** items — 그 달에 돈이 나간 것들의 이름. **구독이 먼저**, 그다음 게임(오버라이드 반영된 표시명) */
  months: { period: string; amounts: Record<string, number>; items: string[] }[];
  yearlyAverages: { year: number; amounts: Record<string, number> }[];
}

export interface PageResponse<T> {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  items: T[];
}

/* ── 필터 선택지 ──────────────────────────────────────────── */

/** GET /api/backlog/companies — 편집·필터 자동완성 사전 */
export interface CompanyDictionary {
  /** 오버라이드 + 마스터 전부 — 필터 자동완성용 */
  developers: string[];
  publishers: string[];
  /** 내가 직접 적어 넣은 것만 — 설정의 사전 목록용 */
  overriddenDevelopers: string[];
  overriddenPublishers: string[];
}

/** GET /api/stats/genres — **표시값 기준** 장르 분포. 개인 장르가 마스터를 덮은 결과다 */
export interface GenreDistribution {
  genre: string;
  count: number;
}

/** GET /api/me/options — 폼 선택지. 백엔드가 전부 `Ref(id, name)` 한 모양으로 준다 */
export interface AccountOption {
  id: number;
  name: string;
  platformId: number;
  platformName: string;
}

export interface OptionsResponse {
  platforms: NamedRef[];
  /** name이 "거실 스위치 (Nintendo Switch)" 꼴이다 — 라벨만으로는 기종을 모른다 */
  devices: NamedRef[];
  emulators: NamedRef[];
  inputMethods: NamedRef[];
  /**
   * 계정만 소속 플랫폼을 함께 준다 — 라벨("Beene")이 플랫폼마다 겹쳐서
   * 이름만으로는 선택지에서 구별이 안 된다
   */
  platformAccounts: AccountOption[];
  subscriptions: NamedRef[];
  tagDictionary: string[];
  genreDictionary: string[];
}

/* ── 일일 쿼터 (GET /api/me/quota) ─────────────────────────── */

/**
 * WEB-ONLY. **빈 배열이면 화면이 이 섹션을 통째로 안 그린다** —
 * 쿼터가 없는 빌드(로컬 앱)에서 서버가 빈 배열을 주므로 에러 처리가 안 늘어난다
 */
export interface QuotaStatus {
  kind: "GAME_SEARCH" | "GAME_ADD" | "COVER_UPLOAD";
  label: string;
  used: number;
  limit: number;
}

/* ── 관리자 (GET /api/admin/**) ────────────────────────────── */

/** WEB-ONLY: 시스템 탭. igdb·database.sizeBytes는 null일 수 있다 (DTO 주석 참고) */
export interface SystemStatus {
  igdb: {
    calls: number;
    rejected: number;
    maxConcurrent: number;
    minCallIntervalMillis: number;
  } | null;
  storage: { coverCount: number; totalBytes: number };
  database: { product: string; sizeBytes: number | null };
  quotaToday: {
    memberId: number;
    nickname: string;
    kind: string;
    label: string;
    used: number;
    limit: number;
  }[];
}

export interface AdminMember {
  memberId: number;
  email: string;
  nickname: string;
  role: string;
  emailVerified: boolean;
  /** null이면 승인 대기 — 그 계정은 로그인이 403이다 (FR-ADM-06) */
  approvedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** GET /api/admin/games — 마스터 게임만. IGDB 결과가 섞이지 않아 gameId가 항상 있다 */
export interface AdminGame {
  gameId: number;
  name: string;
  source: GameSource;
  externalId: string | null;
  releasedOn: string | null;
  coverImageId: string | null;
  lastSyncedAt: string | null;
}

/** POST /api/admin/games/{id}/resync — 무엇이 몇 건 바뀌었는지 */
export interface GameResyncResult {
  nameChanged: boolean;
  renamedEntries: number;
  reorderedEntries: number;
}

export interface AuditLog {
  auditLogId: number;
  actorId: number;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: number | null;
  requestIp: string | null;
  userAgent: string | null;
  occurredAt: string;
}
