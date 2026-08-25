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
  meta: string;
  metaClassName?: string;
}) {
  return (
    <Link href={`/library/${entryId}`} className="group flex cursor-pointer flex-col">
      <div className="mb-4">
        <GameCover coverUrl={coverUrl} coverImageId={coverImageId} name={name} />
      </div>
      <h4 className="mb-1 line-clamp-1 text-sm leading-snug font-medium">
        {name}
      </h4>
      <div className={`num text-xs ${metaClassName}`}>{meta}</div>
    </Link>
  );
}
