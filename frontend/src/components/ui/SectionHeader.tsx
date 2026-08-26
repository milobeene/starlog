import Link from "next/link";

/**
 * 섹션 머리 — 제목, 그리고 선택적으로 오른쪽 끝에 `More →`.
 *
 * 대시보드 목록 3줄은 moreHref를 **안 넘긴다** — 줄 오른쪽 끝의 페이드 위에
 * More 버튼이 따로 있어서, 여기에도 두면 한 섹션에 같은 링크가 둘이 된다
 */
export default function SectionHeader({ title, moreHref }: { title: string; moreHref?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between">
      <h3 className="text-2xl font-medium tracking-tight text-white/90">{title}</h3>
      {moreHref && (
        <Link
          href={moreHref}
          className="flex items-center gap-1 pb-1 text-xs font-medium tracking-widest text-white/50 uppercase transition-colors hover:text-white"
        >
          More <span className="text-[12px] leading-none font-normal">→</span>
        </Link>
      )}
    </div>
  );
}
