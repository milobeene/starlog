"use client";

import { useEffect, useState } from "react";
import GameCard from "@/components/ui/GameCard";
import EmptyState from "@/components/ui/EmptyState";
import { CardGridSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { coverSrc } from "@/lib/cover";
import { api } from "@/lib/api";
import { GAME_GRID } from "@/lib/useGridColumns";
import type { BacklogCard, FacetsResponse, PageResponse } from "@/lib/types";

type Folder = { key: string; label: string; count: number; cards: BacklogCard[] };

/**
 * 태그로 묶어 보는 뷰. **폴더 박스를 고르면 그 안만 본다** (아코디언 아님).
 *
 * 카드 DTO에 태그가 없어서(§6.7 — 태그는 카드에 안 뿌린다) 태그별로 한 번씩 부른다.
 * 태그 수만큼 요청이 나가지만 개인 사전이라 몇 개 안 되고, 뷰를 열 때만 돈다.
 *
 * **"지정된 태그 없음" 폴더가 반드시 필요하다** — 실데이터는 태그 안 붙은 항목이 더 많아서
 * 이게 없으면 게임이 사라져 보인다. 대응 필터가 없어 전체에서 빼는 방식으로 만든다
 */
export default function FolderView({ facets }: { facets: FacetsResponse }) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [all, ...tagged] = await Promise.all([
        api.get<PageResponse<BacklogCard>>("/api/backlog?size=100&sort=name"),
        ...facets.tags.map((tag) =>
          api.get<PageResponse<BacklogCard>>(`/api/backlog?tagId=${tag.id}&size=100&sort=name`),
        ),
      ]);
      if (cancelled) return;

      const taggedIds = new Set(tagged.flatMap((page) => page.items.map((card) => card.entryId)));
      const untagged = all.items.filter((card) => !taggedIds.has(card.entryId));

      const next: Folder[] = facets.tags.map((tag, index) => ({
        key: `tag-${tag.id}`,
        label: tag.name,
        count: tagged[index].totalElements,
        cards: tagged[index].items,
      }));

      if (untagged.length > 0) {
        next.push({ key: "untagged", label: "Untagged", count: untagged.length, cards: untagged });
      }

      setFolders(next);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [facets]);

  if (!folders) {
    return (
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="aspect-square w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (folders.length === 0) {
    return <EmptyState title="폴더로 묶을 태그가 없습니다" hint="게임 상세에서 태그를 지정하시면 이곳에 표시됩니다" />;
  }

  const open = folders.find((folder) => folder.key === openKey);

  // 폴더를 열면 그 안만 본다
  if (open) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setOpenKey(null)}
            className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            All folders
          </button>
          <span className="text-white/20">/</span>
          <h3 className="text-lg font-medium text-white/90">{open.label}</h3>
          <span className="num text-sm text-white/40">({open.count})</span>
        </div>

        {open.cards.length === 0 ? (
          <CardGridSkeleton count={5} />
        ) : (
          <div className={GAME_GRID}>
            {open.cards.map((card) => (
              <GameCard key={card.entryId} card={card} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {folders.map((folder) => (
        <FolderBox key={folder.key} folder={folder} onOpen={() => setOpenKey(folder.key)} />
      ))}
    </div>
  );
}

/**
 * 폴더 박스 — 대표 커버 **한 장**을 꽉 채우고 블러로 뭉갠다.
 *
 * 여러 장을 겹쳐 펼치는 건 정사각 박스에서 산수가 안 맞았다: 커버(3:4)가 높이를
 * 다 채우면 폭의 64%를 먹어서 3장이면 이미 넘치고, 줄이면 무슨 게임인지 안 보인다.
 * 한 장을 확대해 블러하면 **그 폴더의 색**만 남아 라벨이 주인공이 된다.
 *
 * 커버가 하나도 없으면(Untagged 등) 무채색 그래디언트로 떨어진다
 */
function FolderBox({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  const backdrop = folder.cards
    .map((card) => coverSrc(card.coverUrl, card.coverImageId, "t_cover_big"))
    .find((src): src is string => src !== null);

  return (
    <button
      onClick={onOpen}
      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-neutral-900"
    >
      {backdrop ? (
        <div
          aria-hidden
          className="absolute inset-0 scale-125 bg-cover bg-center opacity-80 blur-xl transition-transform duration-700 ease-out group-hover:scale-[1.45]"
          style={{ backgroundImage: `url(${backdrop})` }}
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-neutral-600/50 via-neutral-800/60 to-neutral-900"
        />
      )}

      {/* 라벨이 가운데 오므로 전체를 고르게 덮는다 */}
      <div
        aria-hidden
        className="absolute inset-0 bg-black/45 transition-colors duration-300 group-hover:bg-black/30"
      />

      {/* 이름이 주인공 — 박스를 가득 채우고 길면 줄바꿈해서 줄인다 */}
      <div className="relative z-10 flex w-full flex-col items-center gap-1 px-3 text-center transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
        <div className="line-clamp-3 w-full text-xl leading-tight font-extrabold tracking-wide text-white uppercase text-balance">
          {folder.label}
        </div>
        <div className="num text-sm font-medium text-white/60">({folder.count})</div>
      </div>
    </button>
  );
}
