import type { NamedRef } from "./types";

/**
 * 편집 폼의 선택지에 **지금 값이 없으면 끼워 넣는다.**
 *
 * 계정처럼 소프트 삭제된 참조는 `/api/me/options`에서 빠지는데(고를 수 없는 게 맞다),
 * 그대로 두면 기존 회차를 열었을 때 select가 매칭에 실패해 빈 값이 된다.
 * 그 상태로 저장하면 **원래 붙어 있던 계정이 조용히 날아간다.**
 *
 * 그래서 "삭제됨" 꼬리표를 달아 남겨 둔다 — 새로 고를 수는 없고 유지만 된다 (§6.5)
 */
export function withCurrent(
  options: NamedRef[],
  current: { id: number; name: string } | null | undefined,
): NamedRef[] {
  if (!current) return options;
  if (options.some((option) => option.id === current.id)) return options;
  return [...options, { id: current.id, name: `${current.name} (삭제됨)` }];
}
