"use client";

/** 편집 폼 공용 — 라벨 + 입력. 스타일을 한 곳에 모아 폼마다 안 흩어지게 한다 */
export const FIELD_INPUT =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition-colors placeholder:text-white/25 focus:border-white/30 focus:bg-white/10 focus:outline-none";

/** 옵션 목록은 OS가 그리는 팝업이라 어두운 배경을 직접 지정해야 흰 판이 안 뜬다 */
export const FIELD_SELECT = `${FIELD_INPUT} [&>option]:bg-neutral-900`;

/** 달력 아이콘이 기본 검정이라 어두운 배경에서 안 보인다 — invert로 뒤집는다 */
export const FIELD_DATE = `${FIELD_INPUT} num [&::-webkit-calendar-picker-indicator]:invert`;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-white/30">{hint}</span>}
    </label>
  );
}

export function Button({
  children,
  variant = "ghost",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const tone =
    variant === "primary"
      ? "border border-white/25 bg-white text-black hover:bg-white/85"
      : variant === "danger"
        ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
        : "border border-white/15 text-white/80 hover:bg-white/10 hover:text-white";

  return (
    <button
      {...rest}
      className={`rounded-md px-4 py-2 text-xs font-medium tracking-widest uppercase transition-all disabled:pointer-events-none disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  );
}

/** 편집 가능한 섹션 제목 옆의 연필 */
export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/10 hover:text-white"
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    </button>
  );
}
