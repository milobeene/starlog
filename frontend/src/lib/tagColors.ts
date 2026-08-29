/**
 * 태그 팔레트 (v1.2).
 *
 * ## 왜 프리셋인가
 *
 * 자유 색 선택이면 **어두운 배경에서 안 읽히는 색**이 반드시 섞인다(순검정, 형광).
 * 그리고 화면마다 톤이 갈려서 목록이 어수선해진다. 고를 수 있는 것을 미리 정해두면
 * 어느 조합이든 한 벌로 보인다.
 *
 * ## 왜 이 색들인가
 *
 * 물감 이름을 그대로 딴 열넷이다 — 빨강에서 시작해 색상환을 한 바퀴 돌고 흙색으로 닫는다.
 * 채도를 낮게 잡은 이유: 이 앱은 배경이 `#050505`고 커버 이미지가 주인공이다.
 * 태그는 **분류표지 그 이상이 되면 안 된다** — 쨍한 색은 커버를 이긴다.
 *
 * ## 값이 셋인 이유
 *
 * 같은 색을 쓰는 자리가 셋인데 요구가 다르다:
 *   `text`  글씨·테두리. 어두운 배경 위에서 읽혀야 하니 밝다
 *   `soft`  배경 한 겹. 글씨를 안 덮게 아주 옅다
 *   `grad`  폴더 박스의 그래디언트. 커버 블러를 대신하므로 면적이 넓고 깊이가 있다
 *
 * ⚠️ **이름 목록은 백엔드의 `TagService.PALETTE`와 같아야 한다.** 한쪽만 늘리면
 * 저장은 되는데 화면에서 안 보이는 색이 생긴다
 */
export type TagColorName =
  | "rose" | "coral" | "amber" | "sand" | "olive" | "sage" | "mint"
  | "teal" | "sky" | "denim" | "lavender" | "plum" | "mauve" | "clay";

type Tone = { label: string; text: string; soft: string; grad: string };

export const TAG_COLORS: Record<TagColorName, Tone> = {
  rose:     { label: "장미",   text: "#e8a0a8", soft: "rgba(232,160,168,0.14)", grad: "linear-gradient(140deg,#5c2b33,#2a1418)" },
  coral:    { label: "산호",   text: "#e9a98c", soft: "rgba(233,169,140,0.14)", grad: "linear-gradient(140deg,#5e3323,#2a1712)" },
  amber:    { label: "호박",   text: "#e0bd85", soft: "rgba(224,189,133,0.14)", grad: "linear-gradient(140deg,#5a4523,#291f11)" },
  sand:     { label: "모래",   text: "#d8cba4", soft: "rgba(216,203,164,0.14)", grad: "linear-gradient(140deg,#514a2f,#252217)" },
  olive:    { label: "올리브", text: "#bcc490", soft: "rgba(188,196,144,0.14)", grad: "linear-gradient(140deg,#40492a,#20240f)" },
  sage:     { label: "세이지", text: "#a6c4a3", soft: "rgba(166,196,163,0.14)", grad: "linear-gradient(140deg,#2f4a2e,#162216)" },
  mint:     { label: "민트",   text: "#9ecfbc", soft: "rgba(158,207,188,0.14)", grad: "linear-gradient(140deg,#274c40,#12241e)" },
  teal:     { label: "청록",   text: "#93c5c9", soft: "rgba(147,197,201,0.14)", grad: "linear-gradient(140deg,#234a4d,#112224)" },
  sky:      { label: "하늘",   text: "#9dbedd", soft: "rgba(157,190,221,0.14)", grad: "linear-gradient(140deg,#264259,#121f29)" },
  denim:    { label: "데님",   text: "#9aa8d4", soft: "rgba(154,168,212,0.14)", grad: "linear-gradient(140deg,#2c3660,#14192c)" },
  lavender: { label: "라벤더", text: "#b8a6d9", soft: "rgba(184,166,217,0.14)", grad: "linear-gradient(140deg,#3d3062,#1c162d)" },
  plum:     { label: "자두",   text: "#c9a1c9", soft: "rgba(201,161,201,0.14)", grad: "linear-gradient(140deg,#4d2b4d,#231423)" },
  mauve:    { label: "모브",   text: "#d3a5b6", soft: "rgba(211,165,182,0.14)", grad: "linear-gradient(140deg,#552f3f,#26151d)" },
  clay:     { label: "흙",     text: "#c4a695", soft: "rgba(196,166,149,0.14)", grad: "linear-gradient(140deg,#4c372c,#221913)" },
};

export const TAG_COLOR_NAMES = Object.keys(TAG_COLORS) as TagColorName[];

/** 색이 없거나 모르는 이름이면 중립. 지금까지의 모양 그대로다 */
export const NEUTRAL: Tone = {
  label: "없음",
  text: "rgba(255,255,255,0.70)",
  soft: "rgba(255,255,255,0.05)",
  grad: "linear-gradient(140deg,#3a3a3a,#141414)",
};

export function toneOf(color: string | null | undefined): Tone {
  if (!color) return NEUTRAL;
  return TAG_COLORS[color as TagColorName] ?? NEUTRAL;
}
