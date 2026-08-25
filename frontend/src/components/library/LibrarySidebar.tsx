"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton } from "@/components/ui/Skeleton";
import { coverSrc } from "@/lib/cover";
import type { BacklogCard, BacklogName, PageResponse } from "@/lib/types";

/**
 * 전체 게임 목록 — 이름순, 페이징 없음. 필터는 여기 없다 (툴바의 필터 박스가 전부 맡는다).
 *
 * 이름은 전용 엔드포인트(`/api/backlog/names`)로, 썸네일은 목록 API로 따로 받는다.
 * names에 커버를 실으면 이 가벼운 조회에 조인이 붙는데, 썸네일은 **있으면 좋은 것**이라
 * 늦게 도착해도 이름 목록이 먼저 뜨는 편이 낫다
 */
export default function LibrarySidebar() {
  const names = useApi<BacklogName[]>("/api/backlog/names");
  const covers = useApi<PageResponse<BacklogCard>>("/api/backlog?size=100&sort=name");
  const params = useParams<{ entryId?: string }>();
  const currentId = params?.entryId;

  const coverById = useMemo(() => {
    const map = new Map<number, string | null>();
    covers.data?.items.forEach((card) =>
      map.set(card.entryId, coverSrc(card.coverUrl, card.coverImageId, "t_thumb")),
    );
    return map;
  }, [covers.data]);

  return (
    <aside className="glass-panel mt-20 mr-2 mb-4 ml-6 flex w-64 shrink-0 flex-col overflow-hidden rounded-xl xl:w-72">
      <div className="shrink-0 border-b border-white/10 p-5">
        <h3 className="text-[10px] tracking-widest text-white/40 uppercase">
          All Games {names.data && <span className="num text-white/25">({names.data.length})</span>}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {names.loading ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 12 }, (_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {names.data?.map((entry) => {
              const active = String(entry.entryId) === currentId;
              const thumb = coverById.get(entry.entryId);
              return (
                <li key={entry.entryId}>
                  <Link
                    href={`/library/${entry.entryId}`}
                    className={`flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                    title={entry.displayName}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="h-5 w-5 shrink-0 rounded-[3px] object-cover"
                      />
                    ) : (
                      <span className="image-placeholder h-5 w-5 shrink-0 rounded-[3px]" />
                    )}
                    <span className="truncate">{entry.displayName}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <Link
          href="/add"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-white/15 py-2.5 text-sm font-medium transition-all hover:bg-white hover:text-black"
        >
          Add Game <span className="text-lg leading-none">+</span>
        </Link>
      </div>
    </aside>
  );
}
