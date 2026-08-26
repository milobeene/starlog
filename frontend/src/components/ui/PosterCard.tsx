import Link from "next/link";
import GameCover from "./GameCover";

/** 대시보드 가로 목록 한 칸 — 커버 · 이름 · 줄 성격에 맞는 값 하나 */
export default function PosterCard({
  entryId,
  name,
  coverUrl,
  coverImageId,
  meta,
  metaClassName = "text-white/40",
}: {
  entryId: number;
  name: string;
  coverUrl: string | null;
  coverImageId: string | null;
  /** 문자열이 아니라 노드다 — 평점 줄은 별 아이콘을 함께 그린다 */
  meta: React.ReactNode;
  metaClassName?: string;
}) {
  return (
    <Link href={`/library/${entryId}`} className="group flex cursor-pointer flex-col">
      <div className="mb-4">
        <GameCover coverUrl={coverUrl} coverImageId={coverImageId} name={name} />
      </div>
      {/* GameCard와 같은 규칙 — 한 줄, 넘치면 `…`, 전체는 title로 */}
      <h4 className="mb-1 truncate text-sm leading-snug font-medium" title={name}>
        {name}
      </h4>
      {/* 이름(14px)보다 한 칸만 작게 — text-xs는 커버 폭에 비해 너무 잘게 보였다 */}
      <div className={`num text-[13px] ${metaClassName}`}>{meta}</div>
    </Link>
  );
}
