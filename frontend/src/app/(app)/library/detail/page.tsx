"use client";

import Link from "next/link";
import { Suspense, useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import GameCover from "@/components/ui/GameCover";
import StatusBadge from "@/components/ui/StatusBadge";
import Chip from "@/components/ui/Chip";
import StarIcon from "@/components/ui/StarIcon";
import SectionIcon from "@/components/ui/SectionIcon";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import DetailBanner from "@/components/library/DetailBanner";
import InfoRow from "@/components/library/InfoRow";
import DataTable from "@/components/library/DataTable";
import Timeline from "@/components/library/Timeline";
import PersonalRecordDialog from "@/components/library/PersonalRecordDialog";
import OverridesDialog from "@/components/library/OverridesDialog";
import PlaythroughDialog from "@/components/library/PlaythroughDialog";
import AcquisitionDialog from "@/components/library/AcquisitionDialog";
import TagGenreDialog from "@/components/library/TagGenreDialog";
import MoneyText from "@/components/ui/Money";
import CoverDialog from "@/components/library/CoverDialog";
import ScreenshotSection from "@/components/library/ScreenshotSection";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Button, EditButton } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { useRouter } from "next/navigation";
import { invalidateQueries, useApi } from "@/lib/useApi";
import { bannerSrc } from "@/lib/cover";
import {
  ACQUISITION_METHOD_LABEL,
  PLAYTHROUGH_STATUS_LABEL,
  formatList,
  formatRating,
} from "@/lib/labels";
import type { Acquisition, BacklogDetail, OptionsResponse, Playthrough } from "@/lib/types";
import { formatHours } from "@/lib/format";

/** 열려 있는 다이얼로그. 회차·취득은 수정 대상을 같이 들고 다닌다 (null이면 추가) */
type Dialog =
  | null
  | { kind: "record" }
  | { kind: "overrides" }
  | { kind: "tag" }
  | { kind: "cover" }
  | { kind: "delete" }
  | { kind: "playthrough"; run: Playthrough | null }
  | { kind: "acquisition"; item: Acquisition | null };

const PLAYTHROUGH_TONE: Record<string, string> = {
  PLAYING: "text-green-400",
  COMPLETED: "text-blue-400",
  PAUSED: "text-yellow-400",
  DROPPED: "text-red-400",
};

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
  const bannerRef = useRef<HTMLDivElement>(null);

  /**
   * 배너는 fixed라 뷰포트 폭을 다 쓰지만 스크롤을 안 탄다.
   * 스크롤한 만큼 위로 밀어 콘텐츠와 같이 흐르는 것처럼 만든다.
   * 상태가 아니라 ref로 스타일을 직접 만지는 이유 — 프레임마다 리렌더하면
   * 표 두 개와 마크다운이 통째로 다시 그려진다
   */
  const onScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    requestAnimationFrame(() => {
      if (bannerRef.current) {
        bannerRef.current.style.transform = `translateY(${-scrollTop}px)`;
      }
    });
  }, []);
  const { data, error, reload } = useApi<BacklogDetail>(`/api/backlog/${entryId}`);
  // 선택지는 편집 폼 전부가 공유한다 (기기·에뮬·계정·플랫폼·구독·사전)
  const options = useApi<OptionsResponse>("/api/me/options");
  const router = useRouter();

  /**
   * 열려 있는 다이얼로그. 하나만 열리므로 배열이 아니라 단일 상태로 둔다.
   * 회차·취득은 수정 대상을 같이 들고 다닌다 (null이면 새로 추가)
   */
  const [dialog, setDialog] = useState<Dialog>(null);

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

  const { resolved, master, overrides, personalRecord } = data;
  const totalPlaytime = formatHours(personalRecord.playTimeHours);

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
          {/* 헤더 — 커버 왼쪽, 글자는 커버 아래쪽 기준으로 정렬 */}
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
                onClick={() => setDialog({ kind: "cover" })}
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

          {/* 요약 스탯 한 줄 */}
          {/*
            divide-x/divide-y는 "첫 항목만 빼고 전부"라 2열↔4열 전환에서 선이 어긋난다
            (2열일 때 두 번째 칸 위에도 가로선이 그어졌다). 몇 번째 칸인지로 직접 긋는다
          */}
          <div className="mb-10 grid grid-cols-2 border-t-line border-b-line py-6 md:grid-cols-4 [&>*]:border-white/15 [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t md:[&>*]:border-l md:[&>*:first-child]:border-l-0 md:[&>*:nth-child(n+3)]:border-t-0">
            <Stat
              label="Total Playtime"
              value={totalPlaytime ?? "—"}
              unit={totalPlaytime == null ? undefined : "h"}
            />
            <Stat label="Playthroughs" value={data.playthroughs.length} />
            <Stat
              label="My Rating"
              value={
                personalRecord.rating == null ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <StarIcon className="h-[0.8em] w-[0.8em] -translate-y-[1px] text-white/35" />
                    {formatRating(personalRecord.rating)}
                  </span>
                )
              }
            />
            <Stat label="Release Date" value={resolved.releasedOn ?? "—"} />
          </div>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
            {/*
              ## 폰에서는 순서가 뒤집힌다 (order)
              좁은 화면에서 About·회차·구매·메모를 다 지나야 개발사/플랫폼이 나오면
              "이 게임이 뭔지"를 보려고 한참 스크롤해야 한다. 게임 정보를 위로 올린다.
              **삭제만 예외로 맨 아래** — 위에 두면 실수로 누른다
            */}
            {/* 좌 — About · 회차 · 구매 · 메모 (설계서 §2.9 순서) */}
            <div className="order-2 flex flex-col gap-10 lg:order-none lg:col-span-2">
              <section>
                <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-white/90 sm:text-lg">
                  <SectionIcon name="about" />
                  About
                </h3>
                <div className="flex flex-col gap-5 rounded-lg border border-white/10 bg-white/5 p-6">
                  <SummaryBlock
                    entryId={Number(entryId)}
                    summary={master.summary}
                    summaryKo={master.summaryKo}
                    onTranslated={() => reload()}
                  />

                  {/* 스토리라인은 요약과 별개 필드다 — 없는 게임이 많아 자리를 항상 두되 비워둔다 */}
                  <div className="border-t border-white/5 pt-5">
                    <h4 className="mb-2 text-xs tracking-wider text-white/40 uppercase">Storyline</h4>
                    <p className="text-sm leading-relaxed font-light text-white/65">
                      {master.storyline ?? <span className="text-white/25">등록된 스토리라인이 없습니다.</span>}
                    </p>
                  </div>
                </div>
              </section>

              <Timeline detail={data} />

              <section>
                <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
                  <span className="flex items-center gap-2">
                    <SectionIcon name="play" />
                    Playthrough Records
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="num text-xs text-white/30">{data.playthroughs.length} runs</span>
                    <Button onClick={() => setDialog({ kind: "playthrough", run: null })}>
                      회차 추가
                    </Button>
                  </span>
                </h3>
                {/*
                  **Device 칸을 뺐다** (2026-08-28). 다섯 칸이 들어가니 노트북 폭에서
                  `2024-03-13 ~ 2025-07-21`이 두 줄로 쪼개지고 `1회차`까지 접혔다.
                  기기 이름은 계정 라벨에 이미 붙어 있어서(`Beene (한성컴퓨터 PC)`)
                  같은 정보를 두 칸이 나눠 갖고 있던 셈이다 — 합치면 기간이 한 줄에 들어간다
                */}
                <DataTable
                  headers={["Run", "Period", "Status", "Account", "Label"]}
                  empty={data.playthroughs.length === 0 ? "등록된 회차 기록이 없습니다" : undefined}
                >
                  {data.playthroughs.map((run) => (
                    <tr
                      key={run.playthroughId}
                      onClick={() => setDialog({ kind: "playthrough", run })}
                      className="cursor-pointer transition-colors hover:bg-white/[0.05]"
                    >
                      <td className="num px-4 py-3 whitespace-nowrap text-white/90">
                        {run.sequenceNo}회차
                      </td>
                      {/* 회차에서 제일 먼저 읽는 값이라 다른 칸보다 진하게. 줄바꿈을 막는다 */}
                      <td className="num w-[38%] px-4 py-3 font-medium whitespace-nowrap text-white/95">
                        {run.startedOn} ~ {run.finishedOn ?? ""}
                      </td>
                      <td
                        className={`px-4 py-3 whitespace-nowrap ${PLAYTHROUGH_TONE[run.status] ?? "text-white/60"}`}
                      >
                        {PLAYTHROUGH_STATUS_LABEL[run.status]}
                      </td>
                      <td className="px-4 py-3 text-white/60">{accountOf(run)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-white/50">
                        {run.label ?? "—"}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </section>

              <section>
                <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
                  <span className="flex items-center gap-2">
                    <SectionIcon name="purchase" />
                    Purchase History
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="num text-xs text-white/30">{data.acquisitions.length} records</span>
                    <Button onClick={() => setDialog({ kind: "acquisition", item: null })}>
                      기록 추가
                    </Button>
                  </span>
                </h3>
                <DataTable
                  headers={["Method", "Price", "Date", "Store", "Label"]}
                  empty={data.acquisitions.length === 0 ? "등록된 취득 기록이 없습니다" : undefined}
                >
                  {data.acquisitions.map((item) => (
                    <tr
                      key={item.acquisitionId}
                      onClick={() => setDialog({ kind: "acquisition", item })}
                      className="cursor-pointer transition-colors hover:bg-white/[0.05]"
                    >
                      <td className="px-4 py-3 text-white/90">
                        {ACQUISITION_METHOD_LABEL[item.method]}
                      </td>
                      <td className="num px-4 py-3 text-white/60">
                        <MoneyText money={item.price} />
                      </td>
                      <td className="num px-4 py-3 text-white/60">{item.acquiredOn ?? "—"}</td>
                      <td className="px-4 py-3 text-white/60">
                        {item.subscription?.serviceName ?? item.platform?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/50">{item.label ?? "—"}</td>
                    </tr>
                  ))}
                </DataTable>
              </section>

              {/* 내 기록은 제일 아래 — 읽는 순서상 게임 정보를 다 본 뒤에 온다 */}
              <section>
                <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
                  <span className="flex items-center gap-2">
                    <SectionIcon name="note" />
                    My Notes
                  </span>
                  {/*
                    이 버튼만 오버라이드 색을 쓴다 (사용자 결정 2026-08-28) — 아래 내용이
                    IGDB가 아니라 **내가 쓴 것**이라는 표시다. 호버 연출은 그대로 둔다
                  */}
                  <Button
                    className="!text-teal-200/70"
                    onClick={() => setDialog({ kind: "record" })}
                  >
                    내 기록 수정
                  </Button>
                </h3>
                {personalRecord.memo ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                    {/*
                      메모는 마크다운 원문이다 (`# 📝 총평` 헤더 + 중첩 불릿).
                      스타일을 요소별로 직접 주는 이유 — 리셋이 h/ul 기본값을 다 지웠다
                    */}
                    <div className="markdown text-sm leading-relaxed font-light text-white/80">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{personalRecord.memo}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/30">
                    작성된 메모가 없습니다.
                  </div>
                )}
              </section>

              {/* 스크린샷은 메모 아래 — 글을 다 읽은 뒤에 오는 순서다 (v1.0 7단계) */}
              <ScreenshotSection entryId={Number(entryId)} />
            </div>

            {/* 우 — 게임 정보 · 사람들 클리어 시간 · 태그 · 액션 */}
            <div className="order-1 flex flex-col gap-8 lg:order-none">
              <div className="rounded-lg border border-white/10 bg-black/20 p-6">
                <h4 className="mb-4 flex items-center justify-between text-xs tracking-wider text-white/40 uppercase">
                  <span className="flex items-center gap-2">
                    <SectionIcon name="info" className="h-3.5 w-3.5" />
                    Game Information
                  </span>
                  <EditButton onClick={() => setDialog({ kind: "overrides" })} label="게임 정보 덮어쓰기" />
                </h4>
                <div className="space-y-3 text-sm">
                  <InfoRow
                    label="Developer"
                    value={formatList(resolved.developers)}
                    overridden={overrides.developers.length > 0}
                    first
                  />
                  <InfoRow
                    label="Publisher"
                    value={formatList(resolved.publishers)}
                    overridden={overrides.publishers.length > 0}
                  />
                  <InfoRow
                    label="Release Date"
                    value={<span className="num">{resolved.releasedOn ?? "—"}</span>}
                    overridden={overrides.releasedOn != null}
                  />
                  {/*
                    개인 장르가 하나라도 있으면 마스터를 덮은 것이다 (§6.7).
                    resolved.genres는 폴백이 끝난 값이라 여기서는 판단이 안 된다 —
                    덮었는지는 원본(data.genres)이 비었는지로만 알 수 있다
                  */}
                  <InfoRow
                    label="Genres"
                    value={formatList(resolved.genres)}
                    overridden={data.genres.length > 0}
                  />
                  {master.releasePlatforms.length > 0 && (
                    <InfoRow label="Platforms" value={formatList(master.releasePlatforms)} />
                  )}
                </div>
              </div>

              {/*
                남들이 얼마나 걸렸나 — 내 기록이 아니라 IGDB 집계다.
                Game Information에 섞으면 "내 출시일 / 남의 시간"이 한 표에 붙어 뜻이 흐려진다
              */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-6">
                <h4 className="mb-1 flex items-center gap-2 text-xs tracking-wider text-white/40 uppercase">
                  <SectionIcon name="clock" className="h-3.5 w-3.5" />
                  How Long To Beat
                </h4>
                <p className="mb-4 text-[11px] text-white/25">
                  다른 이용자의 평균 클리어 시간
                  {master.timeToBeatSamples ? ` · 표본 ${master.timeToBeatSamples}건` : ""}
                </p>
                <div className="space-y-3 text-sm">
                  <InfoRow
                    label="Main Story"
                    value={<span className="num">{hours(master.mainStoryHours)}</span>}
                    first
                  />
                  <InfoRow
                    label="Main + Extra"
                    value={<span className="num">{hours(master.mainExtraHours)}</span>}
                  />
                  <InfoRow
                    label="Completionist"
                    value={<span className="num">{hours(master.completionistHours)}</span>}
                  />
                  {master.igdbRating != null && (
                    <InfoRow
                      label="IGDB Rating"
                      value={
                        <span className="inline-flex items-center gap-1">
                          <StarIcon className="h-3.5 w-3.5 -translate-y-[0.5px] text-white/35" />
                          <span className="num">
                            {master.igdbRating.toFixed(1)}
                            {master.igdbRatingCount ? ` (${master.igdbRatingCount})` : ""}
                          </span>
                        </span>
                      }
                    />
                  )}
                </div>
              </div>

              {/*
                개인 장르는 따로 안 보여준다 — 마스터를 *덮어쓰는* 값이라
                헤더의 resolved.genres가 이미 그 결과다 (§6.7)
              */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-6">
                <h4 className="mb-4 flex items-center justify-between text-xs tracking-wider text-white/40 uppercase">
                  <span className="flex items-center gap-2">
                    <SectionIcon name="tag" className="h-3.5 w-3.5" />
                    Tag
                  </span>
                  <EditButton onClick={() => setDialog({ kind: "tag" })} label="태그 수정" />
                </h4>
                <div className="flex flex-wrap gap-2">
                  {data.tag ? (
                    <Chip label={data.tag} rounded />
                  ) : (
                    <span className="text-xs text-white/25">지정된 태그 없음</span>
                  )}
                </div>
              </div>

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

      {dialog?.kind === "record" && (
        <PersonalRecordDialog
          entryId={data.entryId}
          record={personalRecord}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      {dialog?.kind === "overrides" && (
        <OverridesDialog detail={data} onClose={() => setDialog(null)} onSaved={refresh} />
      )}

      {dialog?.kind === "tag" && (
        <TagGenreDialog
          entryId={data.entryId}
          kind="tag"
          value={data.tag}
          dictionary={options.data?.tagDictionary ?? []}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      {dialog?.kind === "playthrough" && (
        <PlaythroughDialog
          entryId={data.entryId}
          run={dialog.run}
          options={options.data}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      {dialog?.kind === "acquisition" && (
        <AcquisitionDialog
          entryId={data.entryId}
          acquisition={dialog.item}
          options={options.data}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      {dialog?.kind === "cover" && (
        <CoverDialog
          entryId={data.entryId}
          cover={resolved.cover}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="항목 삭제"
          message={
            <>
              <b className="text-white">{resolved.name}</b>을(를) 라이브러리에서 삭제하시겠습니까?
              <br />
              같은 게임을 다시 담으시면 <b className="text-white">복구하실 수 있으며</b>, 기록도 함께 돌아옵니다.
            </>
          }
          onConfirm={async () => {
            await api.del(`/api/backlog/${data.entryId}`);
            /*
             * 사이드바는 (app)/library/layout.tsx에 있어 목록↔상세를 오갈 때
             * **언마운트되지 않는다.** 무효화가 없으면 방금 지운 게임이 왼쪽에 그대로 남아
             * 누르면 에러 상세로 들어간다
             */
            invalidateQueries();
            router.push("/library");
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

/** 시간 값 — null이면 대시 */
function hours(value: number | null): string {
  return value == null ? "—" : `${value}h`;
}

/** 항목 삭제. 데스크탑은 우측 열 끝, 폰은 화면 맨 아래에 같은 버튼이 놓인다 */
function DeleteEntryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded py-2.5 text-sm text-red-400 transition-all hover:bg-white/5"
    >
      Delete Entry
    </button>
  );
}

function Stat({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    /*
     * 폰에서는 칸이 반으로 줄어 날짜(2016-02-26)가 세 줄로 깨진다 — 글자와 좌우 여백을 줄인다.
     *
     * py는 **두 줄로 접힐 때만** 필요하다. 바깥 테두리는 컨테이너의 py-6만큼 떨어져 있는데
     * 줄 사이 가로선만 위 숫자에 딱 붙어 어색했다. 한 줄이 되는 md부터는 다시 0
     */
    <div className="flex flex-col justify-center px-3 py-2.5 sm:px-6 md:py-0">
      <div className="mb-1 text-[10px] tracking-wider text-white/40 uppercase sm:text-xs">{label}</div>
      <div className="num text-lg font-normal sm:text-2xl">
        {value}
        {unit && <span className="ml-0.5 text-sm text-white/60 sm:text-lg">{unit}</span>}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <main className="page-x page-top h-full overflow-y-auto">
      <div className="mb-10 flex gap-8">
        <Skeleton className="aspect-[3/4] w-48 shrink-0" />
        <div className="flex-1 pt-16">
          <Skeleton className="mb-3 h-6 w-40" />
          <Skeleton className="mb-3 h-12 w-2/3" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      <Skeleton className="mb-10 h-24 w-full" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </main>
  );
}


/**
 * 계정 + 기기.
 *
 * 예전엔 칸을 둘로 나눴는데 노트북 폭에서 기간이 두 줄로 쪼개졌다. 한 칸에 합치면
 * **`Beene (한성컴퓨터 PC)`**로 같은 정보가 더 짧게 들어간다 — 계정만 있고 기기가 없으면
 * 괄호를 아예 안 붙인다
 */
function accountOf(run: {
  platformAccount?: { label: string } | null;
  device?: { name: string } | null;
  emulator?: { name: string } | null;
}) {
  const account = run.platformAccount?.label;
  const machine = run.emulator?.name ?? run.device?.name;
  if (account && machine) return `${account} (${machine})`;
  return account ?? machine ?? "—";
}

/**
 * 소개문 — **원문과 번역을 함께 들고 토글한다** (2026-08-28).
 *
 * ## 원문을 지우지 않는다
 *
 * 번역이 이상할 때 원문을 볼 수 있어야 하고, 다시 번역하려면 원문이 있어야 한다.
 * 그래서 서버가 둘 다 내려주고 여기서 고른다 — 번역이 있으면 한국어가 기본이다.
 *
 * ## ⚠️ 번역은 돈이 드는 유일한 버튼이다
 *
 * IGDB 검색이나 스토리지 업로드는 한도를 넘으면 거절당하고 끝이지만, 번역은 넘으면
 * **요금이 청구된다.** 그래서 누르기 전에 몇 자인지 보여주고, 한도에 걸리면(429)
 * 서버가 준 문장을 그대로 띄운다 — "지금까지 몇 자 썼다"가 그 안에 들어 있다
 */
function SummaryBlock({
  entryId,
  summary,
  summaryKo,
  onTranslated,
}: {
  entryId: number;
  summary: string | null;
  summaryKo: string | null;
  onTranslated: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!summary) {
    return <p className="text-sm text-white/25">등록된 요약이 없습니다.</p>;
  }

  const translate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/backlog/${entryId}/translate`, {});
      onTranslated();
    } catch (caught) {
      setError(errorMessage(caught, "번역하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const showing = summaryKo && !showOriginal ? summaryKo : summary;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed font-light text-white/75">{showing}</p>

      <div className="flex flex-wrap items-center gap-3">
        {summaryKo ? (
          /* 번역이 있으면 토글만. 다시 번역하려면 원문을 보고 [다시 번역]을 누른다 */
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="text-[11px] tracking-wider text-white/35 uppercase transition-colors hover:text-white"
          >
            {showOriginal ? "번역 보기" : "원문 보기"}
          </button>
        ) : null}

        {(!summaryKo || showOriginal) && (
          <button
            onClick={translate}
            disabled={busy}
            className="text-[11px] tracking-wider text-teal-200/70 uppercase transition-colors hover:text-teal-100 disabled:text-white/20"
          >
            {busy ? "번역 중…" : summaryKo ? "다시 번역" : "번역"}
            {/* ⚠️ 몇 자인지 미리 보여준다 — 누르는 순간 그만큼이 이번 달 한도에서 빠진다 */}
            <span className="ml-1.5 normal-case opacity-60">
              ({summary.length.toLocaleString()}자)
            </span>
          </button>
        )}

        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    </div>
  );
}
