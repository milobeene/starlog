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

/**
 * `withCurrent`의 정밀판 (v1.2). **왜 목록에 없는지를 가른다.**
 *
 * v1.1에서 계정 목록을 소속으로 좁히면서, 소속이 다른 계정도 "목록에 없음"이 됐다.
 * 그런데 `withCurrent`는 그걸 전부 삭제로 보고 **살아 있는 계정에 "(삭제됨)"을 달았다** —
 * 게다가 꼬리표는 원본 라벨을 쓰므로 소속(`(Epic Games)`)까지 사라져,
 * 화면에는 "소속 없는 삭제된 계정"이라는 있지도 않은 것이 보였다.
 *
 *   · 전체 목록에 있다  → 살아 있다. 소속이 안 맞을 뿐이니 **그대로** 넣는다
 *   · 전체에도 없다     → 진짜 소프트 삭제다. 꼬리표를 단다
 */
export function withCurrentAmong(
  shown: NamedRef[],
  all: NamedRef[],
  current: { id: number; name: string } | null | undefined,
): NamedRef[] {
  if (!current) return shown;
  if (shown.some((option) => option.id === current.id)) return shown;
  const alive = all.find((option) => option.id === current.id);
  return [...shown, alive ?? { id: current.id, name: `${current.name} (삭제됨)` }];
}
