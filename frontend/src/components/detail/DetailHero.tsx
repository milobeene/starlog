"use client";

import GameCover from "@/components/ui/GameCover";
import StatusBadge from "@/components/ui/StatusBadge";
import Chip from "@/components/ui/Chip";
import StarIcon from "@/components/ui/StarIcon";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { formatRating } from "@/lib/labels";
import type { BacklogDetail } from "@/lib/types";

/** 헤더 — 커버 왼쪽, 글자는 커버 아래쪽 기준으로 정렬 */
export default function DetailHero({
  data,
  onOpen,
}: {
  data: BacklogDetail;
  onOpen: (dialog: DetailDialog) => void;
}) {
  const { resolved, personalRecord } = data;

  return (
    <div className="mb-10 flex flex-col items-start gap-8 md:flex-row md:items-end">
      {/* 커버 위 우상단에 연필 — 별도 버튼을 두면 액션 목록이 길어진다 */}
      <div className="group/cover relative w-40 shrink-0 md:w-48">
        <GameCover
          coverUrl={resolved.cover.url}
          coverImageId={resolved.cover.imageId}
          name={resolved.name}
          size="t_cover_big"
          className="border-white/20 shadow-2xl"
        />
        <button
          type="button"
          aria-label="커버 이미지 변경"
          title="커버 이미지 변경"
          onClick={() => onOpen({ kind: "cover" })}
          /* 폰·태블릿은 호버가 없다 — 숨겨두면 커버를 바꿀 방법이 아예 없다. lg부터만 호버로 */
          className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white/80 backdrop-blur-sm transition-all hover:bg-white hover:text-black lg:opacity-0 lg:group-hover/cover:opacity-100"
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
      </div>

      {/* 커버 아래쪽에 바닥을 맞춘다 — items-end + 여기서는 패딩을 주지 않는다 */}
      <div className="flex-1 pb-1">
        <div className="mb-2">
          <StatusBadge status={data.status} size="md" />
        </div>

        <h1 className="mb-3 text-4xl font-semibold tracking-tight text-white drop-shadow-md md:text-5xl">
          {resolved.name}
        </h1>

        {/* 장르가 먼저, 별점은 아래 줄이다 — 한 줄에 섞으면 장르가 길 때 별이 밀려난다 */}
        <div className="flex flex-col items-start gap-2.5">
          {/* 표시값 장르다 — 개인 장르가 있으면 그것이 마스터를 덮은 결과 (§6.7) */}
          <div className="flex flex-wrap items-center gap-2">
            {resolved.genres.map((genre) => (
              <Chip key={genre} label={genre} rounded />
            ))}
          </div>
          {personalRecord.rating != null && (
            <span className="flex items-center gap-1.5 text-lg font-medium text-yellow-500 drop-shadow-sm">
              <StarIcon className="h-[1.05em] w-[1.05em] -translate-y-[1px]" />
              <span className="num">{formatRating(personalRecord.rating)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
