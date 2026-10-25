"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import SectionIcon from "@/components/ui/SectionIcon";
import ErrorNotice from "@/components/ui/ErrorNotice";
import DetailBanner from "@/components/library/DetailBanner";
import Timeline from "@/components/library/Timeline";
import ScreenshotSection from "@/components/library/ScreenshotSection";
import AboutBlock from "@/components/detail/AboutBlock";
import DeleteEntryButton from "@/components/detail/DeleteEntryButton";
import DetailDialogs from "@/components/detail/DetailDialogs";
import DetailHero from "@/components/detail/DetailHero";
import DetailSkeleton from "@/components/detail/DetailSkeleton";
import { GameInformationCard, HowLongToBeatCard, TagCard } from "@/components/detail/InfoCards";
import NotesSection from "@/components/detail/NotesSection";
import PlaythroughSection from "@/components/detail/PlaythroughSection";
import PlaytimeSection from "@/components/detail/PlaytimeSection";
import PurchaseSection from "@/components/detail/PurchaseSection";
import SummaryStats from "@/components/detail/SummaryStats";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { useBannerScroll } from "@/components/detail/useBannerScroll";
import { invalidateQueries, useApi } from "@/lib/useApi";
import { bannerSrc } from "@/lib/cover";
import type { BacklogDetail, OptionsResponse } from "@/lib/types";

/**
 * 상세는 `/library/detail?entry=57`이다. 예전엔 `/library/[entryId]`였는데
 * **정적 내보내기(v1.0 데스크탑)가 동적 경로에 generateStaticParams를 요구해서** 쿼리로 옮겼다.
 * 빌드 시점에 entryId를 알 수 없으니 애초에 만들 수 없는 요구다.
 *
 * useSearchParams는 프리렌더 때 값을 모르므로 Suspense 경계가 필요하다 —
 * 없으면 빌드가 통째로 실패한다
 */
export default function BacklogDetailPage() {
  return (
    <Suspense fallback={null}>
      <BacklogDetail />
    </Suspense>
  );
}

function BacklogDetail() {
  const entryId = useSearchParams().get("entry") ?? "";
  const { bannerRef, onScroll } = useBannerScroll();
  const { data, error, reload } = useApi<BacklogDetail>(`/api/backlog/${entryId}`);
  // 선택지는 편집 폼 전부가 공유한다 (기기·에뮬·계정·플랫폼·구독·사전)
  const options = useApi<OptionsResponse>("/api/me/options");
  /**
   * 열려 있는 다이얼로그. 하나만 열리므로 배열이 아니라 단일 상태로 둔다.
   * 회차·취득은 수정 대상을 같이 들고 다닌다 (null이면 새로 추가)
   */
  const [dialog, setDialog] = useState<DetailDialog>(null);

  // 저장 뒤엔 상세를 다시 읽는다 — 회차를 고치면 서버가 상태·lastPlaythrough를 재계산한다
  /*
   * **전역 무효화다.** 예전엔 이 페이지의 조회 둘만 다시 읽어서, 이름을 바꿔도
   * 사이드바는 옛 이름을 그대로 들고 있었다. 게임 하나를 고치면 사이드바·파셋·통계가
   * 실제로 같이 바뀌므로 전부 다시 읽는 게 맞다
   */
  const refresh = () => {
    invalidateQueries();
  };

  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  /*
   * `loading ||`을 뺐다. 전역 무효화가 돌 때마다 화면이 통째로 스켈레톤으로 무너져
   * **DOM이 파괴됐다 다시 만들어지면서 스크롤이 맨 위로 튀었다.**
   * useApi가 재검증 중에도 data를 들고 있으므로, 있으면 그대로 두고 조용히 갈아끼운다
   */
  if (!data) return <DetailSkeleton />;

  const { master, personalRecord } = data;
  /*
   * 진행 중인 회차 — **종료일이 비었나로 본다.** 서버의 BR-PT-03과 같은 기준이다
   * (상태로 보면 "플레이 중"인데 종료일이 있는 회차를 놓친다)
   */
  const ongoingRun = data.playthroughs.find((run) => run.finishedOn == null) ?? null;

  return (
    <>
      <DetailBanner
        src={bannerSrc(master.bannerImageId, master.coverImageId)}
        bannerRef={bannerRef}
      />

      <main onScroll={onScroll} className="relative z-10 h-full overflow-y-auto pb-24">
        {/*
          자체 앞/뒤 버튼은 두지 않는다 — 브라우저 뒤로가기가 그 역할을 한다.
          배경·블러도 없다: 배너가 이 줄 뒤로 그대로 지나가야 한다
        */}
        <div className="page-x relative z-20 flex shrink-0 items-center gap-4 pt-[4.5rem] pb-2 sm:pt-20">
          <Link
            href="/library"
            className="flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Library
          </Link>
        </div>

        <div className="page-x relative pt-4">
          <DetailHero data={data} onOpen={setDialog} />

          <SummaryStats data={data} onOpen={setDialog} />

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            {/*
              ## 폰에서는 순서가 뒤집힌다 (order)
              좁은 화면에서 About·회차·구매·메모를 다 지나야 개발사/플랫폼이 나오면
              "이 게임이 뭔지"를 보려고 한참 스크롤해야 한다. 게임 정보를 위로 올린다.
              **삭제만 예외로 맨 아래** — 위에 두면 실수로 누른다
            */}
            {/* 좌 — About · 회차 · 플레이 기록 · 구매 · 메모 (설계서 §2.9 순서 + v2 S4) */}
            <div className="order-2 flex flex-col gap-10 lg:order-none lg:col-span-2">
              <section>
                <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-white/90 sm:text-lg">
                  <SectionIcon name="about" />
                  About
                </h3>
                <div className="flex flex-col gap-5 rounded-lg border border-white/10 bg-white/5 p-6">
                  <AboutBlock
                    entryId={Number(entryId)}
                    master={master}
                    onTranslated={() => reload()}
                  />
                </div>
              </section>

              <Timeline detail={data} />

              <PlaythroughSection
                playthroughs={data.playthroughs}
                ongoingRun={ongoingRun}
                onOpen={setDialog}
              />

              {/* 회차 바로 아래 — 둘 다 "언제 얼마나 했나"라 붙어 있어야 읽힌다 (v2 S4) */}
              <PlaytimeSection entryId={data.entryId} onOpen={setDialog} />

              <PurchaseSection acquisitions={data.acquisitions} onOpen={setDialog} />

              <NotesSection memo={personalRecord.memo} onOpen={setDialog} />

              {/* 스크린샷은 메모 아래 — 글을 다 읽은 뒤에 오는 순서다 (v1.0 7단계) */}
              <ScreenshotSection entryId={Number(entryId)} gameName={data.resolved.name} />
            </div>

            {/* 우 — 게임 정보 · 사람들 클리어 시간 · 태그 · 액션 */}
            <div className="order-1 flex flex-col gap-8 lg:order-none">
              <GameInformationCard data={data} onOpen={setDialog} />

              <HowLongToBeatCard master={master} />

              <TagCard tag={data.tag} onOpen={setDialog} />

              {/*
                상태를 고르는 드롭다운이 없는 게 의도다 —
                상태는 회차·취득에서 파생된다. 여기서 직접 못 바꾼다 (§7.2)
              */}
              {/* 데스크탑에서는 우측 열 끝에 붙는다 */}
              <div className="mt-2 hidden lg:block">
                <DeleteEntryButton onClick={() => setDialog({ kind: "delete" })} />
              </div>
            </div>

            {/* 폰에서는 메모까지 다 지난 맨 아래 (order-3) */}
            <div className="order-3 lg:hidden">
              <DeleteEntryButton onClick={() => setDialog({ kind: "delete" })} />
            </div>
          </div>
        </div>
      </main>

      <DetailDialogs
        dialog={dialog}
        data={data}
        options={options.data}
        onClose={() => setDialog(null)}
        onSaved={refresh}
      />
    </>
  );
}
