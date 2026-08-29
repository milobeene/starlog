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
  /**
   * 소개문의 한국어 번역. 없으면 null — 화면이 [번역] 버튼을 띄운다.
   * ⚠️ **원문을 대체하지 않는다** — 둘 다 오고 화면이 토글로 바꾼다
   */
  summaryKo: string | null;
  storyline: string | null;
  /** 스토리라인의 한국어 번역. 소개문과 **한 묶음으로** 번역된다 */
  storylineKo: string | null;
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

/* ── 삭제한 항목 (GET /api/backlog/deleted) ────────────────── */

/**
 * **만료 시각이 없다.** 삭제한 항목은 기한 없이 남는다 — 지우는 배치가 없다.
 * 30일은 게임이 아니라 회원 탈퇴 유예(FR-AUTH-09)의 기간이다
 */
export interface DeletedEntry {
  entryId: number;
  displayName: string;
  deletedAt: string;
}

/**
 * 완전 삭제 버튼 옆에 붙는 미리보기.
 *
 * 회차·취득은 **개수만** 온다 — 되살리면 통째로 돌아오므로 목록을 늘어놓을 이유가 없고,
 * "몇 개나 딸려 있었나"가 지울지 말지의 실제 판단 기준이다
 */
export interface DeletedEntryDetail {
  entryId: number;
  displayName: string;
  deletedAt: string;
  createdAt: string;
  coverImageId: string | null;
  rating: number | null;
  playTimeHours: number | null;
  memo: string | null;
  genres: string[];
  playthroughCount: number;
  acquisitionCount: number;
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

/**
 * 월별 완료 추이 (GET /api/stats/completions/monthly).
 *
 * `MonthlySpending`과 같은 모양이다 — 대시보드에서 나란히 서므로 읽는 법이 같아야 한다.
 * 다른 것은 통화가 없다는 것과, 요약이 **평균이 아니라 합계**라는 것뿐이다
 */
export interface MonthlyCompletions {
  /** items — 그 달에 완료한 게임의 표시명(오버라이드 반영). 이름순 정렬 */
  months: { period: string; count: number; items: string[] }[];
  years: { year: number; count: number }[];
}

/** GET /api/system/settings — 앱 설정(키). 사용량 탭이 "키가 있나"를 이걸로 본다 */
export interface AppSettings {
  igdbClientId: string;
  igdbClientSecret: string;
  fromBootConfig: boolean;
  translateApiKey: string;
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

/* ── 백업 (GET /api/me/export · POST /api/me/import) ───────── */

/**
 * 회원 데이터 한 벌. **자격증명은 안 담긴다** — 이 파일은 동기화 폴더에 놓일 물건이다.
 *
 * 커버는 `storageKey`만 담는다. 실물은 R2에 남으므로 **R2까지 버리면 그 키는 무용지물**이다.
 * 백엔드 `MemberExport`의 주석이 더 자세하다.
 *
 * 화면이 이 타입을 깊게 쓰지는 않는다 — 내려받아 그대로 파일로 저장하는 게 전부다.
 * 여기 적어 두는 건 contract-check가 백엔드 응답과 대조하게 하려는 것이다
 */
export interface MemberExport {
  formatVersion: number;
  exportedAt: string;
  profile: {
    email: string;
    nickname: string | null;
    memo: string | null;
    backgroundColors: string[] | null;
  };
  catalog: {
    platforms: string[];
    accounts: { label: string; platform: string }[];
    devices: { deviceType: string; label: string; memo: string | null }[];
    emulators: { name: string; memo: string | null }[];
    inputMethods: string[];
    subscriptions: unknown[];
    tags: string[];
    genres: string[];
  };
  games: unknown[];
  entries: unknown[];
}

/**
 * 스크린샷 한 장 (GET /api/backlog/{id}/screenshots).
 *
 * **DB에 행이 없다** — 폴더를 읽은 결과다 (architecture §10-1). 그래서 id가 없고
 * 파일명이 곧 키다
 */
export interface ScreenshotResponse {
  fileName: string;
  url: string;
  sizeBytes: number;
}

/* ── 시스템 (GET /api/system) ──────────────────────────────── */

/** GET /api/system — 내 키가 한도에 얼마나 가까운지 (v1.0 8단계) */
export interface SystemStatus {
  apiUsage: ApiUsage[];
  storage: { coverCount: number; totalBytes: number; configured: boolean };
  /**
   * 데이터 크기. `sizeBytes`는 **내 테이블 합**, `totalBytes`가 DB 전체다 —
   * 클라우드에서 전체만 보면 7MB가 시스템 카탈로그라 숫자가 안 움직인다
   */
  database: {
    product: string;
    sizeBytes: number | null;
    totalBytes: number | null;
    coverBytes: number;
    mediaBytes: number;
  };
  /** 호출 기록 보존 기간. 화면이 "N일치만 보관합니다"로 쓴다 */
  retentionDays: number;
  /**
   * 번역 사용량. ⚠️ **다른 API와 단위가 다르다** — 횟수가 아니라 글자 수고,
   * 넘으면 거절이 아니라 요금이다
   */
  translation: {
    usedChars: number;
    guardChars: number;
    freeChars: number;
    remainingChars: number;
    usedTodayChars: number;
    /** 사람이 적어둔 하루 한도. **null이면 게이지를 안 그린다** */
    dailyLimitChars: number | null;
  };
}

/**
 * 한 API의 사용량.
 *
 * **한도는 서버가 안 준다.** 벤더가 언제든 바꾸고 우리가 조회할 방법도 없어서,
 * 서버가 숫자를 주면 그게 조용히 거짓말이 된다 → `lib/apiLimits.ts`가 기준일과 함께 들고 있다
 */
export interface ApiUsage {
  provider: string;
  lastMinute: number;
  lastHour: number;
  lastDay: number;
  lastMonth: number;
  failedLastDay: number;
  /** 기록이 시작된 시점. null이면 아직 한 번도 안 불렀다 */
  since: string | null;
}

/** GET /api/games/master — 마스터 게임만. IGDB 결과가 섞이지 않아 gameId가 항상 있다 */
export interface GameMaster {
  gameId: number;
  name: string;
  source: GameSource;
  externalId: string | null;
  releasedOn: string | null;
  coverImageId: string | null;
  lastSyncedAt: string | null;
}

/** POST /api/games/{id}/resync — 무엇이 몇 건 바뀌었는지 */
export interface GameResyncResult {
  nameChanged: boolean;
  renamedEntries: number;
  reorderedEntries: number;
}
