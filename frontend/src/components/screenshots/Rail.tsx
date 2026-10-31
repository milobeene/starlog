"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SearchInput from "@/components/ui/SearchInput";
import { Icon } from "@/components/ui/ToolButton";
import type { ExternalSource, InboxGroup } from "@/lib/desktop";
import { buildFolderTree, type FolderNode } from "@/lib/folderTree";
import type { SteamLink } from "@/lib/types";

export interface RailGame { entryId: number; gameName: string; count: number }

const item = (active: boolean) =>
  `flex w-full items-baseline justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
    active ? "border-white/25 bg-white/10 text-white" : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"
  }`;

/**
 * 왼쪽 레일 — STARLOG(스크린샷이 있는 게임) 과 외부 폴더(등록한 것마다, 열어 둔 폴더는 묶음까지).
 * 묶음 단계는 **둘 이상일 때만** 보인다: 하위 폴더 없는 폴더에 "(폴더 바로 아래)" 한 줄만 덩그러니 서 있을 이유가 없다.
 * 접으면 얇은 띠만 남는다 (큰 격자에 폭을 더 준다)
 */
export default function Rail({
  collapsed,
  onToggle,
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
  collapsed: boolean;
  onToggle: () => void;
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
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (games ?? []).filter((g) => q === "" || g.gameName.toLowerCase().includes(q));
  }, [games, query]);
  const total = useMemo(() => (games ?? []).reduce((n, g) => n + g.count, 0), [games]);

  if (collapsed) {
    return (
      <aside aria-label="스크린샷 목록" className="flex w-11 shrink-0 flex-col items-center border-r border-white/10 bg-black/20 py-3">
        <button type="button" onClick={onToggle} aria-label="목록 펼치기" title="목록 펼치기" data-rail-toggle className="rounded-md p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          <Icon name="panel" className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="스크린샷 목록" data-rail className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-black/20">
      <div className="flex shrink-0 items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">Screenshots</span>
        <button type="button" onClick={onToggle} aria-label="목록 접기" title="목록 접기" data-rail-toggle className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white">
          <Icon name="panel" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <section aria-label="STARLOG">
          <h2 className="flex items-baseline justify-between px-2.5 pt-2 pb-1.5 text-[11px] font-semibold tracking-widest text-white/50 uppercase">
            STARLOG <span className="num font-normal text-white/30">{total}</span>
          </h2>
          <div className="mb-2 flex px-1">
            <SearchInput value={query} onChange={setQuery} placeholder="게임 검색…" />
          </div>
          {gamesLoading && !games ? (
            <div className="flex flex-col gap-1.5 px-1">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="image-placeholder h-7 animate-pulse rounded-md" />)}
            </div>
          ) : shown.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-white/30">{(games ?? []).length === 0 ? "스크린샷이 있는 게임이 없습니다." : "맞는 게임이 없습니다."}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {shown.map((g) => (
                <li key={g.entryId}>
                  <button type="button" data-rail-game={g.entryId} aria-current={g.entryId === activeEntry || undefined} onClick={() => onGame(g.entryId)} className={item(g.entryId === activeEntry)}>
                    <span className="min-w-0 truncate">{g.gameName}</span>
                    <span className="num shrink-0 text-[11px] text-white/35">{g.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="외부 폴더" className="mt-5">
          <h2 className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-widest text-white/50 uppercase">외부 폴더</h2>
          {!desktop ? (
            <p className="px-2.5 py-2 text-xs text-white/30">데스크탑 앱에서만 쓸 수 있습니다.</p>
          ) : sources === null ? (
            <div className="px-1"><div className="image-placeholder h-7 animate-pulse rounded-md" /></div>
          ) : sources.length === 0 ? (
            <p className="px-2.5 py-2 text-xs leading-relaxed text-white/30">
              등록한 폴더가 없습니다.{" "}
              <Link href="/system?tab=usage" className="text-white/50 underline hover:text-white">시스템에서 등록</Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {sources.map((s) => {
                const open = s.id === activeSource;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      data-rail-source={s.id}
                      aria-current={open || undefined}
                      disabled={!s.ok}
                      title={s.ok ? s.path : `${s.path} — ${s.reason}`}
                      onClick={() => onSource(s.id)}
                      className={`${item(open && (groups === null || groups.length <= 1 || (s.kind === "folder" && activeGroup === "")))} disabled:opacity-30`}
                    >
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="shrink-0 text-[10px] tracking-widest text-white/30 uppercase">{s.kind === "steam" ? "Steam" : "Folder"}</span>
                    </button>
                    {open && groups && groups.length > 1 && (
                      s.kind === "steam" ? (
                        <ul className="mt-0.5 mb-1 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                          {groups.map((g) => {
                            const link = links[g.key];
                            return (
                              <li key={g.key}>
                                <button type="button" data-rail-group={g.key} aria-current={g.key === activeGroup || undefined} onClick={() => onGroup(g.key)} className={`${item(g.key === activeGroup)} flex-col !items-stretch gap-0`}>
                                  <span className="flex w-full items-baseline justify-between gap-2">
                                    <span className="min-w-0 truncate">{g.title}</span>
                                    <span className="num shrink-0 text-[11px] text-white/35">{countOf(g)}</span>
                                  </span>
                                  {link?.entryId != null && (
                                    <span className="truncate text-[10px] text-white/35">→ {link.entryName ?? "연결된 게임"} · {link.source === "AUTO" ? "자동" : "직접"}</span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <FolderTree
                          groups={groups}
                          activeGroup={activeGroup}
                          onGroup={onGroup}
                          countOf={countOf}
                          sourceRow={s}
                        />
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
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
  sourceRow: ExternalSource;
}) {
  const tree = useMemo(() => buildFolderTree(groups.map((g) => ({ key: g.key, count: countOf(g) }))), [groups, countOf]);
  const render = (nodes: FolderNode[], depth: number): React.ReactNode => (
    <ul className={`flex flex-col gap-0.5 ${depth === 0 ? "mt-0.5 mb-1 ml-3 border-l border-white/10 pl-2" : "ml-3 border-l border-white/10 pl-2"}`}>
      {nodes.map((n) => (
        <li key={n.key}>
          <button type="button" data-rail-group={n.key} aria-current={n.key === activeGroup || undefined} onClick={() => onGroup(n.key)} title={n.key} className={item(n.key === activeGroup)}>
            <span className="min-w-0 truncate">{n.title}</span>
            <span className="num shrink-0 text-[11px] text-white/35">{n.count}</span>
          </button>
          {n.children.length > 0 && render(n.children, depth + 1)}
        </li>
      ))}
    </ul>
  );
  return <>{render(tree.nodes, 0)}</>;
}
