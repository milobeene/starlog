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

export type InputMethod = "XINPUT" | "NINTENDO" | "PLAYSTATION" | "KEYBOARD_MOUSE";
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
}

/* ── 상세 (GET /api/backlog/{entryId}) ────────────────────── */

export interface ResolvedInfo {
  name: string;
  developers: string[];
  publishers: string[];
  releasedOn: string | null;
  listPrice: Money | null;
  genres: string[];
}

export interface MasterInfo extends ResolvedInfo {
  gameId: number;
  source: GameSource;
  /** IGDB `game_time_to_beats.normally` — 클리어까지 걸리는 평균 시간. 참고값이라 오버라이드 대상이 아니다 */
  timeToBeatHours: number | null;
  /** IGDB `cover.image_id`. URL이 아니라 id다 — 크기는 표시하는 쪽이 고른다 */
  coverImageId: string | null;
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

export interface Playthrough {
  playthroughId: number;
  sequenceNo: number;
  startedOn: string;
  finishedOn: string | null;
  status: PlaythroughStatus;
  label: string | null;
  device: NamedRef | null;
  emulator: NamedRef | null;
  platformAccount: PlatformAccountRef | null;
  inputMethod: InputMethod | null;
}

export interface Acquisition {
  acquisitionId: number;
  method: AcquisitionMethod;
  platform: NamedRef | null;
  platformAccount: PlatformAccountRef | null;
  subscription: { subscriptionId: number; serviceName: string } | null;
  price: Money | null;
  acquiredOn: string | null;
  label: string | null;
}

export interface BacklogDetail {
  entryId: number;
  status: EntryStatus;
  coverUrl: string | null;
  resolved: ResolvedInfo;
  master: MasterInfo;
  overrides: OverrideInfo;
  personalRecord: PersonalRecord;
  tags: string[];
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
}

export interface MemberDevice {
  memberDeviceId: number;
  label: string;
  memo: string | null;
  device: NamedRef;
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
  platformAccounts: PlatformAccountRef[];
  devices: MemberDevice[];
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

/* ── 게임 검색 (GET /api/games?q=) ────────────────────────── */

export interface GameSearchResult {
  gameId: number;
  name: string;
  releasedOn: string | null;
  source: GameSource;
}
