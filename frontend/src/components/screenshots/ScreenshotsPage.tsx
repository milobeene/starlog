"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import { getBridge, type ExternalSource, type InboxGroup } from "@/lib/desktop";
import { onMediaChanged } from "@/lib/mediaEvents";
import { useApi } from "@/lib/useApi";
import { useSourceScan } from "@/lib/useSourceScan";
import { useSteamLinks } from "@/lib/useSteamLinks";
import type { GalleryResponse } from "@/lib/types";
import ExternalPane from "./ExternalPane";
import Rail from "./Rail";
import StarlogPane from "./StarlogPane";

const COLLAPSE_KEY = "starlog.shots.railCollapsed";

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
}

/**
 * 스크린샷 화면 하나 — 예전의 전체 화면 갤러리(오버레이)와 스크린샷 인박스(`/screenshots-inbox`)를 합쳤다.
 *
 * 무엇을 보는지는 **주소**가 정한다 (정적 내보내기라 동적 경로가 없다 → 쿼리):
 *   `?entry=57`                    STARLOG의 게임 하나
 *   `?source=<id>&group=<key>`     외부 폴더(와 그 묶음)
 * 아무것도 없으면 스크린샷이 있는 첫 게임, 그것도 없으면 첫 외부 폴더. 선택은 `router.replace`로 바꾼다 (뒤로가기가 선택마다 쌓이지 않게)
 */
export default function ScreenshotsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const entryParam = params.get("entry");
  const sourceParam = params.get("source");
  const groupParam = params.get("group");

  const desktop = Boolean(getBridge()?.sources);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { queueMicrotask(() => setCollapsed(readCollapsed())); }, []);
  const toggleRail = () => setCollapsed((c) => {
    try { window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* 기억 못 해도 동작한다 */ }
    return !c;
  });

  /* 레일의 게임 목록 — 개수만 (`summary`). 폴더 감시가 알리면 다시 읽는다 */
  const gallery = useApi<GalleryResponse>("/api/screenshots?summary=true");
  const reloadGallery = gallery.reload;
  useEffect(() => onMediaChanged(reloadGallery), [reloadGallery]);
  const games = useMemo(
    () => gallery.data ? gallery.data.games.map((g) => ({ entryId: g.entryId, gameName: g.gameName, count: g.imageCount + g.videoCount })) : null,
    [gallery.data],
  );

  const [sources, setSources] = useState<ExternalSource[] | null>(null);
  useEffect(() => {
    const api = getBridge()?.sources;
    if (!api) return;
    let alive = true;
    api.list().then((l) => { if (alive) setSources(l); }).catch(() => { if (alive) setSources([]); });
    return () => { alive = false; };
  }, []);

  /* 무엇을 보나 — 주소가 없으면 기본값 */
  const entryId = entryParam !== null && /^\d+$/.test(entryParam) ? Number(entryParam) : null;
  const sourceOk = sourceParam !== null && (sources ?? []).some((s) => s.id === sourceParam && s.ok);
  let view: { kind: "game"; id: number } | { kind: "source"; id: string } | null = null;
  if (entryId !== null) view = { kind: "game", id: entryId };
  else if (sourceOk) view = { kind: "source", id: sourceParam! };
  else if (sourceParam === null) {
    if (games && games.length > 0) view = { kind: "game", id: games[0].entryId };
    else if (games && sources) {
      const first = sources.find((s) => s.ok);
      if (first) view = { kind: "source", id: first.id };
    }
  }
  const activeSource = view?.kind === "source" ? view.id : null;

  const scanState = useSourceScan(activeSource, groupParam);
  const groups = scanState.scan?.groups ?? null;
  const activeKind = sources?.find((s) => s.id === activeSource)?.kind ?? null;
  /* 주소에 묶음이 없으면: 폴더 종류는 그 폴더 바로 아래 사진(있으면), 아니면 첫 묶음 */
  const group = groups
    ? groups.find((g) => g.key === groupParam) ?? (activeKind === "folder" ? groups.find((g) => g.key === "") : undefined) ?? groups[0] ?? null
    : null;

  /* 이미 스팀에서 복사해 간 사진은 기본으로 숨긴다 */
  const [showMoved, setShowMoved] = useState(false);
  const countOf = useCallback((g: InboxGroup) => (showMoved ? g.count : g.items.filter((it) => !it.moved).length), [showMoved]);

  const steamIds = useMemo(() => (activeKind === "steam" && groups ? groups.map((g) => g.key) : []), [activeKind, groups]);
  const steamLinks = useSteamLinks(steamIds, activeKind === "steam");

  const go = useCallback((query: Record<string, string>) => {
    router.replace(`${pathname}?${new URLSearchParams(query).toString()}`);
  }, [router, pathname]);

  const gameName = view?.kind === "game"
    ? games?.find((g) => g.entryId === view.id)?.gameName ?? null
    : null;
  /* 스크린샷이 0장인 게임으로 들어온 경우(상세에서 [전체 보기]) 이름은 상세가 아니라 카드에서 가져온다 */
  const cards = useApi<{ entryId: number; displayName: string }[]>(view?.kind === "game" && gameName === null ? "/api/backlog/cards" : null);
  const title = gameName ?? cards.data?.find((c) => c.entryId === (view?.kind === "game" ? view.id : -1))?.displayName ?? "게임";

  const activeSrc = sources?.find((s) => s.id === activeSource) ?? null;

  return (
    <main className="flex h-full pt-16" data-shots-page>
      <Rail
        collapsed={collapsed}
        onToggle={toggleRail}
        games={games}
        gamesLoading={gallery.loading}
        activeEntry={view?.kind === "game" ? view.id : null}
        sources={sources}
        activeSource={activeSource}
        groups={groups}
        activeGroup={group?.key ?? null}
        desktop={desktop}
        onGame={(id) => go({ entry: String(id) })}
        onSource={(id) => go({ source: id })}
        onGroup={(key) => go({ source: activeSource ?? "", group: key })}
        countOf={countOf}
        links={steamLinks.links}
      />

      {view?.kind === "game" ? (
        <StarlogPane key={view.id} entryId={view.id} gameName={title} />
      ) : view?.kind === "source" && activeSrc ? (
        <ExternalPane
          key={`${activeSrc.id}/${group?.key ?? ""}`}
          source={activeSrc}
          group={group}
          scan={scanState.scan}
          loading={scanState.loading}
          error={scanState.error}
          onRetry={() => scanState.reload(activeSrc.id)}
          onMoved={() => scanState.reload(activeSrc.id)}
          onDrop={(rels) => scanState.drop(activeSrc.id, rels)}
          link={group ? steamLinks.links[group.key] ?? null : null}
          onLink={(appid, entryId, name) => void steamLinks.setManual(appid, entryId, name)}
          showMoved={showMoved}
          onShowMoved={setShowMoved}
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center">
          {gallery.loading || (desktop && sources === null) ? (
            <div data-loading className="image-placeholder h-24 w-48 animate-pulse rounded-lg" />
          ) : (
            <EmptyState
              title="아직 스크린샷이 없습니다"
              hint="게임 상세의 Screenshots 구역이나 이 화면의 왼쪽에서 게임을 골라 파일을 끌어다 놓을 수 있습니다. 스팀·ShareX 폴더는 시스템에서 등록합니다."
            />
          )}
        </div>
      )}
    </main>
  );
}
