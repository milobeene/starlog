"use client";

import Unit from "@/components/ui/Unit";
import Chip from "@/components/ui/Chip";
import StarIcon from "@/components/ui/StarIcon";
import SectionIcon from "@/components/ui/SectionIcon";
import InfoRow from "@/components/library/InfoRow";
import { EditButton } from "@/components/ui/Field";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { formatList } from "@/lib/labels";
import type { BacklogDetail } from "@/lib/types";

/** 상세 우측 열의 카드들 — 게임 정보 · 클리어 시간 · 태그 */
export function GameInformationCard({
  data,
  onOpen,
}: {
  data: BacklogDetail;
  onOpen: (dialog: DetailDialog) => void;
}) {
  const { resolved, master, overrides } = data;

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-6">
      <h4 className="mb-4 flex items-center justify-between text-xs tracking-wider text-white/40 uppercase">
        <span className="flex items-center gap-2">
          <SectionIcon name="info" className="h-3.5 w-3.5" />
          Game Information
        </span>
        <EditButton onClick={() => onOpen({ kind: "overrides" })} label="게임 정보 덮어쓰기" />
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
  );
}

/**
 * 남들이 얼마나 걸렸나 — 내 기록이 아니라 IGDB 집계다.
 * Game Information에 섞으면 "내 출시일 / 남의 시간"이 한 표에 붙어 뜻이 흐려진다
 */
export function HowLongToBeatCard({ master }: { master: BacklogDetail["master"] }) {
  return (
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
  );
}

/**
 * 개인 장르는 따로 안 보여준다 — 마스터를 *덮어쓰는* 값이라
 * 헤더의 resolved.genres가 이미 그 결과다 (§6.7)
 */
export function TagCard({
  tag,
  onOpen,
}: {
  tag: BacklogDetail["tag"];
  onOpen: (dialog: DetailDialog) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-6">
      <h4 className="mb-4 flex items-center justify-between text-xs tracking-wider text-white/40 uppercase">
        <span className="flex items-center gap-2">
          <SectionIcon name="tag" className="h-3.5 w-3.5" />
          Tag
        </span>
        <EditButton onClick={() => onOpen({ kind: "tag" })} label="태그 수정" />
      </h4>
      <div className="flex flex-wrap gap-2">
        {tag ? (
          <Chip label={tag} rounded />
        ) : (
          <span className="text-xs text-white/25">지정된 태그 없음</span>
        )}
      </div>
    </div>
  );
}

/** 시간 값 — null이면 대시 */
/** 시간 표시. **단위 `h`는 본문 폰트로 뺀다** — 모노에서는 숫자보다 커 보인다 */
function hours(value: number | null) {
  if (value == null) return "—";
  return (
    <>
      {value}
      <Unit>h</Unit>
    </>
  );
}
