"use client";

import { Button } from "@/components/ui/Field";

/**
 * 라벨 + 실제 키 이름.
 *
 * "공개 주소"만 보고 `public-base-url`을 떠올리기 어렵다 — 벤더 문서와 대조하려면
 * **원래 이름**이 필요하다. 작게 병기한다
 */
export function Labeled({
  label,
  keyName,
  hint,
  bad,
  children,
}: {
  label: string;
  keyName?: string;
  hint?: string;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-1.5">
        <span
          className={`text-[10px] font-semibold tracking-widest uppercase ${
            bad ? "text-red-400" : "text-white/40"
          }`}
        >
          {label}
        </span>
        {keyName && <span className="font-mono text-[10px] text-white/20">{keyName}</span>}
      </span>
      <div className={bad ? "[&>input]:border-red-500/60" : undefined}>{children}</div>
      {hint && <span className="text-[11px] text-white/30">{hint}</span>}
    </label>
  );
}

/** 체크하면 **체크표시**가 뜬다 — 흰 사각형만 차는 건 켜진 건지 꺼진 건지 헷갈렸다 */
export function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-sm ${
        disabled ? "cursor-not-allowed text-white/25" : "cursor-pointer text-white/80"
      }`}
    >
      <span className="relative flex h-4 w-4 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-4 w-4 appearance-none rounded border border-white/25 bg-white/5 transition-colors checked:border-white checked:bg-white disabled:opacity-40"
        />
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none absolute h-3 w-3 stroke-black opacity-0 peer-checked:opacity-100"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      </span>
      {label}
    </label>
  );
}

export function Section({
  title,
  hint,
  required,
  disabled,
  children,
}: {
  title: string;
  hint?: string;
  required?: boolean;
  /**
   * 이 섹션이 지금 시험·저장 중인가.
   *
   * ⚠️ **폼 전체가 아니라 이 묶음만 잠근다** (2026-08-28). 섹션마다 따로 도는 게 요점이라,
   * IGDB를 시험하는 20초 동안 번역 칸까지 막히면 나눈 뜻이 없다
   */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-white/8 pt-5">
      <div>
        <h3 className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">
          {title}
          {required && <span className="ml-1.5 text-white/25 normal-case">필수</span>}
        </h3>
        {hint && <p className="mt-1 text-[11px] text-white/30">{hint}</p>}
      </div>
      <fieldset
        disabled={disabled}
        className={`flex flex-col gap-4 ${disabled ? "opacity-50" : ""}`}
      >
        {children}
      </fieldset>
    </section>
  );
}


/**
 * 섹션마다 붙는 [테스트] · [저장] · 결과 한 줄.
 *
 * ⚠️ **입구에는 안 붙인다.** 입구는 백엔드가 뜨기 전이라 IGDB·번역을 부를 데가 없고,
 * 애초에 목적이 다르다 — 거기서는 "이 연결로 들어가도 되나"를 한 번에 보는 게 맞다
 */
export function SectionFooter({
  inline,
  ready,
  state,
  found,
  onTest,
  onSave,
}: {
  inline: boolean;
  ready: boolean;
  state: "test" | "save" | undefined;
  found: { ok: boolean; message: string } | undefined;
  onTest: () => void;
  onSave: () => void;
}) {
  if (!inline) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
      {found && (
        <span className={`mr-auto text-[11px] ${found.ok ? "text-emerald-300/80" : "text-red-400"}`}>
          {found.ok ? "✓ " : "✕ "}
          {found.message}
        </span>
      )}
      <Button onClick={onTest} disabled={!ready || state !== undefined}>
        {state === "test" ? "확인 중…" : "테스트"}
      </Button>
      <Button variant="primary" onClick={onSave} disabled={state !== undefined}>
        {state === "save" ? "저장 중…" : "저장"}
      </Button>
      {state === "test" && (
        <span className="text-[11px] text-white/35">다른 화면에 다녀오셔도 됩니다</span>
      )}
    </div>
  );
}
