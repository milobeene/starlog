"use client";

import { useEffect, useRef, useState } from "react";
import FluidCanvas from "@/components/background/FluidCanvas";
import {
  DEFAULT_PALETTE,
  PALETTES,
  SLOT_LABELS,
  loadPresets,
  shiftHue,
  storePresets,
  unifyHue,
  type SavedPalette,
} from "@/lib/palette";
import { errorMessage } from "@/lib/api";

const MAX_PRESETS = 12;
const sameColors = (a: string[], b: string[]) =>
  a.length === b.length && a.every((color, i) => color.toUpperCase() === b[i].toUpperCase());

/**
 * 배경 색 편집기 — **고르는 즉시 위 창에 반영된다.**
 *
 * 미리보기가 실제 셰이더인 이유: CSS 그라디언트로 흉내 내면 저장한 뒤 다른 그림이 나온다.
 * 같은 `FluidCanvas`를 작게 한 장 더 돌린다.
 *
 * 창은 **16:9 한 장이고 오른쪽 절반만 앱 내부 색감**이다(`split=0.5`).
 * 두 캔버스를 나란히 두는 대신 하나를 가른 이유 — 색만 가르고 흐름은 공유해서
 * 무늬가 가운데서 끊기지 않는다. 왼쪽이 입구, 오른쪽이 앱 안이고 한눈에 비교된다.
 *
 * **저장은 부모(ProfileDialog)가 한다.** 여기는 값을 들고 있지 않는다 —
 * 취소하면 아무 일도 없어야 하므로 상태의 주인이 하나여야 한다.
 * (예외: 내 프리셋 목록은 누르는 즉시 프로필에 저장된다 — `lib/palette.ts`의 프리셋 저장소)
 */
export default function PaletteEditor({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  const setSlot = (index: number, value: string) => {
    const next = [...colors];
    next[index] = value.toUpperCase();
    onChange(next);
  };

  /*
   * 색조 일괄 조절. 슬라이더는 **처음 움직인 순간의 색(base)에서 몇 도 돌렸나**를 나타낸다.
   * 색을 다른 길(개별 선택기·프리셋)로 바꾸면 emitted와 어긋나므로 값이 0으로 떨어지고 base도 새로 잡힌다
   * — effect로 되돌리지 않고 렌더에서 파생한다
   */
  const [hue, setHue] = useState<{ base: string[]; shift: number; emitted: string[] } | null>(null);
  const hueLive = hue !== null && sameColors(colors, hue.emitted);
  const shift = hueLive ? hue.shift : 0;
  const rotate = (degrees: number) => {
    const base = hueLive ? hue.base : colors;
    const emitted = shiftHue(base, degrees);
    setHue({ base, shift: degrees, emitted });
    onChange(emitted);
  };

  // 프로필에서 받아온다 — 받기 전엔 빈 목록. 저장은 즉시(대화상자 [저장]과 따로), 실패하면 되돌린다
  const [presets, setPresets] = useState<SavedPalette[]>([]);
  useEffect(() => {
    let alive = true;
    loadPresets()
      .then((list) => alive && setPresets(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [naming, setNaming] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const commitPresets = (next: SavedPalette[]) => {
    const before = presets;
    setPresets(next);
    setPresetError(null);
    // 되돌리기만 하면 "저장했는데 사라졌다"로 보인다 — 실패했다고 한 줄 남긴다
    storePresets(next).catch((caught: unknown) => {
      setPresets(before);
      setPresetError(errorMessage(caught, "프리셋을 저장하지 못했습니다."));
    });
  };

  /*
   * 이름 칸의 Esc는 이름 입력만 접는다. Modal은 document 리스너라 React의 stopPropagation이
   * 안 닿는다 — capture에서 끊어야 팔레트 대화상자까지 닫히지 않는다
   */
  const namingInput = useRef<HTMLInputElement>(null);
  const namingOpen = naming !== null;
  useEffect(() => {
    if (!namingOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.target !== namingInput.current) return;
      event.stopImmediatePropagation();
      setNaming(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [namingOpen]);
  const savePreset = () => {
    const name = (naming ?? "").trim().slice(0, 30);
    if (!name) return;
    // 이름이 같으면 덮어쓴다 — 고쳐 쓴 색을 같은 이름으로 다시 저장하는 흐름
    const rest = presets.filter((preset) => preset.name !== name);
    if (rest.length >= MAX_PRESETS) return;
    commitPresets([...rest, { name, colors: colors.map((color) => color.toUpperCase()) }]);
    setNaming(null);
  };

  const isDefault = colors.every(
    (color, index) => color.toUpperCase() === DEFAULT_PALETTE[index],
  );

  return (
    <div className="space-y-3">
      {/* 일반적인 모니터 비율. 실제 화면과 구도가 크게 어긋나지 않는다 */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10">
        <FluidCanvas
          colors={colors}
          /*
           * 흐름은 입구 속도(0)로 돈다. 색만 가르므로 이 값은 무늬가 흐르는 빠르기만 정한다 —
           * 느린 앱 속도로 두면 미리보기에서 변화를 보기까지 한참 기다려야 한다
           */
          targetAppState={0}
          split={0.5}
          className="absolute inset-0 h-full w-full"
        />

        {/* 가른 자리를 눈에 보이게. 없으면 오른쪽이 왜 어두운지 알 수 없다 */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/25" />
        <span className="num pointer-events-none absolute bottom-2 left-3 text-[10px] tracking-widest text-white/70 uppercase">
          입구
        </span>
        <span className="num pointer-events-none absolute right-3 bottom-2 text-[10px] tracking-widest text-white/70 uppercase">
          앱 내부
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {colors.map((color, index) => (
          <label key={index} className="flex cursor-pointer flex-col items-center gap-1.5">
            {/*
              네이티브 색 선택기를 쓴다. 직접 만들면 HSL 원판·명도 슬라이더·hex 입력까지
              전부 짜야 하는데, OS 것이 스포이드까지 준다
            */}
            <input
              type="color"
              // 브라우저가 값을 소문자로 정규화한다 — 대문자를 주면 controlled input이
              // 매 렌더 DOM을 다시 써서 피커가 튄다. 저장·표시는 그대로 대문자다
              value={color.toLowerCase()}
              onChange={(event) => setSlot(index, event.target.value)}
              // 기본 색 입력은 두꺼운 테두리와 안쪽 여백이 붙는다 — 전부 걷어내고 색만 남긴다
              className="h-9 w-full cursor-pointer rounded-md border border-white/15 bg-transparent p-0
                         [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-none
                         [&::-webkit-color-swatch-wrapper]:p-0.5"
            />
            <span className="text-center text-[10px] leading-tight text-white/45">
              {SLOT_LABELS[index]}
            </span>
            <span className="num text-[9px] text-white/30">{color.toUpperCase()}</span>
          </label>
        ))}
      </div>

      {/* 색조만 한꺼번에 — 채도·명도는 그대로라 분위기를 유지한 채 계열만 옮긴다 */}
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-[11px] text-white/50">색조 이동</span>
        <input
          type="range"
          min={-360}
          max={360}
          step={1}
          value={shift}
          onChange={(event) => rotate(Number(event.target.value))}
          aria-label="다섯 색의 색조를 한꺼번에 이동"
          className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20
                     [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2
                     [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-neutral-900"
        />
        <span className="num w-12 shrink-0 text-right text-[11px] text-white/45">
          {shift > 0 ? "+" : ""}
          {shift}°
        </span>
        {/*
          다섯 색의 색조를 전부 0°(빨강)로. onChange만 부르고 hue 상태는 건드리지 않는다 —
          그러면 colors가 emitted와 어긋나 슬라이더가 0으로 떨어지고, 다음에 움직일 때 이 색이 새 기준이 된다
        */}
        <button
          type="button"
          onClick={() => onChange(unifyHue(colors))}
          className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          색조 통일
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* 기본 제공 프리셋 — lib/palette.ts의 PALETTES */}
        {PALETTES.map((preset) => (
          <PresetChip key={preset.name} preset={preset} onApply={() => onChange([...preset.colors])} />
        ))}
        {/* 내 프리셋 — 칩을 누르면 적용, ×로 삭제 */}
        {presets.map((preset) => (
          <PresetChip
            key={preset.name}
            preset={preset}
            onApply={() => onChange([...preset.colors])}
            onRemove={() => commitPresets(presets.filter((p) => p.name !== preset.name))}
          />
        ))}

        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange([...DEFAULT_PALETTE])}
            className="text-xs text-white/45 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            기본값으로
          </button>
        )}
      </div>

      {/* 지금 색을 이름 붙여 저장 */}
      <div className="flex flex-wrap items-center gap-2">
        {naming === null ? (
          <button
            type="button"
            onClick={() => setNaming(`프리셋 ${presets.length + 1}`)}
            disabled={presets.length >= MAX_PRESETS}
            className="text-xs text-white/45 underline-offset-4 transition-colors hover:text-white hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            지금 색을 프리셋으로 저장
          </button>
        ) : (
          <>
            <input
              ref={namingInput}
              autoFocus
              value={naming}
              onChange={(event) => setNaming(event.target.value)}
              onKeyDown={(event) => {
                // 다이얼로그의 Enter(저장)가 이름 입력까지 먹지 않게 (Esc는 위 capture 리스너가 맡는다)
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  savePreset();
                }
              }}
              maxLength={30}
              placeholder="프리셋 이름"
              className="w-40 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/40"
            />
            <button
              type="button"
              onClick={savePreset}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setNaming(null)}
              className="text-xs text-white/40 hover:text-white/80"
            >
              취소
            </button>
          </>
        )}
        {presets.some((preset) => preset.name === (naming ?? "").trim()) && (
          <span className="text-[11px] text-amber-300/80">같은 이름이 있어 덮어씁니다</span>
        )}
        {presetError && <span className="text-[11px] text-red-400">{presetError}</span>}
      </div>
    </div>
  );
}

function PresetChip({
  preset,
  onApply,
  onRemove,
}: {
  preset: SavedPalette;
  onApply: () => void;
  onRemove?: () => void;
}) {
  return (
    <span className="flex items-center rounded-full border border-white/15 transition-colors hover:border-white/40">
      <button
        type="button"
        onClick={onApply}
        className="flex items-center gap-2 py-1.5 pr-3 pl-3 text-xs text-white/70 transition-colors hover:text-white"
      >
        <span className="flex overflow-hidden rounded-full">
          {preset.colors.map((color, index) => (
            <span key={index} className="h-3 w-3" style={{ background: color }} />
          ))}
        </span>
        {preset.name}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${preset.name} 프리셋 삭제`}
          className="py-1.5 pr-2.5 pl-0.5 text-xs text-white/30 transition-colors hover:text-red-300"
        >
          ×
        </button>
      )}
    </span>
  );
}
