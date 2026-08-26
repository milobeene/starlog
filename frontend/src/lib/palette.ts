/**
 * 유체 배경 팔레트 — **읽는 곳은 여기 하나다.**
 *
 * 지금 색은 `member.background_colors`에서 오지만, 로컬 앱(v1.0)에서는 앱 설정 파일에서 온다.
 * 화면 여기저기서 `me.profile.backgroundColors`를 직접 읽으면 그때 전부 고쳐야 한다
 * (docs/web-only-inventory.md §5 규칙 4).
 */

/** 한강 노을 (2026-08-26). 셰이더 주석에 후보 팔레트 여섯 벌의 기록이 남아 있다 */
export const DEFAULT_PALETTE = [
  "#E8975A", // A 노을 앰버 — 지배색
  "#F7D6A0", // B 해 근처의 밝은 하늘
  "#9BAAB8", // C 회청색 구름 — 유일한 차가움
  "#7A9448", // D 잔디 초록
  "#1E262B", // E 다리·물 실루엣
];

/** 다섯 칸이 각각 무엇을 맡는지. 색 고르는 화면이 이 이름을 쓴다 */
export const SLOT_LABELS = ["기조", "밝은 대비", "옅은 색", "중간 강조", "어두운 바닥"];

/**
 * 프리셋. 지금은 기본값 하나뿐이다 — 셰이더 주석의 후보 여섯 벌을 여기 옮기면 바로 늘어난다.
 * 배열 모양을 미리 잡아둔 이유가 그것이다
 */
export const PALETTES: { name: string; colors: string[] }[] = [
  { name: "한강 노을", colors: DEFAULT_PALETTE },
];

/**
 * 회원이 고른 색, 없으면 기본값.
 *
 * **null과 빈 배열을 같이 다룬다** — 서버는 "안 고름"을 null로 주지만,
 * 길이가 5가 아닌 값이 어떤 경로로든 새어 들어오면 셰이더가 검게 죽는다
 */
export function paletteOf(colors: string[] | null | undefined): string[] {
  return colors && colors.length === 5 ? colors : DEFAULT_PALETTE;
}

/** `#rrggbb` → 0~1 셋. 셰이더 uniform이 정규화된 값을 받는다 */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** 서버에 보낼 형태. 기본값과 같으면 **null로 보내 "안 고름"으로 되돌린다** */
export function toPayload(colors: string[]): string {
  const same = colors.every((color, index) => color.toUpperCase() === DEFAULT_PALETTE[index]);
  return same ? "" : colors.map((color) => color.toUpperCase()).join(",");
}
