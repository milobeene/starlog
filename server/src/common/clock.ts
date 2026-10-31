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

/**
 * 테스트 전용 고정 "오늘" — `STARLOG_TEST_TODAY=YYYY-MM-DD`. **dev·test 프로필에서만** 듣는다(`config.devProfile`과 같은 규칙).
 * 구독 지출처럼 "오늘까지" 쌓이는 값이 달력에 따라 녹화본과 어긋나는 걸 막는다. 운영 프로필은 무시한다.
 */
export function testToday(env: Record<string, string | undefined> = process.env): string | null {
  if (!["dev", "test"].includes(env.STARLOG_PROFILE ?? "")) return null;
  const v = (env.STARLOG_TEST_TODAY ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** `2026-10-24` — 인자 없이 부르면(= "오늘") 테스트 고정값이 우선한다 */
export function todayKst(d?: Date): string {
  if (d === undefined) { const t = testToday(); if (t) return t; }
  const p = parts(d ?? new Date());
  return `${p.year}-${p.month}-${p.day}`;
}
