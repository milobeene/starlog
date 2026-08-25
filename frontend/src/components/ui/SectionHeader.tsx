import Link from "next/link";

/** 대시보드 목록 3줄의 머리 — 제목 + `More →` */
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
