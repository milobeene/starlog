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

/**
 * 바이트를 값과 단위로 **쪼개서** 준다 (2026-08-28).
 *
 * 문자열 하나로 돌려주던 것을 나눈 이유 — 숫자는 모노(`.num`)로, 단위는 본문 폰트로
 * 그려야 하는데 `"412 KB"` 한 덩어리로는 그 둘을 갈라놓을 수가 없다. 화면에서는
 * `<Bytes>`가 이걸 받아 조립한다.
 *
 * ⚠️ 같은 함수가 **네 곳에 각각** 있었고 반올림 규칙이 서로 달랐다
 * (KB를 `Math.round`로 자르는 데도, `toFixed(1)`인 데도 있었다). 여기 하나로 모은다 —
 * 소수 한 자리로 통일한다: 백업 목록의 `412 KB`와 사용량의 `412.3 KB`가 같은 파일을
 * 가리키는데 다르게 보이면 어느 쪽이 맞는지 알 수가 없다
 */
export function bytesParts(bytes: number): { value: string; unit: string } {
  if (bytes < 1024) return { value: String(bytes), unit: "B" };
  if (bytes < 1024 * 1024) return { value: (bytes / 1024).toFixed(1), unit: "KB" };
  if (bytes < 1024 * 1024 * 1024) return { value: (bytes / 1024 / 1024).toFixed(1), unit: "MB" };
  return { value: (bytes / 1024 / 1024 / 1024).toFixed(2), unit: "GB" };
}
