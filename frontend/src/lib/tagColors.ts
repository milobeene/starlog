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

type Tone = {
  label: string;
  /** 글씨·테두리. 어두운 배경 위에서 읽혀야 하니 밝다 */
  text: string;
  /** 배경 한 겹. 글씨를 안 덮게 아주 옅다 (사전의 칩) */
  soft: string;
  /**
   * 사이드바의 태그 줄 배경 (v1.2).
   *
   * ⚠️ `soft`보다 **채도를 크게 낮춘다.** 사이드바는 색 줄이 열 개 넘게 세로로
   * 이어지는 자리라, 사전의 칩과 같은 채도면 목록이 알록달록해서 게임 이름이 안 읽힌다.
   * 색은 알아볼 만큼만 남기고 배경으로 물러나야 한다
   */
  dim: string;
  /** 폴더 배경을 이루는 세 덩어리 — 밝은 것 / 중간 / 바닥 */
  hi: string;
  mid: string;
  low: string;
};

export const TAG_COLORS: Record<TagColorName, Tone> = {
  rose:     { label: "장미",   text: "#f0919d", dim: "rgba(201,153,159,0.22)", soft: "rgba(240,145,157,0.20)", hi: "#e8546f", mid: "#a8365a", low: "#3a1424" },
  coral:    { label: "산호",   text: "#f5a07c", dim: "rgba(199,158,140,0.22)", soft: "rgba(245,160,124,0.20)", hi: "#f0714a", mid: "#b8482f", low: "#3b1710" },
  amber:    { label: "호박",   text: "#efc072", dim: "rgba(192,170,133,0.22)", soft: "rgba(239,192,114,0.20)", hi: "#f0ad3c", mid: "#a9741c", low: "#35240d" },
  sand:     { label: "모래",   text: "#e3d494", dim: "rgba(192,184,153,0.22)", soft: "rgba(227,212,148,0.20)", hi: "#dcc95f", mid: "#948333", low: "#2f2a14" },
  olive:    { label: "올리브", text: "#c3d183", dim: "rgba(168,174,138,0.22)", soft: "rgba(195,209,131,0.20)", hi: "#a8c44c", mid: "#68812c", low: "#212a10" },
  sage:     { label: "세이지", text: "#9fd39a", dim: "rgba(157,182,154,0.22)", soft: "rgba(159,211,154,0.20)", hi: "#63c266", mid: "#377b3f", low: "#132615" },
  mint:     { label: "민트",   text: "#8fdcc0", dim: "rgba(149,185,172,0.22)", soft: "rgba(143,220,192,0.20)", hi: "#3fd0a0", mid: "#24866b", low: "#0e2b22" },
  teal:     { label: "청록",   text: "#84d2da", dim: "rgba(141,177,181,0.22)", soft: "rgba(132,210,218,0.20)", hi: "#2fc2d2", mid: "#1d7b88", low: "#0b282c" },
  sky:      { label: "하늘",   text: "#8fc2ef", dim: "rgba(152,177,200,0.22)", soft: "rgba(143,194,239,0.20)", hi: "#3f9fee", mid: "#2a628f", low: "#0e2033" },
  denim:    { label: "데님",   text: "#94a6ee", dim: "rgba(155,164,200,0.22)", soft: "rgba(148,166,238,0.20)", hi: "#5470ea", mid: "#33438f", low: "#131834" },
  lavender: { label: "라벤더", text: "#b79cf0", dim: "rgba(174,161,204,0.22)", soft: "rgba(183,156,240,0.20)", hi: "#8b5ce8", mid: "#553794", low: "#1e1338" },
  plum:     { label: "자두",   text: "#d494e4", dim: "rgba(185,153,193,0.22)", soft: "rgba(212,148,228,0.20)", hi: "#b754d8", mid: "#71318a", low: "#281033" },
  mauve:    { label: "모브",   text: "#e59ab4", dim: "rgba(195,158,170,0.22)", soft: "rgba(229,154,180,0.20)", hi: "#d95f95", mid: "#8b3760", low: "#301224" },
  clay:     { label: "흙",     text: "#d6ac93", dim: "rgba(182,162,150,0.22)", soft: "rgba(214,172,147,0.20)", hi: "#c47c4f", mid: "#7d4d33", low: "#2a1a12" },
};

/**
 * 폴더 배경 그림 (v1.2, 사용자 결정).
 *
 * ## 왜 CSS가 아니라 그림인가
 *
 * 원형 그래디언트를 겹쳐도 **앱 배경의 유체와 결이 달랐다.** 그건 노이즈로 좌표를
 * 뒤틀어 만든 무늬라 CSS로는 흉내가 안 난다.
 *
 * 그래서 **같은 셰이더를 색마다 한 번씩 돌려 찍어뒀다.** 무지개 순회만 빼고
 * (`float hue = fract(...)` 줄) 팔레트를 태그 색에서 만든다 — 색조는 그대로 두고
 * 명암·채도만 벌리고, 이웃 색조를 ±0.045만 섞어 결을 낸다. 더 돌리면 무지개를 뺀
 * 뜻이 사라진다.
 *
 * ⚠️ **실시간으로 안 돌린다.** 폴더가 열몇 개면 WebGL 컨텍스트가 그만큼 필요한데
 * 브라우저가 개수를 세는 자원이라 앞의 것들이 강제로 사라진다(context lost).
 * 그림 한 장이면 그 문제가 없다.
 *
 * 만드는 법은 `tools/gen-tag-bg.js`. 색을 고치면 다시 돌려야 한다 —
 * 그림이 팔레트를 따라가지 않는다
 */
export function tagBackground(color: string | null | undefined): string {
  /*
   * 색을 안 고른 폴더도 **같은 셰이더로 찍은 무채색 그림**을 쓴다 (v1.2).
   * CSS 그래디언트로 떨어뜨려 두면 그 하나만 결이 달라서 눈에 걸린다
   */
  if (!color || !(color in TAG_COLORS)) return "/tag-bg/neutral.jpg";
  return `/tag-bg/${color}.jpg`;
}

export const TAG_COLOR_NAMES = Object.keys(TAG_COLORS) as TagColorName[];

/** 색이 없거나 모르는 이름이면 중립. 지금까지의 모양 그대로다 */
export const NEUTRAL: Tone = {
  label: "없음",
  text: "rgba(255,255,255,0.70)",
  soft: "rgba(255,255,255,0.05)",
  dim: "rgba(255,255,255,0.05)",
  hi: "#5a5a5a",
  mid: "#3a3a3a",
  low: "#161616",
};

export function toneOf(color: string | null | undefined): Tone {
  if (!color) return NEUTRAL;
  return TAG_COLORS[color as TagColorName] ?? NEUTRAL;
}
