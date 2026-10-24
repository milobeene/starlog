import { playTimeParts, roundHours } from "@/lib/format";

/**
 * 플레이타임 **입력** 쪽 변환 — 저장은 소수 시간(`10.75`), 칸은 `시`·`분` 두 글자.
 * 표시용(`formatPlayTime`)은 `lib/format.ts`가 갖는다. 여기는 React·DOM을 모르는 순수 함수만 둔다.
 *
 * 모든 계산은 **정수 분**으로 한다. 시간(소수)으로 더하면 `0.1 + 0.2` 꼴 오차가 끼고,
 * 시·분을 따로 반올림하면 `1시간 60분`이 나온다 — 반올림은 분↔시간 경계에서 한 번뿐이다
 * (`playTimeParts`가 시간→분, `minutesToHours`가 분→시간).
 */

/** 시 칸 자릿수. 서버 상한이 `99999.99`시간이다(entry.ts) */
export const MAX_HOURS_DIGITS = 5;
/** 99999시간 59분 — 이 안이면 소수 둘째 자리 반올림 뒤에도 서버 상한 안이다 */
export const MAX_MINUTES = 99999 * 60 + 59;

/** 칸 두 개의 글자. 숫자만, 비었으면 "" */
export type DurSegs = { h: string; m: string };

export const EMPTY_SEGS: DurSegs = { h: "", m: "" };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 정수 분 → 칸 글자 (`645` → 10 / 45) */
export function segsFromMinutes(total: number): DurSegs {
  return { h: String(Math.floor(total / 60)), m: pad2(total % 60) };
}

/** 저장된 소수 시간 → 칸 글자. 값이 없으면 빈 칸 (`10.75` → 10 / 45) */
export function segsFromHours(hours: number | null | undefined): DurSegs {
  const parts = playTimeParts(hours);
  return parts ? segsFromMinutes(parts.hours * 60 + parts.minutes) : EMPTY_SEGS;
}

/** 칸 글자 → 정수 분. 둘 다 비면 null, 하나만 비면 0으로 본다 (`""`시간 `30`분 = 30분) */
export function minutesFromSegs(s: DurSegs): number | null {
  if (s.h === "" && s.m === "") return null;
  return Number(s.h || 0) * 60 + Number(s.m || 0);
}

/** 정수 분 → 저장할 소수 시간 (`645` → 10.75, `650` → 10.83). 소수 둘째 자리 — 서버 `numeric(7,2)`와 같다 */
export function minutesToHours(total: number): number {
  return roundHours(total / 60);
}

/**
 * 지금까지 + 더할 시간 → 합계(분). 둘 다 비면 null (플레이타임 없음).
 * 상한을 넘으면 `over: true` — 저장 버튼을 막는 데 쓴다
 */
export function sumSegs(base: DurSegs, add: DurSegs): { minutes: number | null; over: boolean } {
  const a = minutesFromSegs(base);
  const b = minutesFromSegs(add);
  if (a == null && b == null) return { minutes: null, over: false };
  const minutes = (a ?? 0) + (b ?? 0);
  return { minutes, over: minutes > MAX_MINUTES };
}

/**
 * ↑↓ 한 번. **시 자리**는 시만 ±1. **분 자리**는 전체 분을 ±1 해서 올림·내림이 시로 번진다
 * (10시간 59분 ↑ → 11시간 00분, 11시간 00분 ↓ → 10시간 59분). 0시간 00분 아래로는 안 간다.
 * homeops 시각 칸은 59분 ↑이 00분으로 돌고 시는 그대로인데, 우리는 시각이 아니라 **길이**라서 다르다
 */
export function stepSegs(s: DurSegs, seg: "h" | "m", dir: 1 | -1): DurSegs {
  if (seg === "h") {
    const h = Math.min(Math.max(Number(s.h || 0) + dir, 0), 10 ** MAX_HOURS_DIGITS - 1);
    return { h: String(h), m: s.m };
  }
  const total = Math.min(Math.max((minutesFromSegs(s) ?? 0) + dir, 0), MAX_MINUTES);
  return segsFromMinutes(total);
}

/**
 * 칸을 떠날 때 다듬기 — 시는 앞 0을 걷고(`007` → 7), 분은 두 자리로(`5` → 05).
 * 한쪽만 채워졌으면 다른 쪽을 0으로 채운다. 둘 다 비었으면 그대로(= 값 없음)
 */
export function settleSegs(s: DurSegs): DurSegs {
  if (s.h === "" && s.m === "") return s;
  return { h: String(Number(s.h || 0)), m: pad2(Number(s.m || 0)) };
}

/** 시 칸에 친 글자 → 숫자만, 최대 5자리 (서버 상한 99999.99시간). 앞 0은 둔다 — 지금 치는 중일 수 있다 */
export function cleanHours(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, MAX_HOURS_DIGITS);
}

/**
 * 분 칸에 친 글자 → 숫자만, 0~59. 이어 친 값이 59를 넘거나 세 자리가 되면 **방금 친 숫자로 새로 시작**한다
 * (`7` 다음 `5`는 75분이 아니라 `5`). 같은 규칙이 homeops 자리 칸에도 있다(`typeSegDigit`)
 */
export function cleanMinutes(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length > 2 || Number(digits) > 59) return digits.slice(-1);
  return digits;
}
