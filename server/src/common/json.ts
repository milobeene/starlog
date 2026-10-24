/**
 * 응답 직렬화 규약 — 기존 서버(Jackson)가 내던 모양 그대로. 화면과 기존 데이터가 이 모양에 기대 있다.
 *
 * - null 필드도 키를 낸다. `undefined`를 쓰면 키가 사라진다 → **응답 DTO엔 `null`을 쓸 것**
 * - LocalDate → `"2026-10-19"` (DB date 문자열 그대로)
 * - LocalDateTime → `"2026-08-28T15:14:26.781806"` (DB timestamp 문자열의 공백을 T로)
 */

/** DB `timestamp` 문자열 → LocalDateTime JSON */
export function ldt(v: string | null | undefined): string | null {
  return v === null || v === undefined ? null : v.replace(" ", "T");
}

/** LocalDateTime JSON → DB `timestamp` 파라미터 */
export function ldtToDb(v: string | null | undefined): string | null {
  return v === null || v === undefined ? null : v.replace("T", " ");
}

export interface Page<T> { page: number; size: number; totalElements: number; totalPages: number; items: T[] }

/** 페이지 응답 — `totalPages`는 size 0이면 1 (Spring `Page` 계산 그대로) */
export function page<T>(items: T[], page: number, size: number, totalElements: number): Page<T> {
  return { page, size, totalElements, totalPages: size === 0 ? 1 : Math.ceil(totalElements / size), items };
}

/** 금액 응답 — 두 칸이 다 null이면 객체 자체가 null이다 (Hibernate 임베디드가 그랬다) */
export function moneyJson(amount: string | null, currency: string | null) {
  if (amount === null && currency === null) return null;
  return { amount: amount === null ? null : Number(amount), currency };
}
