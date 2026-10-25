"use client";

import { Button } from "@/components/ui/Field";
import type { CoverTarget } from "@/lib/desktop";

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

const COVER_CHOICES: { value: CoverTarget; label: string; help: string }[] = [
  { value: "db", label: "DB", help: "DB 안에 저장합니다. 백업·세이브 뽑기에 같이 들어갑니다 (기본)." },
  { value: "local", label: "로컬 폴더", help: "이 PC 데이터 폴더의 covers/에 저장합니다. 다른 PC·클라우드 백업에는 없습니다." },
  { value: "storage", label: "스토리지(R2)", help: "버킷에 올리고 공개 주소로 봅니다. 백업에는 안 들어갑니다." },
];

/**
 * 커버 저장 위치 — 셋 중 하나 (2026-10-25). 고른 것의 설명 한 줄만 보인다.
 * 스토리지는 칸이 다 차야(`storageNote`가 없어야) 고를 수 있다 — 서버도 못 하면 DB로 떨어뜨리지만,
 * 고른 것과 다르게 저장되는 걸 화면에서 먼저 막는다. 이미 스토리지로 저장돼 있으면 그대로 보여 준다
 */
export function CoverTargetChoice({
  value,
  onChange,
  storageNote,
}: {
  value: CoverTarget;
  onChange: (v: CoverTarget) => void;
  /** 스토리지를 못 고르는 이유. null이면 고를 수 있다 */
  storageNote: string | null;
}) {
  const chosen = COVER_CHOICES.find((c) => c.value === value) ?? COVER_CHOICES[0];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
        커버 저장 위치
      </span>
      <div role="radiogroup" aria-label="커버 저장 위치" className="flex flex-wrap gap-1.5">
        {COVER_CHOICES.map((c) => {
          const off = c.value === "storage" && storageNote !== null && value !== "storage";
          const on = value === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={off}
              title={off ? storageNote ?? undefined : undefined}
              onClick={() => onChange(c.value)}
              className={`h-8 rounded-md border px-3 text-[12px] transition-colors ${
                on
                  ? "border-white/30 bg-white/15 text-white"
                  : "border-white/10 text-white/45 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-white/30">
        {chosen.help}
        {value === "storage" && storageNote !== null && (
          <span className="text-amber-200/60"> {storageNote} — 그동안은 DB에 저장됩니다.</span>
        )}
        {value !== "storage" && storageNote !== null && <span> 스토리지는 {storageNote}.</span>}
      </p>
    </div>
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
