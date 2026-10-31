"use client";

/** 오른쪽 화면 맨 위 — 제목·개수는 왼쪽, 도구 줄은 오른쪽. 스크롤해도 남는다 */
export default function PaneHeader({
  title,
  sub,
  count,
  note,
  children,
}: {
  title: string;
  sub?: string | null;
  count: number | null;
  /** 제목 옆 작은 글씨 — 스팀 묶음의 연결된 게임 */
  note?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-5 py-3 xl:px-8">
      <div className="mr-auto flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-base font-medium text-white/90 sm:text-lg">{title}</h1>
        {count !== null && <span className="num shrink-0 text-xs text-white/40">{count}장</span>}
        {note && <span className="shrink-0 truncate text-xs text-white/50" data-link-note>{note}</span>}
        {sub && <span className="num hidden shrink-0 text-[11px] text-white/30 md:inline">{sub}</span>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </header>
  );
}
