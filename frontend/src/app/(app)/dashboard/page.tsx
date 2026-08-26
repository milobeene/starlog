"use client";

import Link from "next/link";
import PageHeading from "@/components/ui/PageHeading";
import SectionHeader from "@/components/ui/SectionHeader";
import PosterCard from "@/components/ui/PosterCard";
import StarIcon from "@/components/ui/StarIcon";
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
      <GameRow
        title="Recently Played"
        sort="lastPlayed"
        meta={(card) =>
          card.lastPlaythrough?.finishedOn ?? card.lastPlaythrough?.startedOn ?? "—"
        }
      />
      <GameRow title="Most Played" sort="playtime" meta={() => "—"} />
      <GameRow
        title="Top Rated"
        sort="rating"
        meta={(card) =>
          card.rating == null ? (
            "—"
          ) : (
            /*
             * 라이브러리 카드와 같은 StarIcon을 쓴다 — 예전엔 여기만 `★` 글자였다.
             * 글자는 폰트가 정하는 베이스라인에 앉아 숫자보다 아래로 처지는데,
             * flex + items-center면 줄의 가운데에 맞는다. 별은 시각 무게중심이
             * 도형 중심보다 아래라 1px 더 올려야 숫자와 나란해 보인다
             */
            <span className="flex items-center gap-1">
              <StarIcon className="h-4 w-4 -translate-y-[1px]" />
              <span className="num">{formatRating(card.rating)}</span>
            </span>
          )
        }
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

/**
 * 가로 목록 한 줄 — **무조건 한 줄이다.**
 *
 * 예전엔 12개를 받아 반응형 그리드에 흘렸는데, 넓은 화면(10칸)에서 두 줄이 됐다.
 * 지금은 grid-flow-col로 한 줄에 밀어 넣고 넘치는 칸은 잘라낸다.
 *
 * 오른쪽 끝은 **마스크로 실제 픽셀을 지운다** — 배경 위에 색을 덮는 게 아니다.
 * 우리 배경은 유체 셰이더라 불투명한 그라데이션을 얹으면 그 띠만 색이 죽는다.
 * mask-image는 카드 자체의 알파를 0으로 만들어 배경이 그대로 비친다
 */
function GameRow({
  title,
  sort,
  meta,
  metaClassName,
}: {
  title: string;
  sort: string;
  meta: (card: BacklogCard) => React.ReactNode;
  metaClassName?: string;
}) {
  const { data, loading } = useApi<PageResponse<BacklogCard>>(
    `/api/backlog?sort=${sort}&size=10`,
  );

  return (
    <section className="w-full border-b-line p-10">
      {/* More는 줄 오른쪽 끝에 있다 — 머리에도 두면 한 섹션에 같은 링크가 둘이 된다 */}
      <SectionHeader title={title} />
      {loading ? (
        <RowSkeleton />
      ) : (
        /*
         * --card 하나로 칸 폭과 마스크 위치를 같이 정한다.
         * gap이 1rem이니 (칸수-1)rem을 빼고 나눈다. 마스크의 %도 폭 기준이라
         * 같은 식을 그대로 넣을 수 있다 — 칸 수가 바뀌어도 페이드가 따라온다
         */
        <div className="relative [--card:calc((100%_-_5rem)_/_6)] lg:[--card:calc((100%_-_7rem)_/_8)] xl:[--card:calc((100%_-_9rem)_/_10)]">
          <div
            className="overflow-hidden [mask-image:linear-gradient(to_right,#000_calc(100%_-_var(--card)_*_0.7),transparent_calc(100%_-_var(--card)_*_0.05))]"
          >
            <div className="grid grid-flow-col auto-cols-[var(--card)] gap-4">
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
          </div>

          {/*
            마스크 밖에 둔다 — 안에 있으면 버튼도 같이 지워진다.
            pb-14는 커버 아래 이름·값 줄의 높이다. 그만큼 아래를 빼면 세로 가운데가
            카드가 아니라 **커버의 가운데**로 온다
          */}
          {/*
            **호버를 <a>에 걸고 알약은 group-hover로 반응시킨다.**
            예전엔 알약(span)에만 호버가 붙어서, 링크 몸통은 눌리는데 아무 반응이 없었다 —
            눌리는 곳과 눌리는 것처럼 보이는 곳이 달라 조준해서 눌러야 했다.
            pl-10으로 왼쪽 여백까지 링크의 몸으로 삼는다. 어차피 페이드로 지워진 자리다
          */}
          <Link
            href={`/library?sort=${sort}`}
            className="group absolute inset-y-0 right-0 flex items-center pb-14 pl-10"
          >
            <span className="flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-3.5 py-2 text-[11px] font-medium tracking-widest text-white/70 uppercase backdrop-blur-sm transition-colors group-hover:border-white/40 group-hover:bg-black/50 group-hover:text-white">
              More <span className="text-[12px] leading-none font-normal">→</span>
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}
