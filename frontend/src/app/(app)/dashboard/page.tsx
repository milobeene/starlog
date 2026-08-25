"use client";

import PageHeading from "@/components/ui/PageHeading";
import SectionHeader from "@/components/ui/SectionHeader";
import PosterCard from "@/components/ui/PosterCard";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { RowSkeleton, Skeleton } from "@/components/ui/Skeleton";
import StatTile from "@/components/dashboard/StatTile";
import MonthlySpendingChart from "@/components/dashboard/MonthlySpendingChart";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { formatRating } from "@/lib/labels";
import type {
  BacklogCard,
  FacetsResponse,
  MonthlySpending,
  PageResponse,
  PlaytimeStats,
} from "@/lib/types";

/**
 * 대시보드는 타일마다 다른 API를 부른다 (API 설계서 §1.1.1).
 * 한 엔드포인트로 안 묶은 이유 — 화면이 필요한 타일만 부르게 두려고
 */
export default function DashboardPage() {
  const session = useSession();
  const facets = useApi<FacetsResponse>("/api/backlog/facets");
  const playtime = useApi<PlaytimeStats>("/api/stats/playtime");
  const spending = useApi<MonthlySpending>("/api/stats/spending/monthly");
  const playing = useApi<PageResponse<BacklogCard>>("/api/backlog?status=PLAYING&size=5");

  const statuses = facets.data?.statuses ?? [];
  const totalGames = statuses.reduce((sum, item) => sum + item.count, 0);
  const completed = statuses.find((item) => item.status === "COMPLETED")?.count ?? 0;
  const playingCount = statuses.find((item) => item.status === "PLAYING")?.count ?? 0;
  const completionRate = totalGames > 0 ? ((completed / totalGames) * 100).toFixed(1) : "0.0";

  if (facets.error) return <ErrorNotice error={facets.error} onRetry={facets.reload} />;

  return (
    <main className="h-full w-full overflow-y-auto pb-20">
      <div className="w-full border-b-line px-10 pt-28 pb-14">
        <PageHeading
          eyebrow="Dashboard"
          title={`Welcome back, ${session.me?.profile.nickname ?? ""}!`}
          subtitle="플레이 기록을 한눈에 확인하실 수 있습니다"
        />
      </div>

      {/* 요약 타일 4개 */}
      {/*
        커스텀 .divide-y-line은 레이어 밖이라 Tailwind의 lg:divide-y-0을 이겨버린다 —
        큰 화면에서도 위 테두리가 남는다. 진짜 유틸리티로만 쓴다
      */}
      <div className="grid w-full grid-cols-1 divide-y divide-white/15 border-b-line lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <StatTile
          label="Total Games"
          value={facets.loading ? <Skeleton className="h-12 w-24" /> : totalGames}
          hint="Games in your library"
        />

        {/* 다른 타일과 같은 구조여야 숫자 베이스라인이 맞는다 — 이름 목록도 hint 자리로 */}
        <StatTile
          label="Currently Playing"
          value={facets.loading ? <Skeleton className="h-12 w-16" /> : playingCount}
          hint={
            playing.data && playing.data.items.length > 0
              ? // 먼저 시작한 순 — 목록 API에는 이 정렬이 없어 회차 시작일로 여기서 세운다
                [...playing.data.items]
                  .sort((a, b) =>
                    (a.lastPlaythrough?.startedOn ?? "").localeCompare(
                      b.lastPlaythrough?.startedOn ?? "",
                    ),
                  )
                  .map((card) => card.displayName)
                  .join(", ")
              : "아직 진행 중인 게임이 없습니다"
          }
        />

        <StatTile
          label="Completed"
          value={facets.loading ? <Skeleton className="h-12 w-20" /> : completed}
          hint={`${completionRate}% completion rate`}
        />

        <StatTile
          label="Total Hours"
          value={
            playtime.loading ? (
              <Skeleton className="h-12 w-32" />
            ) : (
              (playtime.data?.totalHours ?? 0).toLocaleString()
            )
          }
          unit="h"
          hint={
            playtime.data && playtime.data.recordedEntries === 0
              ? "아직 기록된 플레이 시간이 없어"
              : "Time tracked across platforms"
          }
        />
      </div>

      {/* 목록 3줄 — 더 보기는 같은 sort를 라이브러리로 넘긴다 */}
      <GameRow title="Recently Played" sort="lastPlayed" meta={(card) => card.lastPlaythrough?.finishedOn ?? card.lastPlaythrough?.startedOn ?? "—"} />
      <GameRow title="Most Played" sort="playtime" meta={() => "—"} />
      <GameRow
        title="Top Rated"
        sort="rating"
        meta={(card) => (card.rating == null ? "—" : `★ ${formatRating(card.rating)}`)}
        metaClassName="text-yellow-500/80"
      />

      {/* 차트 — 월별 지출 하나뿐 */}
      <div className="mb-10 w-full p-10">
        <h3 className="mb-8 text-2xl font-medium tracking-tight text-white/90">Monthly Spending</h3>
        {spending.loading ? (
          <Skeleton className="h-72 w-full" />
        ) : spending.data ? (
          <MonthlySpendingChart data={spending.data} />
        ) : null}
      </div>
    </main>
  );
}

/** 가로 목록 한 줄 — 제목 + 5개 + More → */
function GameRow({
  title,
  sort,
  meta,
  metaClassName,
}: {
  title: string;
  sort: string;
  meta: (card: BacklogCard) => string;
  metaClassName?: string;
}) {
  const { data, loading } = useApi<PageResponse<BacklogCard>>(
    `/api/backlog?sort=${sort}&size=12`,
  );

  return (
    <section className="w-full border-b-line p-10">
      <SectionHeader title={title} moreHref={`/library?sort=${sort}`} />
      {loading ? (
        <RowSkeleton />
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
          {data?.items.map((card) => (
            <PosterCard
              key={card.entryId}
              entryId={card.entryId}
              name={card.displayName}
              coverUrl={card.coverUrl}
              coverImageId={card.coverImageId}
              meta={meta(card)}
              metaClassName={metaClassName}
            />
          ))}
        </div>
      )}
    </section>
  );
}
