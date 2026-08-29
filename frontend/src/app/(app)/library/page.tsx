"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeading from "@/components/ui/PageHeading";
import SearchInput from "@/components/ui/SearchInput";
import Dropdown from "@/components/ui/Dropdown";
import GameCard from "@/components/ui/GameCard";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { CardGridSkeleton } from "@/components/ui/Skeleton";
import FilterBox, { EMPTY_FILTERS, hasAnyFilter, type Filters } from "@/components/library/FilterBox";
import FolderView from "@/components/library/FolderView";
import { useApi } from "@/lib/useApi";
import { qs } from "@/lib/api";
import { GAME_GRID, useGridColumns } from "@/lib/useGridColumns";
import { SORT_LABEL, SORT_ORDER } from "@/lib/labels";
import type {
  BacklogCard,
  FacetsResponse,
  CompanyDictionary,
  GenreDistribution,
  OptionsResponse,
  PageResponse,
} from "@/lib/types";

/**
 * 한 페이지에 몇 **줄**을 채울지. 개수가 아니라 줄 수인 이유 —
 * 열 수가 화면 폭에 따라 2~8로 바뀌는데 개수를 고정하면 마지막 줄이 어중간하게 잘린다
 */
const PAGE_ROWS = 4;

/**
 * useSearchParams는 Suspense 경계 안에 있어야 한다 — 이 훅이 있으면 Next가
 * 정적 프리렌더를 포기하고(CSR bailout) 그 지점을 감쌀 경계를 요구한다.
 * fallback이 뼈대와 같은 모양이라 전환이 눈에 안 띈다
 */
export default function LibraryPage() {
  return (
    <Suspense fallback={<LibraryFallback />}>
      <LibraryContent />
    </Suspense>
  );
}

function LibraryFallback() {
  return (
    <main className="flex h-full flex-col overflow-hidden">
      <div className="page-x page-top shrink-0 pb-6">
        <PageHeading
          eyebrow="Library"
          title="My Collection"
          subtitle="상태·정렬·간편 수정을 위한 관리 화면입니다."
        />
      </div>
      <div className="page-x pb-16">
        <CardGridSkeleton />
      </div>
    </main>
  );
}

function LibraryContent() {
  const searchParams = useSearchParams();
  // 대시보드의 "More →"가 sort를 들고 온다
  const initialSort = searchParams.get("sort") ?? "lastPlayed";

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState(initialSort);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"grid" | "folder">("grid");

  // 타자마다 요청을 쏘면 76건짜리 목록에 초당 몇 방이 나간다
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  /*
   * 페이지 크기를 **열 수 × 줄 수**로 잡는다. 창을 넓히면 열이 늘어 한 페이지가 커진다.
   * 크기가 바뀌면 지금 페이지 번호는 의미가 달라지므로 아래 conditions에 함께 넣어
   * 첫 페이지로 되돌린다 — 8열 3페이지와 4열 3페이지는 다른 구간이다
   */
  const columns = useGridColumns();
  const pageSize = columns * PAGE_ROWS;

  // 조건이 바뀌면 첫 페이지로. 안 그러면 3페이지에서 필터를 걸었을 때 빈 화면이 나온다
  const conditions = `${debounced}|${sort}|${pageSize}|${JSON.stringify(filters)}`;
  const [seenConditions, setSeenConditions] = useState(conditions);
  if (seenConditions !== conditions) {
    setSeenConditions(conditions);
    setPage(0);
  }

  const facets = useApi<FacetsResponse>("/api/backlog/facets");
  // 장르는 **표시값 기준** 목록이어야 한다 — facets의 개인 장르만 쓰면 마스터 장르가 빠진다
  // 장르 자동완성도 개인 사전 기준이다 (options.genreDictionary)
  const genres = useApi<GenreDistribution[]>("/api/stats/genres");
  const options = useApi<OptionsResponse>("/api/me/options");
  const companies = useApi<CompanyDictionary>("/api/backlog/companies");

  const listPath = useMemo(
    () =>
      `/api/backlog${qs({
        q: debounced,
        status: filters.status,
        genreName: filters.genreName,
        developer: filters.developer,
        releaseYear: filters.releaseYear,
        // 회차 축 (v1.1) — 접두어로 취득 축과 가른다
        ptDeviceId: filters.ptDeviceId,
        ptPlatformId: filters.ptRunsOn === "platform" ? filters.ptPlatformId : "",
        ptEmulatorId: filters.ptRunsOn === "emulator" ? filters.ptEmulatorId : "",
        ptAccountId: filters.ptAccountId,
        ptFrom: filters.ptFrom,
        ptTo: filters.ptTo,
        // 취득 축
        acqMethod: filters.acqMethod,
        acqCurrency: filters.acqCurrency,
        acqMinPrice: filters.acqMinPrice,
        acqMaxPrice: filters.acqMaxPrice,
        acqPlatformId: filters.acqPlatformId,
        acqAccountId: filters.acqAccountId,
        acqFrom: filters.acqFrom,
        acqTo: filters.acqTo,
        page,
        size: pageSize,
        sort,
      })}`,
    [debounced, filters, page, sort, pageSize],
  );

  const list = useApi<PageResponse<BacklogCard>>(view === "grid" ? listPath : null);

  // 제목·필터·그리드가 한 덩어리로 스크롤한다. 따로 스크롤하는 건 사이드바뿐
  return (
    <main className="h-full overflow-y-auto">
      {/* 제목 — 경계선 없이 배경이 그대로 비친다 */}
      <div className="page-x page-top pb-6">
        <PageHeading
          eyebrow="Library"
          title="My Collection"
          subtitle="상태·정렬·간편 수정을 위한 관리 화면입니다."
          right={<ViewSwitch view={view} onChange={setView} />}
        />
      </div>

      {/* 툴바 + 필터 박스 */}
      <div className="page-x flex flex-col gap-4 pb-5">
        {/* 폰에서는 검색창이 좁아져 글자가 잘린다 — 정렬을 아래로 내린다 */}
        {/* 폰에서는 검색창이 좁아져 글자가 잘린다 — 정렬을 아래로 내린다 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} />
          <Dropdown
            /*
             * 왼쪽 정렬 — 이 트리거는 줄 **왼쪽**에 있다. 기본값(right)이면 패널이
             * 트리거의 오른쪽 모서리에서 왼쪽으로 펼쳐져 화면 밖으로 잘려 나간다
             */
            align="left"
            trigger={() => (
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors hover:bg-white/10">
                <span className="text-white/60">Sort:</span>
                <span>{SORT_LABEL[sort] ?? SORT_LABEL.lastPlayed}</span>
                <svg className="ml-1 h-3 w-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
          >
            {(close) =>
              SORT_ORDER.map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    setSort(key);
                    close();
                  }}
                  className={`menu-item ${key === sort ? "menu-item-active" : ""}`}
                >
                  {SORT_LABEL[key]}
                </button>
              ))
            }
          </Dropdown>
        </div>

        {/*
          ⚠️ **폴더 탭에서는 필터를 안 그린다** (2026-08-29, 사용자 지적).
          폴더 목록은 필터를 안 타는데 필터 박스는 그대로 있어서, 걸어도 아무 일이
          안 일어나는 상태였다 — 눌러도 반응이 없는 UI가 제일 나쁘다.
          **제목 검색과 정렬은 남긴다** — 그건 폴더를 열었을 때 그 안에서 먹는다
        */}
        {view === "grid" && (
          <FilterBox
            facets={facets.data}
            genres={genres.data}
            options={options.data}
            developers={companies.data?.overriddenDevelopers ?? null}
            applied={filters}
            onApply={setFilters}
          />
        )}
      </div>

      {/* 결과 */}
      <div className="page-x flex-1 overflow-y-auto pb-8">
        {view === "folder" ? (
          facets.data ? (
            <FolderView
            facets={facets.data}
            keyword={debounced}
            sort={sort}
            onMoved={() => facets.reload()}
          />
          ) : (
            <CardGridSkeleton />
          )
        ) : list.error ? (
          <ErrorNotice error={list.error} onRetry={list.reload} />
        ) : list.loading ? (
          <CardGridSkeleton />
        ) : list.data && list.data.items.length > 0 ? (
          <>
            <div className="mb-6 text-xs text-white/40">
              Showing <span className="num">{list.data.items.length}</span> on this page ·{" "}
              <span className="num">{list.data.totalElements}</span> total games
            </div>
            <div className={GAME_GRID}>
              {list.data.items.map((card) => (
                <GameCard key={card.entryId} card={card} />
              ))}
            </div>
            <Pagination page={page} totalPages={list.data.totalPages} onChange={setPage} />
          </>
        ) : hasAnyFilter(filters) || debounced ? (
          <EmptyState
            title="조건에 맞는 게임이 없습니다"
            hint="필터를 해제하시거나 다른 검색어를 입력해 주세요"
            action={
              <button
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setQuery("");
                }}
                className="rounded-full border border-white/20 px-6 py-2 text-xs tracking-widest uppercase transition-all hover:bg-white hover:text-black"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState title="담아 두신 게임이 없습니다" hint="왼쪽의 Add Game 버튼으로 첫 게임을 추가해 보세요" />
        )}
      </div>
    </main>
  );
}

/**
 * Grid ↔ Folder 토글. 활성 블럭이 **떠서 미끄러진다** —
 * 두 버튼의 배경을 각각 켜고 끄면 깜빡이는 것처럼 보이고 어느 쪽이 켜졌는지 순간 애매하다.
 *
 * 폭을 50%로 계산하면 안 된다: `Grid`와 `Folder`는 글자 길이가 달라 flex-1이어도
 * min-content 때문에 버튼 폭이 갈린다. **실제 버튼을 재서** 그 자리에 붙인다
 */
function ViewSwitch({
  view,
  onChange,
}: {
  view: "grid" | "folder";
  onChange: (view: "grid" | "folder") => void;
}) {
  const options = ["grid", "folder"] as const;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const node = refs.current[view];
    if (node) setBox({ left: node.offsetLeft, width: node.offsetWidth });
  }, [view]);

  return (
    <div className="relative flex w-fit shrink-0 gap-1 self-start rounded-lg border border-white/10 bg-white/5 p-1">
      {box && (
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-md bg-white shadow-sm transition-all duration-200 ease-out"
          style={{ left: box.left, width: box.width }}
        />
      )}
      {options.map((option) => (
        <button
          key={option}
          ref={(node) => {
            refs.current[option] = node;
          }}
          onClick={() => onChange(option)}
          aria-pressed={view === option}
          className={`relative z-10 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
            view === option ? "text-black" : "text-white/50 hover:text-white"
          }`}
        >
          {option === "grid" ? <GridIcon /> : <FolderIcon />}
          {option}
        </button>
      ))}
    </div>
  );
}

function GridIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}
