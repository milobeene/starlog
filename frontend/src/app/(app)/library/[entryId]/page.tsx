"use client";

import Link from "next/link";
import { use, useCallback, useRef, useState } from "react";
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
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Button, EditButton } from "@/components/ui/Field";
import { api } from "@/lib/api";
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

export default function BacklogDetailPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = use(params);
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
  const { data, error, loading, reload } = useApi<BacklogDetail>(`/api/backlog/${entryId}`);
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
  if (loading || !data) return <DetailSkeleton />;

  const { resolved, master, overrides, personalRecord } = data;
  const totalPlaytime = personalRecord.playTimeHours;

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
        <div className="relative z-20 flex shrink-0 items-center gap-4 px-8 pt-20 pb-2">
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

        <div className="relative px-10 pt-4">
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
                className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white/80 opacity-0 backdrop-blur-sm transition-all group-hover/cover:opacity-100 hover:bg-white hover:text-black"
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

              <div className="flex flex-wrap items-center gap-3">
                {personalRecord.rating != null && (
                  <span className="flex items-center gap-1.5 text-lg font-medium text-yellow-500 drop-shadow-sm">
                    <StarIcon className="h-[1.05em] w-[1.05em] -translate-y-[1px]" />
                    <span className="num">{formatRating(personalRecord.rating)}</span>
                  </span>
                )}
                {/* 표시값 장르다 — 개인 장르가 있으면 그것이 마스터를 덮은 결과 (§6.7) */}
                {resolved.genres.map((genre) => (
                  <Chip key={genre} label={genre} rounded />
                ))}
              </div>
            </div>
          </div>

          {/* 요약 스탯 한 줄 */}
          <div className="mb-10 grid grid-cols-2 divide-x divide-y divide-white/15 border-t-line border-b-line py-6 md:grid-cols-4 md:divide-y-0">
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
            {/* 좌 — About · 회차 · 구매 · 메모 (설계서 §2.9 순서) */}
            <div className="flex flex-col gap-10 lg:col-span-2">
              <section>
                <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-white/90">
                  <SectionIcon name="about" />
                  About
                </h3>
                <div className="flex flex-col gap-5 rounded-lg border border-white/10 bg-white/5 p-6">
                  <p className="text-sm leading-relaxed font-light text-white/75">
                    {master.summary ?? <span className="text-white/25">등록된 요약이 없습니다.</span>}
                  </p>

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
                <h3 className="mb-4 flex items-end justify-between text-lg font-medium text-white/90">
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
                <DataTable
                  headers={["Run", "Period", "Status", "Device", "Account", "Label"]}
                  empty={data.playthroughs.length === 0 ? "등록된 회차 기록이 없습니다" : undefined}
                >
                  {data.playthroughs.map((run) => (
                    <tr
                      key={run.playthroughId}
                      onClick={() => setDialog({ kind: "playthrough", run })}
                      className="cursor-pointer transition-colors hover:bg-white/[0.05]"
                    >
                      <td className="num px-4 py-3 text-white/90">{run.sequenceNo}회차</td>
                      {/* 회차에서 제일 먼저 읽는 값이라 다른 칸보다 진하게 */}
                      <td className="num px-4 py-3 font-medium text-white/95">
                        {run.startedOn} ~ {run.finishedOn ?? ""}
                      </td>
                      <td className={`px-4 py-3 ${PLAYTHROUGH_TONE[run.status] ?? "text-white/60"}`}>
                        {PLAYTHROUGH_STATUS_LABEL[run.status]}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {run.emulator?.name ?? run.device?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/60">{run.platformAccount?.label ?? "—"}</td>
                      <td className="px-4 py-3 text-white/50">{run.label ?? "—"}</td>
                    </tr>
                  ))}
                </DataTable>
              </section>

              <section>
                <h3 className="mb-4 flex items-end justify-between text-lg font-medium text-white/90">
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
                <h3 className="mb-4 flex items-end justify-between text-lg font-medium text-white/90">
                  <span className="flex items-center gap-2">
                    <SectionIcon name="note" />
                    My Notes
                  </span>
                  <Button onClick={() => setDialog({ kind: "record" })}>내 기록 수정</Button>
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
            </div>

            {/* 우 — 게임 정보 · 사람들 클리어 시간 · 태그 · 액션 */}
            <div className="flex flex-col gap-8">
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
              <div className="mt-2">
                <button
                  onClick={() => setDialog({ kind: "delete" })}
                  className="w-full rounded py-2.5 text-sm text-red-400 transition-all hover:bg-white/5"
                >
                  Delete Entry
                </button>
              </div>
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

function Stat({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="flex flex-col justify-center px-6">
      <div className="mb-1 text-xs tracking-wider text-white/40 uppercase">{label}</div>
      <div className="num text-2xl font-normal">
        {value}
        {unit && <span className="ml-0.5 text-lg text-white/60">{unit}</span>}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <main className="h-full overflow-y-auto px-10 pt-24">
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
