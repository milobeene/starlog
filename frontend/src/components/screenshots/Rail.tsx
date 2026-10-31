"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SearchInput from "@/components/ui/SearchInput";
import VirtualRows from "./VirtualRows";
import { useStoredState } from "@/lib/useStoredState";
import Marquee from "@/components/ui/Marquee";
import SidePanel, { PanelTitle } from "@/components/ui/SidePanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ExternalSource, InboxGroup } from "@/lib/desktop";
import { buildFolderTree, type FolderNode } from "@/lib/folderTree";
import type { SteamLink } from "@/lib/types";

export interface RailGame { entryId: number; gameName: string; count: number; /** 가장 최근 사진 시각(ms) — 없으면 null */ latestMs: number | null }
export type RailSegment = "starlog" | "external";

/** 라이브러리 사이드바의 게임 줄과 같은 결 — 한 줄, 같은 높이 */
const item = (active: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
    active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
  }`;
const COUNT = "num shrink-0 text-[11px] text-white/30";

export default function Rail({
  open,
  onOpenChange,
  segment,
  onSegment,
  games,
  gamesLoading,
  activeEntry,
  sources,
  activeSource,
  groups,
  activeGroup,
  onGame,
  onSource,
  onGroup,
  desktop,
  countOf,
  links,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment: RailSegment;
  onSegment: (s: RailSegment) => void;
  games: RailGame[] | null;
  gamesLoading: boolean;
  activeEntry: number | null;
  sources: ExternalSource[] | null;
  activeSource: string | null;
  /** 열려 있는 폴더의 묶음 (아직 읽는 중이면 null) */
  groups: InboxGroup[] | null;
  activeGroup: string | null;
  onGame: (entryId: number) => void;
  onSource: (id: string) => void;
  onGroup: (key: string) => void;
  desktop: boolean;
  /** 묶음의 보이는 개수 (옮긴 것을 숨기면 그만큼 빠진다) */
  countOf: (g: InboxGroup) => number;
  /** 스팀 appid → 연결된 게임 */
  links: Record<string, SteamLink>;
}) {
  const [query, setQuery] = useState("");
  /* 기본은 최근 사진이 있는 게임부터 — 방금 찍은 게임을 찾으려 훑지 않게. 이름순은 작은 토글 */
  const [sort, setSort] = useStoredState<"recent" | "name">("starlog.shots.railSort", "recent", ["recent", "name"]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (games ?? []).filter((g) => q === "" || g.gameName.toLowerCase().includes(q));
    return sort === "name"
      ? list.sort((a, b) => a.gameName.localeCompare(b.gameName, "ko"))
      : list.sort((a, b) => (b.latestMs ?? 0) - (a.latestMs ?? 0) || a.gameName.localeCompare(b.gameName, "ko"));
  }, [games, query, sort]);
  const total = useMemo(() => (games ?? []).reduce((n, g) => n + g.count, 0), [games]);

  /* 폰에서는 고르면 드로어를 닫는다 — 안 그러면 목록이 화면을 덮은 채로 남는다 */
  const closeAfter = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { fn(...a); onOpenChange(false); };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      openLabel="목록"
      ariaLabel="스크린샷 목록"
      dataAttr={{ "data-rail": "" }}
      header={
        <>
          <PanelTitle count={total}>Screenshots</PanelTitle>
          {/* 라이브러리 사이드바의 "모두 접기" 자리·글씨 — 이 화면은 라이브러리에서 들어오는 곁가지라 돌아갈 길을 같은 자리에 둔다 */}
          <Link
            href="/library"
            onClick={() => onOpenChange(false)}
            className="flex shrink-0 items-center gap-1 text-[10px] tracking-widest text-white/35 uppercase transition-colors hover:text-white"
          >
            <span aria-hidden>‹</span> 라이브러리
          </Link>
        </>
      }
      footer={
        desktop ? (
          <div className="flex shrink-0 border-t border-white/10 p-3">
            <Link
              href="/system?tab=settings"
              onClick={() => onOpenChange(false)}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-white/15 py-2.5 text-sm font-medium whitespace-nowrap transition-all hover:bg-white hover:text-black"
            >
              폴더 등록 <span className="text-lg leading-none">+</span>
            </Link>
          </div>
        ) : undefined
      }
    >
      {/* 둘 중 하나만 보인다 — 외부 폴더가 긴 게임 목록 아래로 밀려 안 보이던 것 */}
      <div role="tablist" aria-label="목록 종류" className="sticky top-0 z-10 mb-1.5 flex gap-0.5 rounded-md border border-white/10 bg-black/30 p-0.5 backdrop-blur-md">
        {(["starlog", "external"] as const).map((seg) => (
          <button
            key={seg}
            type="button"
            role="tab"
            aria-selected={segment === seg}
            data-rail-segment={seg}
            onClick={() => onSegment(seg)}
            className={`flex-1 rounded px-2 py-1.5 text-[11px] font-semibold tracking-widest uppercase transition-colors ${
              segment === seg ? "bg-white/15 text-white" : "text-white/45 hover:text-white"
            }`}
          >
            {seg === "starlog" ? "STARLOG" : "외부 폴더"}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {segment === "starlog" ? (
        <section aria-label="STARLOG">
          <div className="mb-1.5 flex items-center gap-1.5">
            <SearchInput value={query} onChange={setQuery} placeholder="게임 검색…" />
            <button
              type="button"
              data-rail-sort
              onClick={() => setSort(sort === "recent" ? "name" : "recent")}
              title={sort === "recent" ? "최근 사진 순 — 누르면 이름순" : "이름순 — 누르면 최근 사진 순"}
              className="shrink-0 rounded-md border border-white/10 px-2 py-1.5 text-[10px] tracking-widest text-white/50 uppercase transition-colors hover:bg-white/5 hover:text-white"
            >
              {sort === "recent" ? "최근" : "이름"}
            </button>
          </div>
          {gamesLoading && !games ? (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : shown.length === 0 ? (
            <p className="px-2 py-2 text-xs text-white/30">{(games ?? []).length === 0 ? "스크린샷이 있는 게임이 없습니다." : "맞는 게임이 없습니다."}</p>
          ) : (
            <VirtualRows
              count={shown.length}
              rowH={32}
              render={(i) => {
                const g = shown[i];
                return (
                  <button type="button" data-rail-game={g.entryId} aria-current={g.entryId === activeEntry || undefined} onClick={closeAfter(() => onGame(g.entryId))} className={item(g.entryId === activeEntry)}>
                    <Marquee>{g.gameName}</Marquee>
                    <span className={COUNT}>{g.count}</span>
                  </button>
                );
              }}
            />
          )}
        </section>
        ) : (
        <section aria-label="외부 폴더">
          {!desktop ? (
            <p className="px-2 py-2 text-xs text-white/30">데스크탑 앱에서만 쓸 수 있습니다.</p>
          ) : sources === null ? (
            <div className="p-2"><Skeleton className="h-6 w-full" /></div>
          ) : sources.length === 0 ? (
            <p className="px-2 py-2 text-xs leading-relaxed text-white/30">
              등록한 폴더가 없습니다. 아래 [폴더 등록]에서 스팀·ShareX 폴더를 추가할 수 있습니다.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5">
              {/* 스팀은 늘 마지막 — 메인도 그렇게 주지만 화면에서도 한 번 더 (안정 분할이라 등록 순서는 유지) */}
              {[...sources.filter((x) => x.kind !== "steam"), ...sources.filter((x) => x.kind === "steam")].map((s) => {
                const open = s.id === activeSource;
                const flat = open && (groups === null || groups.length <= 1 || (s.kind === "folder" && activeGroup === ""));
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      data-rail-source={s.id}
                      aria-current={open || undefined}
                      disabled={!s.ok}
                      title={s.ok ? s.path : `${s.path} — ${s.reason}`}
                      onClick={() => onSource(s.id)}
                      className={`${item(flat)} disabled:opacity-30`}
                    >
                      <Marquee>{s.name}</Marquee>
                      <span className="shrink-0 text-[10px] tracking-widest text-white/30 uppercase">{s.kind === "steam" ? "Steam" : "Folder"}</span>
                    </button>
                    {open && groups && groups.length > 1 && (
                      s.kind === "steam" ? (
                        <ul className="mt-0.5 mb-1 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                          {groups.map((g) => {
                            /* 연결된 게임이 있으면 그 이름이 줄의 이름이다 — 두 줄이 되면 높이가 들쭉날쭉하다 */
                            const linked = links[g.key]?.entryName ?? null;
                            return (
                              <li key={g.key}>
                                <button
                                  type="button"
                                  data-rail-group={g.key}
                                  aria-current={g.key === activeGroup || undefined}
                                  onClick={closeAfter(() => onGroup(g.key))}
                                  title={linked ? undefined : "복사할 때 어느 게임으로 보낼지 고를 수 있습니다"}
                                  className={item(g.key === activeGroup)}
                                >
                                  <Marquee>{linked ?? g.title}</Marquee>
                                  <span className={COUNT}>{countOf(g)}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <FolderTree groups={groups} activeGroup={activeGroup} onGroup={closeAfter(onGroup)} countOf={countOf} />
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )}
      </div>
    </SidePanel>
  );
}

/** 폴더 종류의 하위 폴더 트리 — 사진이 바로 들어 있는 폴더만, 사진 없는 중간 폴더는 한 칸으로 접힌다 */
function FolderTree({
  groups,
  activeGroup,
  onGroup,
  countOf,
}: {
  groups: InboxGroup[];
  activeGroup: string | null;
  onGroup: (key: string) => void;
  countOf: (g: InboxGroup) => number;
}) {
  const tree = useMemo(() => buildFolderTree(groups.map((g) => ({ key: g.key, count: countOf(g) }))), [groups, countOf]);
  const render = (nodes: FolderNode[], depth: number): React.ReactNode => (
    <ul className={`flex flex-col gap-0.5 ${depth === 0 ? "mt-0.5 mb-1 ml-3 border-l border-white/10 pl-2" : "ml-3 border-l border-white/10 pl-2"}`}>
      {nodes.map((n) => (
        <li key={n.key}>
          <button type="button" data-rail-group={n.key} aria-current={n.key === activeGroup || undefined} onClick={() => onGroup(n.key)} title={n.key} className={item(n.key === activeGroup)}>
            <Marquee>{n.title}</Marquee>
            <span className={COUNT}>{n.count}</span>
          </button>
          {n.children.length > 0 && render(n.children, depth + 1)}
        </li>
      ))}
    </ul>
  );
  return <>{render(tree.nodes, 0)}</>;
}
