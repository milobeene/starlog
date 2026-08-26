"use client";

import FluidCanvas from "@/components/background/FluidCanvas";
import { DEFAULT_PALETTE, PALETTES, SLOT_LABELS } from "@/lib/palette";

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
 * 취소하면 아무 일도 없어야 하므로 상태의 주인이 하나여야 한다
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
              value={color}
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

      <div className="flex flex-wrap items-center gap-2">
        {/* 프리셋은 지금 하나뿐이다 — lib/palette.ts의 PALETTES에 줄만 추가하면 늘어난다 */}
        {PALETTES.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => onChange([...preset.colors])}
            className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5
                       text-xs text-white/70 transition-colors hover:border-white/40 hover:text-white"
          >
            <span className="flex overflow-hidden rounded-full">
              {preset.colors.map((color) => (
                <span key={color} className="h-3 w-3" style={{ background: color }} />
              ))}
            </span>
            {preset.name}
          </button>
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
    </div>
  );
}
