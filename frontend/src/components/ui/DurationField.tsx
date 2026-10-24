"use client";

import { useRef, type KeyboardEvent, type Ref } from "react";
import {
  cleanHours,
  cleanMinutes,
  settleSegs,
  stepSegs,
  type DurSegs,
} from "@/lib/playtimeInput";

/**
 * **길이 입력 칸** — `[ 10 ]시간 [ 45 ]분`. 플레이타임처럼 시가 위로 열려 있는 값용이다.
 * 구조와 키는 homeops `SegmentField`/`TimeField`를 따르되, 거기는 *시각*(0~29시)이고 여기는 *길이*라 다르다.
 *
 *   · 시·분이 각각 `<input>`이라 Tab이 시 → 분, Shift+Tab이 분 → 시로 간다
 *   · 시는 자릿수 고정이 없다(최대 5자리) — 칸 폭은 `field-sizing: content`가 글자에 맞춘다.
 *     그래서 **자리가 차서 분으로 넘어가는 동작이 없다.** 시에서 분으로는 Tab·→·`:`·공백
 *   · 분은 0~59. 이어 친 값이 59를 넘으면 방금 친 숫자로 새로 시작한다
 *   · ↑↓: 시 칸은 시만, 분 칸은 **올림·내림이 시로 번진다** (59분 ↑ → 시 +1, 00분 ↓ → 시 −1)
 *   · 칸에 들어오면 글자를 통째로 골라 둔다 — 바로 치면 갈아끼워진다
 *   · 칸 전체를 떠나면 다듬는다(시 앞 0 제거, 분 두 자리). 한쪽만 채웠으면 다른 쪽에 0
 *
 * homeops의 `moving` 함정(자리가 차서 `focus()`로 옮길 때 앞 칸 blur가 같은 틱에 와서 방금 친 글자를
 * 옛 값으로 덮는다)은 여기선 안 생긴다 — 자동으로 칸을 옮기는 입력이 없고, 옮기는 키(`:`·공백·→)는
 * 글자를 안 바꾸며, 칸 사이 blur는 아무것도 안 한다. 다듬기는 **칸 전체를 떠날 때만** 돈다.
 *
 * 값은 부르는 쪽이 쥔다(`DurSegs`) — 덜 친 상태(시 비고 분만 있음)도 그대로 올라간다.
 * Enter는 막지 않는다(부르는 쪽 다이얼로그가 저장한다).
 */
export default function DurationField({
  value,
  onChange,
  prefix,
  ariaLabel,
  hoursRef,
  invalid = false,
}: {
  value: DurSegs;
  onChange: (next: DurSegs) => void;
  /** 칸 맨 앞 글자 — 더하기 칸의 `+` */
  prefix?: string;
  ariaLabel: string;
  /** 시 칸 — 다이얼로그가 열릴 때 포커스를 주려고 */
  hoursRef?: Ref<HTMLInputElement>;
  invalid?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  // 마우스로 들어온 직후의 mouseup이 방금 고른 글자를 풀어버린다 — 한 번 막는다
  const justFocused = useRef(false);

  const input = (i: 0 | 1) => box.current?.querySelectorAll<HTMLInputElement>("input")[i];

  const select = (i: 0 | 1) => {
    // 제어 입력이라 새 글자가 쓰인 뒤에 골라야 한다
    requestAnimationFrame(() => input(i)?.select());
  };

  const onKey = (seg: "h" | "m", e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(stepSegs(value, seg, e.key === "ArrowUp" ? 1 : -1));
      select(seg === "h" ? 0 : 1);
      return;
    }
    if (seg === "h" && (e.key === ":" || e.key === " " || e.key === "ArrowRight")) {
      const el = e.currentTarget;
      // →는 글자 끝에서만 넘어간다 (중간이면 평소대로 커서 이동)
      if (e.key === "ArrowRight" && el.selectionStart !== el.value.length) return;
      e.preventDefault();
      input(1)?.focus();
      return;
    }
    if (seg === "m" && e.key === "ArrowLeft" && e.currentTarget.selectionEnd === 0) {
      e.preventDefault();
      input(0)?.focus();
      return;
    }
    // 분이 비어 있을 때 Backspace → 시 칸으로
    if (seg === "m" && e.key === "Backspace" && value.m === "") {
      e.preventDefault();
      input(0)?.focus();
    }
  };

  const common = () => ({
    type: "text" as const,
    inputMode: "numeric" as const,
    autoComplete: "off",
    spellCheck: false,
    "aria-invalid": invalid || undefined,
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      justFocused.current = true;
      e.currentTarget.select();
    },
    onMouseUp: (e: React.MouseEvent) => {
      if (justFocused.current) e.preventDefault();
      justFocused.current = false;
    },
  });

  const segCls =
    "num min-w-[1.4ch] rounded-[3px] bg-transparent px-0.5 text-right outline-none [field-sizing:content] placeholder:text-white/25 focus:bg-white/20";

  return (
    <div
      ref={box}
      role="group"
      aria-label={ariaLabel}
      // 칸 바깥(글자·여백)을 눌러도 가까운 칸으로
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        e.preventDefault();
        const hours = input(0);
        const minutes = input(1);
        if (!hours || !minutes) return;
        const edge = minutes.getBoundingClientRect().left;
        (e.clientX < edge ? hours : minutes).focus();
      }}
      onBlur={(e) => {
        if (box.current?.contains(e.relatedTarget as Node | null)) return;
        const next = settleSegs(value);
        if (next.h !== value.h || next.m !== value.m) onChange(next);
      }}
      className={`flex w-fit min-w-40 cursor-text items-center gap-0.5 rounded-md border bg-white/5 px-3 py-2 text-sm text-white transition-colors focus-within:border-white/30 focus-within:bg-white/10 hover:border-white/20 ${
        invalid ? "border-red-400/50" : "border-white/10"
      }`}
    >
      {prefix && <span className="num mr-1.5 text-white/45">{prefix}</span>}
      <input
        {...common()}
        ref={hoursRef}
        value={value.h}
        placeholder="0"
        aria-label={`${ariaLabel} 시간`}
        onChange={(e) => onChange({ ...value, h: cleanHours(e.target.value) })}
        onKeyDown={(e) => onKey("h", e)}
        className={segCls}
      />
      <span className="mr-2 text-white/55">시간</span>
      <input
        {...common()}
        value={value.m}
        placeholder="00"
        aria-label={`${ariaLabel} 분`}
        onChange={(e) => onChange({ ...value, m: cleanMinutes(e.target.value) })}
        onKeyDown={(e) => onKey("m", e)}
        className={segCls}
      />
      <span className="text-white/55">분</span>
    </div>
  );
}
