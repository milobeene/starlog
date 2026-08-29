import type {
  AcquisitionMethod,
  BillingCycle,
  EntryStatus,
  GameSource,
  Money,
  PlaythroughStatus,
} from "./types";

/** enum 표시 라벨은 프론트가 정한다. 백엔드는 코드만 준다. */

export const STATUS_LABEL: Record<EntryStatus, string> = {
  WISHLIST: "위시리스트",
  BACKLOG: "백로그",
  PLAYING: "플레이 중",
  PAUSED: "일시 중단",
  DROPPED: "중도 포기",
  COMPLETED: "완료",
};

export const PLAYTHROUGH_STATUS_LABEL: Record<PlaythroughStatus, string> = {
  PLAYING: "플레이 중",
  PAUSED: "일시 중단",
  DROPPED: "중도 포기",
  COMPLETED: "완료",
};

export const ACQUISITION_METHOD_LABEL: Record<AcquisitionMethod, string> = {
  PURCHASED: "구매",
  SUBSCRIPTION: "구독",
  FREE: "무료 배포",
  GIFT: "선물",
  BORROWED: "대여",
  DEMO: "체험판",
  NOT_OWNED: "미보유",
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "월간",
  YEARLY: "연간",
};

export const SOURCE_LABEL: Record<GameSource, string> = {
  IGDB: "IGDB",
  MANUAL: "직접 등록",
};

const CURRENCY_LOCALE: Record<Money["currency"], string> = {
  KRW: "ko-KR",
  USD: "en-US",
  JPY: "ja-JP",
};

function moneyFormatter(currency: Money["currency"]) {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  });
}

/**
 * 금액을 조각으로 쪼갠다 — 통화 기호와 숫자를 다른 폰트로 그리기 위해서다 (components/ui/Money).
 * 문자열을 직접 자르지 않는 이유는 통화마다 기호 위치가 다르기 때문이다 (₩1,000 / 1 000 €)
 */
export function moneyParts(money: Money | null): Intl.NumberFormatPart[] | null {
  if (!money) return null;
  return moneyFormatter(money.currency).formatToParts(money.amount);
}

export function formatDate(date: string | null): string {
  return date ?? "—";
}

/** 종료일 null이면 물결로 끝낸다 — 진행 중이라는 건 상태 배지가 말한다 */
export function formatPeriod(startedOn: string, finishedOn: string | null): string {
  return `${startedOn} ~ ${finishedOn ?? ""}`;
}

/**
 * 평점은 0.0 ~ 100.0, 소수점 첫째 자리까지다 (스펙 §6.3).
 *
 * String()을 쓰면 안 되는 이유 — 서버가 보낸 83.0이 JS number로 오는 순간 83이 되고,
 * String(83)은 "83"이다. 0.1 단위 설계가 화면에서 정수로 뭉개진다
 */
export function formatRating(rating: number | null): string {
  return rating == null ? "—" : rating.toFixed(1);
}

export function formatList(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

/**
 * UI 라벨은 영문이다 (디자인 요청서 §표시 규칙). 데이터는 원래 언어를 유지한다.
 * 위의 한국어 라벨은 나중에 로케일 전환이 필요해질 때를 위해 남겨둔다
 */
export const STATUS_LABEL_EN: Record<EntryStatus, string> = {
  WISHLIST: "Wishlist",
  BACKLOG: "Backlog",
  PLAYING: "Playing",
  PAUSED: "Paused",
  DROPPED: "Dropped",
  COMPLETED: "Completed",
};

export const SORT_LABEL: Record<string, string> = {
  lastPlayed: "최근 플레이",
  rating: "평점",
  releasedOn: "출시일",
  name: "이름",
  playtime: "플레이 시간",
};

/** 드롭다운에 나오는 순서. Record는 키 순서를 보장하지 않아 따로 둔다 */
export const SORT_ORDER = ["lastPlayed", "rating", "name", "playtime", "releasedOn"] as const;

/** 카드 마지막 줄 — `3회차 · 2024-01-02~2024-02-11 · Switch`. 회차가 없으면 null */
export function formatLastPlaythrough(
  last: {
    sequenceNo: number;
    startedOn: string;
    finishedOn: string | null;
    deviceName: string | null;
    emulatorName: string | null;
  } | null,
): string | null {
  if (!last) return null;
  // 종료일이 없으면 물결로 끝낸다 — "진행 중"은 상태 배지가 이미 말한다
  const period = `${last.startedOn}~${last.finishedOn ?? ""}`;

  /*
   * **기기는 안 싣는다.** 카드 한 줄에 회차·기간·기기를 다 넣으면 잘려서 셋 다 못 읽는다.
   * 기기는 상세에서 회차마다 정확히 보이므로 여기서 빠져도 잃는 게 없다.
   *
   * 구분점 양옆은 좁은 공백(U+2009)이다 — 회차와 날짜는 한 덩어리로 읽혀야 하는데
   * 보통 공백을 쓰면 둘이 따로 노는 두 조각처럼 보였다
   */
  return `${last.sequenceNo}회차\u2009·\u2009${period}`;
}

/**
 * 플랫폼 계정 표기 — **플랫폼이 먼저다** (2026-08-29, 사용자 결정).
 *
 * `Beene (Steam)`이 아니라 `(Steam) Beene`이다. 라벨이 "Beene"으로 다 같은 경우가
 * 흔해서, 뒤에 붙이면 **목록이 같은 이름 여러 줄로 보이고** 소속은 끝까지 읽어야 나온다.
 * 앞에 두면 눈이 왼쪽 정렬된 플랫폼을 먼저 훑는다.
 *
 * ⚠️ 백엔드 파셋 쿼리(`AcquisitionRepository.countByPlatformAccount`)도 같은 순서로
 * 문자열을 만든다. 한쪽만 바꾸면 필터 목록과 상세 화면의 표기가 어긋난다
 */
export function accountLabel(
  owner: string | null | undefined,
  label: string | null | undefined,
): string {
  if (!label) return "—";
  return owner ? `(${owner}) ${label}` : label;
}
