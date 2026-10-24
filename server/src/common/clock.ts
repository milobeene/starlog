/**
 * 시각 — 전부 `Asia/Seoul`.
 *
 * ⚠️ **DB의 `now()`를 쓰지 않는다.** 컬럼이 `timestamp without time zone`이라 벽시계 값이 그대로
 * 저장되는데, 세션 시간대가 UTC면(Neon 기본) 9시간 밀린 값이 들어간다.
 * **시각은 항상 여기서 만들어 파라미터로 넘긴다.**
 */

const DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  fractionalSecondDigits: 3,
});

function parts(d: Date) {
  const p = Object.fromEntries(DATE_TIME.formatToParts(d).map(x => [x.type, x.value]));
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second" | "fractionalSecond", string>;
}

/** `2026-10-24 18:15:30.123` — DB에 넣는 형태 (timestamp 컬럼) */
export function nowKst(d: Date = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}`;
}

/** `2026-10-24` */
export function todayKst(d: Date = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}
