"use client";

import Link from "next/link";

/**
 * 오른쪽 화면 맨 위 — 떠 있는 유리 판넬. 왼쪽 레일과 같은 재질이고, 스크롤하면 격자가 이 판넬 밑으로 지나간다
 * (가로로 꽉 찬 띠를 두지 않는다 — 배경 셰이더가 판넬 둘레로 계속 보여야 한다).
 * 왼쪽: 제목·장수·"n개 선택" / 오른쪽: 도구. 도구의 맨 오른쪽 칸은 호출하는 쪽이 [선택]으로 고정한다
 */
export default function PaneHeader({
  title,
  href,
  sub,
  count,
  note,
  left,
  children,
}: {
  title: string;
  /** 있으면 제목이 링크 (게임 상세로) */
  href?: string;
  sub?: string | null;
  count: number | null;
  /** 제목 옆 작은 글씨 — 스팀 묶음의 연결된 게임 */
  note?: string | null;
  /** 제목 줄 왼쪽에 붙는 것 — "n개 선택" */
  left?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="glass-panel sticky top-[4.75rem] z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-2.5">
      <div className="mr-auto flex min-w-0 flex-[1_1_18rem] items-baseline gap-3">
        {href ? (
          <Link href={href} data-title-link title="게임 상세 보기" className="truncate text-base font-medium text-white/90 transition-colors hover:text-white hover:underline hover:decoration-white/30 hover:underline-offset-4 sm:text-lg">
            <h1 className="inline truncate">{title}</h1>
          </Link>
        ) : (
          <h1 className="truncate text-base font-medium text-white/90 sm:text-lg">{title}</h1>
        )}
        {count !== null && <span className="num shrink-0 text-xs text-white/40">{count}장</span>}
        {note && <span className="min-w-0 truncate text-xs text-white/50" data-link-note>{note}</span>}
        {sub && <span className="num hidden min-w-0 truncate text-[11px] text-white/30 xl:inline">{sub}</span>}
        {left}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>
    </header>
  );
}
