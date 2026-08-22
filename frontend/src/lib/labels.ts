import type {
  AcquisitionMethod,
  BillingCycle,
  EntryStatus,
  GameSource,
  InputMethod,
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

export const INPUT_METHOD_LABEL: Record<InputMethod, string> = {
  XINPUT: "XInput 패드",
  NINTENDO: "닌텐도 패드",
  PLAYSTATION: "듀얼센스",
  KEYBOARD_MOUSE: "키보드+마우스",
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "월간",
  YEARLY: "연간",
};

export const SOURCE_LABEL: Record<GameSource, string> = {
  RAWG: "RAWG",
  MANUAL: "직접 등록",
};

const CURRENCY_LOCALE: Record<Money["currency"], string> = {
  KRW: "ko-KR",
  USD: "en-US",
  JPY: "ja-JP",
};

export function formatMoney(money: Money | null): string {
  if (!money) return "—";
  return new Intl.NumberFormat(CURRENCY_LOCALE[money.currency], {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: money.currency === "USD" ? 2 : 0,
  }).format(money.amount);
}

export function formatDate(date: string | null): string {
  return date ?? "—";
}

/** 종료일 null = 진행 중 */
export function formatPeriod(startedOn: string, finishedOn: string | null): string {
  return finishedOn ? `${startedOn} ~ ${finishedOn}` : `${startedOn} ~ 진행 중`;
}

export function formatRating(rating: number | null): string {
  return rating == null ? "—" : String(rating);
}

export function formatList(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}
