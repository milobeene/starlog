/**
 * 플레이 시간 표시 — **저장·계산은 소수 시간(`10.75`), 화면은 `10시간 45분`** (사용자 규칙, 2026-10-24).
 *
 * 변환은 여기 한 곳이다. 분은 **정수로 반올림**하고 60분이 되면 시간으로 올린다
 * (`1.999` → `2시간`, `0.995` → `1시간`). 시간·분을 따로 반올림하면 `1시간 60분`이 나온다 —
 * 전체를 분으로 바꿔 한 번만 반올림하고 나눈다.
 *
 * ⚠️ 백엔드는 `numeric(7,2)`라 `133.00`을 내려보내는데 JSON을 파싱하면 JS 숫자가 되어
 * 뒤의 0이 사라진다. 부동소수점 덧셈이 만든 `133.30000000000001`도 여기서 분으로 흡수된다
 */
export function playTimeParts(hours: number | null | undefined): { hours: number; minutes: number } | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  const total = Math.max(0, Math.round(hours * 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/**
 * 문자열 표시 — `10시간 45분` · `10시간`(분이 0) · `45분`(1시간 미만) · `0분`.
 * 시간은 천 단위 구분을 쓴다(`2,241시간 22분`). null이면 null — 대시를 어떻게 보일지는 부르는 쪽 몫
 */
export function formatPlayTime(hours: number | null | undefined): string | null {
  const parts = playTimeParts(hours);
  if (!parts) return null;
  const h = parts.hours.toLocaleString("ko-KR");
  if (parts.hours === 0) return `${parts.minutes}분`;
  return parts.minutes === 0 ? `${h}시간` : `${h}시간 ${parts.minutes}분`;
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
