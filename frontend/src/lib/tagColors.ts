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
 * 처음엔 채도를 아주 낮게 잡았는데 **폴더 박스가 어둡고 밋밋했다**(사용자 지적).
 * 글씨·배경은 여전히 옅게 두되, **폴더 그래디언트만 채도와 밝기를 크게 올렸다** —
 * 거기는 면적이 넓고 글씨가 흰색 굵은 대문자라 진해도 안 잡아먹는다.
 *
 * ## 값이 셋인 이유
 *
 * 같은 색을 쓰는 자리가 셋인데 요구가 다르다:
 *   `text`  글씨·테두리. 어두운 배경 위에서 읽혀야 하니 밝다
 *   `soft`  배경 한 겹. 글씨를 안 덮게 아주 옅다
 *   `grad`  폴더 박스. **세 정거장**이다 — 밝은 색 → 중간 → 어두운 끝.
 *           두 정거장이면 단조로운 띠가 되는데, 가운데를 45%에 두면 밝은 쪽이 넓게
 *           깔리고 아래로 떨어지면서 깊이가 생긴다
 *
 * ⚠️ **이름 목록은 백엔드의 `TagService.PALETTE`와 같아야 한다.** 한쪽만 늘리면
 * 저장은 되는데 화면에서 안 보이는 색이 생긴다
 */
export type TagColorName =
  | "rose" | "coral" | "amber" | "sand" | "olive" | "sage" | "mint"
  | "teal" | "sky" | "denim" | "lavender" | "plum" | "mauve" | "clay";

type Tone = { label: string; text: string; soft: string; grad: string };

export const TAG_COLORS: Record<TagColorName, Tone> = {
  rose:     { label: "장미",   text: "#f0919d", soft: "rgba(240,145,157,0.20)", grad: "linear-gradient(135deg,#c2455f 0%,#8e2f52 45%,#4a1b35 100%)" },
  coral:    { label: "산호",   text: "#f5a07c", soft: "rgba(245,160,124,0.20)", grad: "linear-gradient(135deg,#e0673f 0%,#a8422e 45%,#4d1f18 100%)" },
  amber:    { label: "호박",   text: "#efc072", soft: "rgba(239,192,114,0.20)", grad: "linear-gradient(135deg,#d99a2b 0%,#9e6a1c 45%,#463012 100%)" },
  sand:     { label: "모래",   text: "#e3d494", soft: "rgba(227,212,148,0.20)", grad: "linear-gradient(135deg,#c8b95c 0%,#8d803a 45%,#3f3a1c 100%)" },
  olive:    { label: "올리브", text: "#c3d183", soft: "rgba(195,209,131,0.20)", grad: "linear-gradient(135deg,#93ac45 0%,#63762c 45%,#2c3516 100%)" },
  sage:     { label: "세이지", text: "#9fd39a", soft: "rgba(159,211,154,0.20)", grad: "linear-gradient(135deg,#5aa85a 0%,#39723f 45%,#19321e 100%)" },
  mint:     { label: "민트",   text: "#8fdcc0", soft: "rgba(143,220,192,0.20)", grad: "linear-gradient(135deg,#3fb891 0%,#288068 45%,#123a2f 100%)" },
  teal:     { label: "청록",   text: "#84d2da", soft: "rgba(132,210,218,0.20)", grad: "linear-gradient(135deg,#31a8b6 0%,#20757f 45%,#0f353a 100%)" },
  sky:      { label: "하늘",   text: "#8fc2ef", soft: "rgba(143,194,239,0.20)", grad: "linear-gradient(135deg,#3c8fd6 0%,#2a6197 45%,#132c45 100%)" },
  denim:    { label: "데님",   text: "#94a6ee", soft: "rgba(148,166,238,0.20)", grad: "linear-gradient(135deg,#4a63cf 0%,#334391 45%,#181e42 100%)" },
  lavender: { label: "라벤더", text: "#b79cf0", soft: "rgba(183,156,240,0.20)", grad: "linear-gradient(135deg,#7b53d1 0%,#553793 45%,#271943 100%)" },
  plum:     { label: "자두",   text: "#d494e4", soft: "rgba(212,148,228,0.20)", grad: "linear-gradient(135deg,#a04ac0 0%,#6f3186 45%,#33163d 100%)" },
  mauve:    { label: "모브",   text: "#e59ab4", soft: "rgba(229,154,180,0.20)", grad: "linear-gradient(135deg,#c25184 0%,#8a375c 45%,#3f192a 100%)" },
  clay:     { label: "흙",     text: "#d6ac93", soft: "rgba(214,172,147,0.20)", grad: "linear-gradient(135deg,#b0714c 0%,#7c4c33 45%,#392318 100%)" },
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
