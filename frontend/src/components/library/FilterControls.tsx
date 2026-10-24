"use client";

import { useState } from "react";
import type { ComboOption } from "@/components/ui/Combobox";

/** 접히는 축 하나. 셋이 세로로 서고 각자 접힌다 (사용자 결정) */
export function AxisSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/5 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        /* 패딩까지 눌리게 (v1.2). 음수 마진으로 칸 밖으로 안 밀려나온다 */
        className="-mx-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-widest text-white/50 uppercase transition-colors hover:bg-white/5 hover:text-white/80"
      >
        <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {title}
        <span className="font-normal tracking-normal text-white/25 normal-case">{hint}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {children}
        </div>
      )}
    </div>
  );
}

export const INPUT =
  "w-full rounded-md border border-white/10 bg-white/5 py-1.5 pr-7 pl-3 text-sm text-white transition-colors placeholder:text-white/25 focus:border-white/30 focus:bg-white/10 focus:outline-none";

/** 옵션 팝업은 OS가 그린다 — 배경을 직접 주지 않으면 흰 판이 뜬다 (Field.tsx와 같은 이유) */
const SELECT = `${INPUT} [&>option]:bg-neutral-900`;

/**
 * 소속·기기·계정은 **고르는 것**이지 치는 것이 아니다 (v1.2).
 * 상세의 회차 다이얼로그가 이미 네이티브 select라 검색 박스도 같은 물건으로 맞춘다 —
 * 자유 입력이 필요한 Developer·Genre만 Combobox로 남는다
 */
export function Select({
  value,
  onChange,
  options,
  empty = "전체",
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  empty?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
      <option value="">{empty}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
