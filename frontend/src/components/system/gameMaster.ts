/** 마스터 목록과 IGDB 검색 결과를 한 모양으로 합친 표시용 행 */
export type GameRow = {
  gameId: number | null;
  name: string;
  source: string;
  releasedOn: string | null;
  coverImageId: string | null;
  lastSyncedAt: string | null;
};

/** 선택 갱신에 쓰는 보조키. `row`는 행 본문 클릭이면 참, 동그라미 클릭이면 거짓 */
export type PickModifier = { shift: boolean; toggle: boolean; row: boolean };

/**
 * 파일 관리자식 선택. 순수 함수라 화면과 따로 확인할 수 있다.
 *
 * - Shift: 기준(anchor)에서 눌린 행까지 범위로 **바꾼다.** Ctrl/⌘도 함께면 기존 선택에 **더한다**
 * - Ctrl/⌘ 또는 동그라미: 그 행만 켜고 끄고, 기준을 그 행으로 옮긴다
 * - 행 본문 일반 클릭: 그 행만 남긴다
 *
 * 기준이 현재 목록에 없으면(다른 페이지) Shift도 그냥 토글로 떨어진다
 */
export function applyPick(
  prev: ReadonlySet<number>,
  order: readonly number[],
  anchor: number | null,
  id: number,
  mod: PickModifier,
): { next: Set<number>; anchor: number } {
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (mod.shift && from >= 0 && to >= 0) {
    const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { next: new Set(mod.toggle ? [...prev, ...range] : range), anchor: anchor! };
  }
  if (mod.toggle || !mod.row) {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return { next, anchor: id };
  }
  return { next: new Set([id]), anchor: id };
}
