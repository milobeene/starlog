"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { invalidateQueries, useApi } from "@/lib/useApi";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { coverSrc } from "@/lib/cover";
import type { BacklogCard, BacklogName, FacetsResponse, PageResponse } from "@/lib/types";

/**
 * 전체 게임 목록 — 이름순, 페이징 없음. 필터는 여기 없다 (툴바의 필터 박스가 전부 맡는다).
 *
 * 이름은 전용 엔드포인트(`/api/backlog/names`)로, 썸네일과 태그는 목록 API로 따로 받는다.
 * names에 커버를 실으면 이 가벼운 조회에 조인이 붙는데, 썸네일은 **있으면 좋은 것**이라
 * 늦게 도착해도 이름 목록이 먼저 뜨는 편이 낫다.
 *
 * **태그로 묶는다** (design-request.md §3-1). 태그가 항목당 하나라 한 게임은 한 그룹에만 든다 —
 * 중복이 없어서 "이동용 목록"으로서 스캔이 깨지지 않는다.
 * 그룹 헤더는 일부러 얇다. 이건 필터 UI가 아니라 **목록에 결을 주는 장치**다 (필터는 FilterBox 담당)
 */
/** 태그 없는 게임을 담는 그룹 키. 실제 태그 이름과 겹치지 않게 화면 문구와 분리해 둔다 */
const UNTAGGED = "\u0000untagged";

export default function LibrarySidebar() {
  const names = useApi<BacklogName[]>("/api/backlog/names");
  const covers = useApi<PageResponse<BacklogCard>>("/api/backlog?size=100&sort=name");
  /** 태그 순서를 받으려고 파셋도 받는다 — 사용자가 프로필에서 정한 순서다 (v1.1) */
  const facets = useApi<FacetsResponse>("/api/backlog/facets");
  // 상세 경로가 `/library/detail?entry=57`로 바뀌었다 (정적 내보내기 때문)
  const currentId = useSearchParams().get("entry") ?? undefined;

  /*
   * 드로어 열림 (lg 미만에서만 의미가 있다).
   *
   * 게임을 고르면 닫아야 한다 — 안 그러면 목록이 상세를 덮은 채로 남는다.
   * currentId를 key처럼 써서 **바뀔 때만** 닫는다: 렌더마다 setState를 부르면 무한 루프다
   */
  const [open, setOpen] = useState(false);
  const [openedFor, setOpenedFor] = useState(currentId);
  if (openedFor !== currentId) {
    setOpenedFor(currentId);
    if (open) setOpen(false);
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** 드래그가 얹혀 있는 그룹. 놓을 자리를 눈에 보이게 한다 */
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /**
   * 게임을 태그로 옮긴다 (2026-08-29).
   *
   * ⚠️ **놓은 뒤 둘 다 새로 받는다.** 사이드바는 `names`와 `covers` 두 응답을 겹쳐 쓰는데
   * (태그가 covers에서 온다) 하나만 갱신하면 목록과 그룹이 어긋난 채로 남는다
   */
  const moveToTag = async (entryId: number, tagKey: string) => {
    /*
     * ⚠️ **원래 있던 태그면 아무것도 안 한다** (v1.2). 예전엔 같은 자리에 놓아도
     * 요청이 나가고 목록이 새로 그려져서, 안 바뀐 화면이 한 번 깜빡였다
     */
    const current = tagById.get(entryId) ?? null;
    const next = tagKey === UNTAGGED ? null : tagKey;
    if (current === next) return;

    // 엔드포인트가 **이름**을 받는다(다이얼로그와 같은 길). null이면 태그가 벗겨진다
    await api.put(`/api/backlog/${entryId}/tag`, {
      name: tagKey === UNTAGGED ? null : tagKey,
    });
    /*
     * ⚠️ **화면 전체를 무를 수 있다.** 예전엔 사이드바의 세 응답만 다시 받아서
     * **폴더 탭은 옛 상태로 남았다** — 반대도 마찬가지였다.
     * `invalidateQueries`는 useApi로 받은 모든 것을 무르므로 어느 쪽에서 놓든 둘 다 맞는다
     */
    invalidateQueries();
  };

  const coverById = useMemo(() => {
    const map = new Map<number, string | null>();
    covers.data?.items.forEach((card) =>
      map.set(card.entryId, coverSrc(card.coverUrl, card.coverImageId, "t_thumb")),
    );
    return map;
  }, [covers.data]);

  const tagById = useMemo(() => {
    const map = new Map<number, string | null>();
    covers.data?.items.forEach((card) => map.set(card.entryId, card.tag));
    return map;
  }, [covers.data]);

  /*
   * 태그별로 묶는다. **정렬은 항상 이름순** — 그룹 안에서도, 그룹 자체도 (다른 정렬 옵션 없음).
   * names가 이미 이름순으로 오므로 그룹 안은 순서를 그대로 쓰면 된다.
   *
   * 태그 없는 게임은 맨 아래 한 덩어리로 몬다. 실데이터는 태그 안 붙은 항목이 더 많아서
   * 이 그룹이 없으면 게임이 사라져 보인다.
   *
   * ⚠️ **태그가 도착하기 전에는 그리지 않는다** (v1.2, 사용자 요청).
   * 예전엔 목록을 먼저 띄우고 태그가 오면 재배치했는데, **전부 '태그 없음'으로 한 번
   * 그려졌다가 흩어지는 게** 로딩이 아니라 고장으로 보였다. 스켈레톤이 낫다
   */
  const groups = useMemo(() => {
    const buckets = new Map<string, typeof names.data>();
    (names.data ?? []).forEach((entry) => {
      const tag = tagById.get(entry.entryId) ?? null;
      const key = tag ?? UNTAGGED;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(entry);
    });

    /*
     * ⚠️ **파셋이 준 순서를 따른다** (v1.1). 이름순으로 정렬하면 프로필의 사전에서
     * 끌어 옮긴 순서가 무시되고, 같은 목록이 화면마다 다르게 보인다.
     * 파셋에 없는 태그(도착 전)는 뒤에 이름순으로 붙인다
     */
    const rank = new Map((facets.data?.tags ?? []).map((tag, index) => [tag.name, index]));
    const tagged = [...buckets.keys()]
      .filter((key) => key !== UNTAGGED)
      .sort((a, b) => {
        const ra = rank.get(a);
        const rb = rank.get(b);
        if (ra != null && rb != null) return ra - rb;
        if (ra != null) return -1;
        if (rb != null) return 1;
        return a.localeCompare(b, "ko");
      });

    /*
     * ⚠️ **'태그 없음'은 비어 있어도 항상 마지막에 둔다** (2026-08-29, 사용자 요청).
     * 여기가 드롭 대상이기 때문이다 — 태그를 떼려면 놓을 자리가 있어야 하는데,
     * 항목이 0이라고 사라지면 마지막 하나를 뗀 순간 뗄 곳이 없어진다
     */
    return [...tagged, UNTAGGED].map((key) => ({
      key,
      items: buckets.get(key) ?? [],
    }));
  }, [names.data, tagById, facets.data]);

  const allCollapsed = groups.length > 0 && collapsed.size >= groups.length;
  const toggleAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)));

  return (
    <>
      {/* 열렸을 때 뒤를 눌러 닫는다. 폰에서 X 버튼만 있으면 닫기가 번거롭다 */}
      {open && (
        <button
          aria-label="목록 닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {/* 여는 버튼 — 화면 왼쪽 아래. 엄지가 닿는 자리다 */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "목록 닫기" : "게임 목록 열기"}
        aria-expanded={open}
        /*
         * 열리면 숨긴다 — 사이드바가 이 자리를 덮어 버튼과 목록이 겹쳐 보였다.
         * 닫는 건 배경막을 누르면 된다 (위 button)
         */
        className={`fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2.5 text-xs font-medium tracking-wider text-white/90 uppercase backdrop-blur-md transition-opacity hover:bg-black/85 lg:hidden ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
        목록
      </button>

    <aside
      /*
       * ## lg 미만에서는 드로어다
       *
       * 폭이 w-64(16rem)라 390px 화면에서는 본문에 남는 게 6rem뿐이다.
       * 그래서 좁은 화면에서는 **화면 밖에 세워두고** 버튼으로 밀어 넣는다(translate-x).
       * `hidden`이 아니라 이동으로 처리하는 이유 — 목록을 미리 받아둬야
       * 열자마자 스켈레톤이 아니라 내용이 보인다
       */
      className={`glass-panel fixed inset-y-0 left-0 z-30 mt-16 mr-2 mb-4 ml-0 flex w-64 shrink-0 flex-col overflow-hidden rounded-xl transition-transform duration-200 ease-out lg:static lg:mt-20 lg:ml-6 lg:translate-x-0 xl:w-72 ${
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 p-5">
        <h3 className="flex-1 text-[10px] tracking-widest text-white/40 uppercase">
          All Games {names.data && <span className="num text-white/25">({names.data.length})</span>}
        </h3>
        {/*
          한 번에 접기·펴기 (2026-08-29). 태그가 열 개를 넘으면 원하는 그룹을 찾으려
          하나씩 접어야 했다. 상태 하나로 판단한다 — 전부 접혀 있으면 다음 누름은 펴기다
        */}
        {groups.length > 0 && (
          <button
            onClick={toggleAll}
            className="shrink-0 text-[10px] tracking-widest text-white/35 uppercase transition-colors hover:text-white"
          >
            {allCollapsed ? "모두 펴기" : "모두 접기"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* 태그(covers)까지 와야 그린다 — 하나라도 없으면 스켈레톤 */}
        {names.loading || covers.loading || !covers.data ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 12 }, (_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {groups.map((group) => {
              const isOpen = !collapsed.has(group.key);
              const label = group.key === UNTAGGED ? "태그 없음" : group.key;
              return (
                <section
                  key={group.key}
                  /*
                    ⚠️ **그룹 전체가 드롭 영역이다** (v1.2). 헤더 줄에만 받으면
                    펼쳐진 게임 목록 위에 놓았을 때 아무 일도 안 일어나 — 사용자 눈에는
                    "그 태그 안에 놓았는데" 실패한 것으로 보인다
                  */
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget(group.key);
                  }}
                  onDragLeave={(e) => {
                    // 자식으로 옮겨가는 것도 leave로 온다 — 진짜로 밖으로 나갔을 때만 끈다
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDropTarget((t) => (t === group.key ? null : t));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const id = Number(e.dataTransfer.getData("text/entry-id"));
                    if (id) void moveToTag(id, group.key);
                  }}
                  className={`rounded-md transition-colors ${
                    dropTarget === group.key ? "bg-white/[0.07]" : ""
                  }`}
                >
                  {/*
                    헤더를 버튼으로 두되 생김새는 라벨에 가깝게 — 얇은 글씨 + 개수.
                    필터처럼 보이면 사용자가 여기서 걸러질 거라 기대하는데, 그건 FilterBox의 몫이다
                  */}
                  <button
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      })
                    }
                    /*
                      태그 줄에 흐린 배경을 깐다 (v1.2). 게임 목록과 같은 무게로 흐르니까
                      **어디가 그룹 머리인지 눈에 안 걸렸다** — 배경 한 겹이 결을 만든다
                    */
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-xs font-semibold tracking-widest uppercase transition-colors ${
                      dropTarget === group.key
                        ? "border-white/30 bg-white/15 text-white ring-1 ring-white/30"
                        : "border-white/[0.06] bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white/90"
                    }`}
                  >
                    <span
                      className={`text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ▶
                    </span>
                    <span className="truncate">{label}</span>
                    <span className="num font-normal text-white/30">{group.items.length}</span>
                  </button>

                  {isOpen && (
                    <ul className="flex flex-col gap-0.5">
                      {group.items.map((entry) => {
                        const active = String(entry.entryId) === currentId;
                        const thumb = coverById.get(entry.entryId);
                        return (
                          <li key={entry.entryId}>
                            <Link
                              /*
                                끌어서 다른 태그로 옮긴다. Link라 기본 드래그가 주소를
                                실어 보내는데, 우리 키를 하나 더 얹어 그걸 읽는다
                              */
                              draggable
                              onDragStart={(e) =>
                                e.dataTransfer.setData("text/entry-id", String(entry.entryId))
                              }
                              href={`/library/detail?entry=${entry.entryId}`}
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
                </section>
              );
            })}
          </div>
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
    </>
  );
}
