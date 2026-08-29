"use client";

import { fluidBackground, toneOf } from "@/lib/tagColors";
import { useEffect, useMemo, useState } from "react";
import GameCard from "@/components/ui/GameCard";
import EmptyState from "@/components/ui/EmptyState";
import { CardGridSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { coverSrc } from "@/lib/cover";
import { api } from "@/lib/api";
import { invalidateQueries, useApi } from "@/lib/useApi";
import { rememberLibrary, takeLibrary } from "@/lib/libraryState";
import { GAME_GRID } from "@/lib/useGridColumns";
import type { BacklogCard, FacetsResponse, PageResponse } from "@/lib/types";

type Folder = {
  key: string;
  label: string;
  count: number;
  cards: BacklogCard[];
  /** 태그 색(팔레트 이름). '태그 없음'과 안 고른 태그는 null */
  color: string | null;
};

/**
 * 태그로 묶어 보는 뷰. **폴더 박스를 고르면 그 안만 본다** (아코디언 아님).
 *
 * 태그가 항목당 하나가 되면서(§6.7 v1.6) 카드가 태그를 싣고 온다 —
 * 예전에는 태그마다 목록 API를 한 번씩 때렸다(1+N). 이제 한 방으로 받아 클라에서 묶는다.
 *
 * **"지정된 태그 없음" 폴더가 반드시 필요하다** — 실데이터는 태그 안 붙은 항목이 더 많아서
 * 이게 없으면 게임이 사라져 보인다
 */
export default function FolderView({
  facets,
  keyword,
  sort,
  onMoved,
}: {
  facets: FacetsResponse;
  /**
   * 제목 검색어와 정렬 — **폴더 안에만 먹는다** (2026-08-29, 사용자 결정).
   *
   * 폴더 목록의 순서와 개수는 이것들과 무관하다. "5개로 뜬 폴더에 들어갔더니 하나"가
   * 맞는 동작이다 — 폴더는 태그의 크기를 말하고, 검색은 그 안에서 고르는 일이다
   */
  keyword?: string;
  sort?: string;
  /** 게임을 옮긴 뒤. 사이드바와 파셋까지 함께 새로 받아야 두 화면이 안 어긋난다 */
  onMoved?: () => void;
}) {
  /* 어느 폴더를 열어뒀는지도 기억한다 — 상세에 갔다 오면 그 폴더로 돌아온다 (v1.2) */
  const [openKey, setOpenKey] = useState<string | null>(() => takeLibrary()?.openFolder ?? null);

  useEffect(() => {
    const prev = takeLibrary();
    if (prev) rememberLibrary({ ...prev, openFolder: openKey });
  }, [openKey]);

  /*
   * ⚠️ **`useApi`로 받는다** (v1.2). 예전엔 여기서 직접 `api.get`을 불러서
   * **응답 캐시를 못 탔다** — 상세에 갔다 오면 폴더 화면만 스켈레톤이 다시 떴다.
   * 갱신도 `invalidateQueries` 하나로 통일된다(직접 부르면 자기만 다시 받는다)
   */
  const all = useApi<PageResponse<BacklogCard>>("/api/backlog?size=100&sort=name");

  const folders = useMemo<Folder[] | null>(() => {
    if (!all.data) return null;
    /*
     * ⚠️ **여기서 다시 정렬하지 않는다** (v1.1). 백엔드가 사용자가 정한 순서
     * (`tag.sortOrder`)로 주므로, 이름순으로 덮으면 프로필에서 끌어 옮긴 게 무시된다
     */
    const next: Folder[] = facets.tags.map((tag) => {
      const cards = all.data!.items.filter((card) => card.tag === tag.name);
      return { key: `tag-${tag.id}`, label: tag.name, count: cards.length, cards, color: tag.color };
    });

    /*
     * '태그 없음'은 **비어 있어도 항상 마지막에** 둔다 — 여기가 드롭 대상이라
     * 항목이 0이라고 사라지면 마지막 하나를 뗀 순간 뗄 곳이 없어진다
     */
    const untagged = all.data.items.filter((card) => card.tag === null);
    next.push({
      key: "untagged", label: "태그 없음", count: untagged.length, cards: untagged, color: null,
    });
    return next;
  }, [all.data, facets]);

  /** 폴더에 놓으면 그 태그로 옮긴다. 사이드바의 그룹 헤더와 같은 동작이다 */
  const drop = async (folder: Folder, entryId: number) => {
    /* 원래 있던 폴더에 놓으면 아무것도 안 한다 (사이드바와 같은 규칙) */
    const from = folders?.find((f) => f.cards.some((c) => c.entryId === entryId));
    if (from?.key === folder.key) return;

    await api.put(`/api/backlog/${entryId}/tag`, {
      name: folder.key === "untagged" ? null : folder.label,
    });
    /* 화면 전체를 무른다 — 사이드바까지 함께 맞아야 한다 */
    invalidateQueries();
    onMoved?.();
  };

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

  /*
   * 폴더 안에만 검색·정렬을 적용한다. 폴더 목록의 개수(`folder.count`)는 그대로 두므로
   * "5개짜리 폴더에 들어가니 하나"가 나온다 — 그게 맞는 동작이다
   */
  const visible = (() => {
    if (!open) return [];
    const q = (keyword ?? "").trim().toLowerCase();
    const picked = q
      ? open.cards.filter((card) => card.displayName.toLowerCase().includes(q))
      : [...open.cards];
    if (sort === "rating") {
      picked.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    } else if (sort === "lastPlayed") {
      picked.sort((a, b) =>
        (b.lastPlaythrough?.startedOn ?? "").localeCompare(a.lastPlaythrough?.startedOn ?? ""),
      );
    } else {
      picked.sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
    }
    return picked;
  })();

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
          {/* 이름·개수 다음에 작은 네모로 색을 한 번 더 (v1.2) — 폴더 목록과 이어 준다 */}
          {open.color && (
            <span
              aria-hidden
              className="h-3 w-3 rounded-[3px]"
              style={{ background: toneOf(open.color).text }}
            />
          )}
        </div>

        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/35">
            {keyword ? "조건에 맞는 게임이 없습니다" : "이 폴더에 담긴 게임이 없습니다"}
          </p>
        ) : (
          <div className={GAME_GRID}>
            {visible.map((card) => (
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
        <FolderBox
          key={folder.key}
          folder={folder}
          onOpen={() => setOpenKey(folder.key)}
          onDropEntry={(id) => void drop(folder, id)}
        />
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
function FolderBox({
  folder,
  onOpen,
  onDropEntry,
}: {
  folder: Folder;
  onOpen: () => void;
  onDropEntry: (entryId: number) => void;
}) {
  const [over, setOver] = useState(false);

  /*
   * ⚠️ **커버 블러를 색 그래디언트로 바꿨다** (v1.2).
   *
   * 예전엔 첫 게임의 커버를 흐리게 깔았다. 그러면 **폴더의 얼굴이 그 안의 첫 게임**이라
   * 게임 하나만 옮겨도 폴더가 딴 것처럼 보였고, 색이 제각각이라 목록이 어수선했다.
   * 태그 색을 쓰면 폴더가 자기 정체성을 갖는다 — 색을 안 고른 폴더만 중립이다
   */
  const tone = toneOf(folder.color);

  return (
    <button
      onClick={onOpen}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = Number(e.dataTransfer.getData("text/entry-id"));
        if (id) onDropEntry(id);
      }}
      // 테두리는 앱 공통 관례를 따른다 — border-white/10, hover는 /25
      className={`group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-neutral-900 transition-colors ${
        over ? "border-white/60 ring-2 ring-white/30" : "border-white/10 hover:border-white/25"
      }`}
    >
      <div
        aria-hidden
        className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
        style={{ background: fluidBackground(tone) }}
      />

      {/* 라벨이 가운데 오므로 전체를 고르게 덮는다. 그래디언트가 이미 어두워 얇게 */}
      <div
        aria-hidden
        className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/5"
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
