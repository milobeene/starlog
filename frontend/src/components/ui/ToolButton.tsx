"use client";

/**
 * 도구 줄 버튼 — 아이콘 + 글자, 작게 한 줄에 놓는다 (스크린샷 구역·스크린샷 화면).
 *
 * 예전엔 구역 제목 줄의 버튼이 전부 같은 회색 글씨라 "폴더 열기"와 "전체 화면"이 구분되지 않았다.
 * 그래서 **묶음(ToolGroup)** 으로 역할을 나눈다: 고르기 계열 / 보기·열기 계열. 위험한 건 삭제 하나만 붉다.
 * 꺼진 버튼은 흐리게 + 포인터 없음 — 눌러도 반응이 없는 이유를 모양으로 알린다
 */
const ICONS = {
  select: "M9 12l2 2 4-4M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z",
  all: "M4 7h16M4 12h16M4 17h10",
  share: "M12 3v12m0-12l-4 4m4-4l4 4M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5",
  trash: "M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a2 2 0 002 2h6a2 2 0 002-2V7M10 11v6m4-6v6",
  folder: "M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  more: "M6 9l6 6 6-6",
  less: "M6 15l6-6 6 6",
  close: "M6 18L18 6M6 6l12 12",
  move: "M4 12h14m-5-5l5 5-5 5",
  plus: "M12 5v14M5 12h14",
  panel: "M4 5h16v14H4zM9 5v14",
} as const;

export type ToolIcon = keyof typeof ICONS;

export function Icon({ name, className = "h-3.5 w-3.5" }: { name: ToolIcon; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

type Tone = "default" | "danger" | "primary";

/** 버튼 모양 한 벌 — 드롭다운 트리거(공유)도 같은 모양을 쓴다 */
export function toolClass(tone: Tone = "default", active = false) {
  const base = "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-35";
  if (tone === "danger") return `${base} text-red-300 hover:bg-red-500/15`;
  if (tone === "primary") return `${base} bg-white text-black hover:bg-white/85`;
  return `${base} ${active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`;
}

export function ToolButton({
  icon,
  tone = "default",
  active = false,
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ToolIcon; tone?: Tone; active?: boolean }) {
  return (
    <button type="button" {...rest} className={`${toolClass(tone, active)} ${className}`}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** 같은 역할의 버튼을 한 알약으로 묶는다 */
export function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.04] p-0.5">
      {children}
    </div>
  );
}
