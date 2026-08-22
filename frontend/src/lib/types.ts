/**
 * 백엔드 DTO 미러링. docs/api-design-v0.2.md 기준.
 * 껍데기 단계라 실제 호출은 없고, 목데이터의 모양을 강제하는 용도다.
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
export type GameSource = "RAWG" | "MANUAL";
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
  /** RAWG `playtime` — 이용자 평균 플레이 시간(시간). 오버라이드 대상이 아니라 참고값이다 */
  averagePlaytimeHours: number | null;
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

/**
 * 사이드바 전용 — 전체 항목 + 태그.
 * ⚠️ 대응하는 엔드포인트가 아직 없다. 목록 API는 페이징(20건)이고 카드에 태그가 안 실린다.
 */
export interface SidebarEntry {
  entryId: number;
  displayName: string;
  tags: string[];
}
