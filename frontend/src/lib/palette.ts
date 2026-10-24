/**
 * 유체 배경 팔레트 — **읽는 곳은 여기 하나다.**
 *
 * 지금 색은 `member.background_colors`에서 오지만, 로컬 앱(v1.0)에서는 앱 설정 파일에서 온다.
 * 화면 여기저기서 `me.profile.backgroundColors`를 직접 읽으면 그때 전부 고쳐야 한다
 * (docs/web-only-inventory.md §5 규칙 4).
 */

import { getBridge } from "@/lib/desktop";

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

/* ── 색조(hue) 일괄 조절 ─────────────────────────────────────────── */

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

/**
 * 다섯 색의 색조만 `degrees`만큼 돌린다. **채도·명도는 그대로**(HSL).
 * 회색에 가까운 색(어두운 바닥 등)은 채도가 낮아 돌려도 거의 안 변한다 — 의도한 동작이다
 */
export function shiftHue(colors: string[], degrees: number): string[] {
  return colors.map((color) => {
    const [h, s, l] = hexToHsl(color);
    return hslToHex((((h + degrees) % 360) + 360) % 360, s, l);
  });
}

/* ── 마지막으로 쓴 색 (입구용) + 프리셋 ──────────────────────────── */

export type SavedPalette = { name: string; colors: string[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const isFive = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length === 5 && v.every((c) => typeof c === "string" && HEX.test(c));

/**
 * 입구 화면이 쓸 마지막 색. 일렉트론 밖(브라우저 개발)이면 null.
 *
 * **동기여야 한다** — 비동기로 받으면 기본 팔레트가 한 프레임이라도 먼저 그려져 번쩍인다
 */
export function rememberedPalette(): string[] | null {
  const colors = getBridge()?.background?.get().colors;
  return isFive(colors) ? colors : null;
}

/** 본 앱이 프로필을 받을 때마다 적어 둔다. null = 기본 팔레트 */
export function rememberPalette(colors: string[] | null): void {
  getBridge()?.background?.set({ colors });
}

/*
 * ⚠️ 프리셋 저장소 — 임시다. **프로필(서버)에 필드가 없어서** 일렉트론 settings.json에 둔다
 * (브라우저 개발에선 localStorage). 세이브파일이 달라도 프리셋은 공유되고 내보내기에도 안 실린다.
 * 서버에 `backgroundPresets`가 생기면 이 두 함수만 갈아끼우면 된다
 */
const PRESET_KEY = "starlog.palettePresets";

export function loadPresets(): SavedPalette[] {
  const bridge = getBridge()?.background;
  let raw: unknown;
  if (bridge) raw = bridge.get().presets;
  else {
    try {
      raw = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "[]");
    } catch {
      raw = [];
    }
  }
  return Array.isArray(raw)
    ? raw.filter(
        (p): p is SavedPalette => !!p && typeof p.name === "string" && isFive((p as SavedPalette).colors),
      )
    : [];
}

export function storePresets(presets: SavedPalette[]): void {
  const bridge = getBridge()?.background;
  if (bridge) bridge.set({ presets });
  else {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
    } catch {
      /* 저장 못 해도 이번 화면에선 쓸 수 있다 */
    }
  }
}

/** 서버에 보낼 형태. 기본값과 같으면 **null로 보내 "안 고름"으로 되돌린다** */
export function toPayload(colors: string[]): string {
  const same = colors.every((color, index) => color.toUpperCase() === DEFAULT_PALETTE[index]);
  return same ? "" : colors.map((color) => color.toUpperCase()).join(",");
}
