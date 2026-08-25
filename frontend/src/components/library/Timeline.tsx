"use client";

import SectionIcon from "@/components/ui/SectionIcon";
import type { BacklogDetail } from "@/lib/types";

type Point = { key: string; label: string; date: string };

/**
 * 상세 타임라인 (API 설계서 §1.3). **서버는 원자료만 주고 계산은 프론트가 한다.**
 *
 *   담음(createdAt) · 취득(min acquiredOn) · 첫 플레이(min startedOn)
 *   · 첫 완주(min finishedOn where COMPLETED) · 마지막 플레이(max coalesce(finishedOn, startedOn))
 *
 * **순서는 고정이 아니라 날짜순이다** — 사둔 게임을 나중에 담으면 취득이 앞에 온다.
 * 값이 없는 점은 아예 안 그린다 (실데이터는 acquiredOn이 전부 null이라 4점이 기본이다)
 */
export default function Timeline({ detail }: { detail: BacklogDetail }) {
  const points = buildPoints(detail);

  return (
    <section>
      <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-white/90">
        <SectionIcon name="timeline" />
        Timeline
      </h3>

      {/* 점이 하나뿐이면 선을 그릴 게 없다. 섹션은 남기고 안내만 바꾼다 */}
      {points.length < 2 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-6 py-7 text-center text-xs text-white/30">
          표시할 기록이 아직 없습니다. 회차나 취득을 등록하시면 순서대로 표시됩니다.
        </div>
      ) : (
      <div className="rounded-lg border border-white/10 bg-white/5 px-6 py-7">
        <ol className="relative flex items-start justify-between gap-2">
          {/*
            선을 첫 점과 끝 점의 중심에 맞춘다 — inset을 안 주면 양 끝이 점 밖으로 삐져나온다.
            점이 n개면 좌우로 각각 (1/n)/2 만큼 들어와야 중심에 닿는다
          */}
          <span
            aria-hidden
            className="absolute top-[5px] h-px bg-white/15"
            style={{
              left: `${50 / points.length}%`,
              right: `${50 / points.length}%`,
            }}
          />

          {points.map((point, index) => (
            <li
              key={point.key}
              className="relative flex flex-1 flex-col items-center gap-2 text-center"
            >
              <span
                className={`h-[11px] w-[11px] rounded-full border-2 ${
                  index === points.length - 1
                    ? "border-white bg-white"
                    : "border-white/50 bg-black/60"
                }`}
              />
              <span className="text-[10px] tracking-wider text-white/40 uppercase">
                {point.label}
              </span>
              <span className="num text-xs text-white/75">{point.date}</span>
            </li>
          ))}
        </ol>
      </div>
      )}
    </section>
  );
}

function buildPoints(detail: BacklogDetail): Point[] {
  const raw: (Point | null)[] = [
    { key: "added", label: "Added", date: detail.createdAt.slice(0, 10) },
    point("acquired", "Acquired", min(detail.acquisitions.map((item) => item.acquiredOn))),
    point("first", "First Play", min(detail.playthroughs.map((run) => run.startedOn))),
    point(
      "cleared",
      "First Clear",
      min(
        detail.playthroughs
          .filter((run) => run.status === "COMPLETED")
          .map((run) => run.finishedOn),
      ),
    ),
    point(
      "last",
      "Last Play",
      max(detail.playthroughs.map((run) => run.finishedOn ?? run.startedOn)),
    ),
  ];

  const points = raw.filter((item): item is Point => item !== null);

  // 같은 날짜에 여러 점이 겹치면 뒤엣것만 남긴다 — 첫 플레이와 마지막 플레이가
  // 같은 날인 1회차 게임에서 점 두 개가 포개진다
  const byDate = new Map<string, Point>();
  points.forEach((item) => byDate.set(item.date, item));

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function point(key: string, label: string, date: string | null): Point | null {
  return date ? { key, label, date } : null;
}

function min(dates: (string | null)[]): string | null {
  const valid = dates.filter((date): date is string => Boolean(date));
  return valid.length > 0 ? valid.reduce((a, b) => (a < b ? a : b)) : null;
}

function max(dates: (string | null)[]): string | null {
  const valid = dates.filter((date): date is string => Boolean(date));
  return valid.length > 0 ? valid.reduce((a, b) => (a > b ? a : b)) : null;
}
