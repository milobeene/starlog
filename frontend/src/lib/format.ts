/**
 * 플레이 시간 표시 (V4에서 소수점 두 자리가 됐다).
 *
 * 백엔드는 `numeric(7,2)`라 `133.00`을 내려보내는데, JSON을 파싱하면 JS 숫자가 되면서
 * 뒤의 0이 저절로 사라진다(`133.00` → `133`). 그래서 여기서 할 일은 자리수 절삭이 아니라
 * **천 단위 구분과 소수점 상한**뿐이다 — 부동소수점 덧셈이 만든 `133.30000000000001`을 막는다
 */
export function formatHours(hours: number | null | undefined): string | null {
  if (hours == null) return null;
  return hours.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** 입력 두 칸("지금까지" + "이번에")을 합칠 때 쓴다. 0.1 + 0.2 = 0.30000000000000004 방지 */
export function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
