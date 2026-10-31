"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import PageHeading from "@/components/ui/PageHeading";
import MediaThumb, { PlayBadge } from "@/components/media/MediaThumb";
import MediaViewer from "@/components/library/MediaViewer";
import GamePicker from "@/components/inbox/GamePicker";
import { bridgeMessage, getBridge, type ExternalSource, type InboxGroup, type InboxItem, type InboxScan } from "@/lib/desktop";
import { kstDate } from "@/lib/format";
import { invalidateQueries } from "@/lib/useApi";
import { usePick } from "@/lib/usePick";
import { useIdlePreload, useWindowedGrid } from "@/lib/useWindowedGrid";

/**
 * 스크린샷 인박스 — 폴더 탭 → 묶음 → 격자. 격자·확대 보기는 스크린샷 갤러리와 같은 부품이다
 * (보이는 줄만 그리기, 썸네일 먼저·이웃 원본 미리 풀기, 꾹 누르기 120ms).
 *
 * 선택은 **묶음 하나 안에서만** 한다 — 묶음을 바꾸면 비운다. 스팀 묶음은 appid 하나라 "이 게임 사진을 어느 게임으로"가
 * 한 번에 정해지고, 지난번 고른 게임을 기억해 두었다가 맨 위에 올려 줄 수 있다
 */
export default function InboxView() {
  const sourcesApi = getBridge()?.sources;
  const [sources, setSources] = useState<ExternalSource[] | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [scan, setScan] = useState<InboxScan | null>(null);
  const [scanOf, setScanOf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [memory, setMemory] = useState<Record<string, number>>({});
  /** 옮기는 중인 묶음 — 끝나면 목록을 다시 읽는다 */
  const [moving, setMoving] = useState<{ batchId: string; sourceId: string; rels: Set<string> } | null>(null);
  /** 창이 안 보일 때 온 변화 — 다시 보일 때 한 번 읽는다 (배경에서 큰 폴더를 훑지 않게) */
  const dirtyRef = useRef(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    sourcesApi?.list().then((l) => {
      setSources(l);
      setSourceId((cur) => cur ?? l.find((s) => s.ok)?.id ?? null);
    }).catch((caught: unknown) => setError(bridgeMessage(caught, "폴더 목록을 불러오지 못했습니다.")));
  }, [sourcesApi]);

  /* 화면이 열려 있는 동안만 등록 폴더를 감시한다 (탐색기·스팀이 새 사진을 넣으면 다시 읽기) */
  useEffect(() => {
    if (!sourcesApi) return;
    void sourcesApi.watch().catch(() => {});
    const off = sourcesApi.onChanged((c) => {
      if (c.sourceId !== sourceId) return;
      if (document.hasFocus()) setNonce((n) => n + 1);
      else dirtyRef.current = true;
    });
    const onFocus = () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setNonce((n) => n + 1);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
      void sourcesApi.unwatch().catch(() => {});
    };
  }, [sourcesApi, sourceId]);

  useEffect(() => {
    if (!sourcesApi || !sourceId) return;
    let alive = true;
    sourcesApi.scan(sourceId).then((r) => {
      if (!alive) return;
      setScan(r);
      setScanOf(sourceId);
      setError(null);
    }).catch((caught: unknown) => {
      if (alive) setError(bridgeMessage(caught, "폴더를 읽지 못했습니다."));
    });
    sourcesApi.memory().then((m) => { if (alive) setMemory(m); }).catch(() => {});
    return () => { alive = false; };
  }, [sourcesApi, sourceId, nonce]);

  /* 옮기기 진행 — 끝나면(성공이든 되돌림이든) 목록을 다시 읽어 옮겨진 장이 빠지게 한다 */
  useEffect(() => {
    const media = getBridge()?.media;
    if (!moving || !media?.onIngest) return;
    const finish = (job: { batchId: string; phase: string }) => {
      if (job.batchId !== moving.batchId) return;
      if (job.phase === "done" || job.phase === "failed" || job.phase === "rolledBack") {
        // 성공이면 옮긴 장을 바로 뺀다 (다시 읽기 전에도 안 남게). 휴지통 실패로 남은 원본은 다시 읽을 때 돌아온다
        if (job.phase === "done") {
          setScan((cur) => (cur && cur.sourceId === moving.sourceId
            ? { ...cur, groups: cur.groups.map((g) => { const left = g.items.filter((it) => !moving.rels.has(it.rel)); return { ...g, items: left, count: left.length }; }).filter((g) => g.items.length > 0) }
            : cur));
        }
        setMoving(null);
        setNonce((n) => n + 1);
        invalidateQueries();
      }
    };
    const off = media.onIngest(finish);
    // 작은 묶음은 구독이 붙기 전에 끝날 수 있다 — 메인에 남은 상태를 한 번 본다
    void media.ingestStatus?.().then((all) => all.forEach(finish)).catch(() => {});
    return off;
  }, [moving]);

  /* 다른 폴더를 보면 그 폴더의 첫 묶음으로. 목록을 다시 읽어 묶음이 사라졌어도 첫 묶음으로 */
  const groups: InboxGroup[] = useMemo(() => (scan && scanOf === sourceId ? scan.groups : []), [scan, scanOf, sourceId]);
  const group = groups.find((g) => g.key === groupKey) ?? groups[0] ?? null;
  const items: InboxItem[] = useMemo(() => group?.items ?? [], [group]);
  const loading = Boolean(sourceId) && scanOf !== sourceId && !error;

  const { selectMode, setSelectMode, selected, allSelected, pick, toggleAll, cancel: cancelSelect } =
    usePick(items.length, `${sourceId}/${group?.key}/${scan?.groups.length}/${items.length}`);

  /** 옮기는 중인 장은 다시 고르지 못한다 (같은 원본을 두 번 옮기지 않게) */
  const isMoving = useCallback((it: InboxItem) => moving !== null && moving.sourceId === sourceId && moving.rels.has(it.rel), [moving, sourceId]);
  const chosen = useMemo(
    () => [...selected].sort((a, b) => a - b).map((i) => items[i]).filter((it) => Boolean(it) && !isMoving(it)),
    [selected, items, isMoving],
  );

  const viewerItems = useMemo(
    () => items.map((it) => ({ fileName: it.name, url: it.url, contentType: it.contentType, thumbUrl: it.thumbUrl })),
    [items],
  );
  const thumbUrls = useMemo(() => items.map((it) => it.thumbUrl), [items]);
  const { attachOuter, attachGrid, start: winStart, end: winEnd, top: winTop, height: winHeight } = useWindowedGrid(items.length);
  useIdlePreload(thumbUrls, viewing === null && !picking);

  const closeViewer = useCallback(() => setViewing(null), []);

  const startMove = async (entryId: number) => {
    if (!sourcesApi || !sourceId || !group) return;
    setPicking(false);
    setMoveError(null);
    try {
      const rels = chosen.map((c) => c.rel);
      const { batchId } = await sourcesApi.move({ sourceId, groupKey: group.key, rels, entryId });
      setMoving({ batchId, sourceId, rels: new Set(rels) });
      cancelSelect();
    } catch (caught) {
      setMoveError(bridgeMessage(caught, "옮기지 못했습니다."));
    }
  };

  if (!sourcesApi) {
    return (
      <main className="h-full overflow-y-auto">
        <div className="page-x page-top mx-auto w-full max-w-5xl pb-20">
          <PageHeading eyebrow="Screenshots" title="스크린샷 인박스" subtitle="데스크탑 앱에서만 쓸 수 있습니다." />
        </div>
      </main>
    );
  }

  const noSources = sources !== null && sources.length === 0;
  const pinnedId = scan?.kind === "steam" && group ? (memory[group.key] ?? null) : null;

  return (
    <main className="h-full overflow-y-auto" data-inbox>
      <div className="page-x page-top mx-auto w-full max-w-7xl pb-20">
        <PageHeading
          eyebrow="Screenshots"
          title="스크린샷 인박스"
          subtitle="스팀·ShareX 같은 외부 폴더의 사진을 보고, 고른 것을 게임으로 옮깁니다."
        />

        {noSources ? (
          <EmptyState
            title="등록한 폴더가 없습니다"
            hint="시스템 → 사용량에서 스팀이나 스크린샷 폴더를 등록해 주세요."
            action={<Link href="/system?tab=usage" className="text-sm text-white/70 underline hover:text-white">시스템으로</Link>}
          />
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="폴더">
              {(sources ?? []).map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === sourceId}
                  disabled={!s.ok}
                  title={s.ok ? s.path : `${s.path} — ${s.reason}`}
                  onClick={() => { setSourceId(s.id); setGroupKey(null); setScan(null); setScanOf(null); }}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-30 ${
                    s.id === sourceId ? "border-white/40 bg-white/15 text-white" : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {error ? (
              <div className="flex flex-col items-center gap-3 py-24 text-center">
                <p className="text-sm text-red-400">{error}</p>
                <Button onClick={() => setNonce((n) => n + 1)}>다시 시도</Button>
              </div>
            ) : loading ? (
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 10 }, (_, i) => <div key={i} className="image-placeholder aspect-video animate-pulse rounded-lg" />)}
              </div>
            ) : groups.length === 0 ? (
              <EmptyState title="사진이 없습니다" hint="이 폴더에서 사진이나 영상을 찾지 못했습니다." />
            ) : (
              <div className="mt-6 flex flex-col gap-5 md:flex-row">
                <nav aria-label="묶음" className="flex shrink-0 flex-row gap-1.5 overflow-x-auto md:max-h-[70vh] md:w-60 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
                  {groups.map((g) => (
                    <button
                      key={g.key}
                      data-group={g.key}
                      aria-pressed={g.key === group?.key}
                      onClick={() => { setGroupKey(g.key); cancelSelect(); }}
                      className={`flex shrink-0 items-baseline justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                        g.key === group?.key ? "border-white/30 bg-white/10 text-white" : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="min-w-0 truncate">{g.title}</span>
                      <span className="num shrink-0 text-[11px] text-white/35">{g.count}</span>
                    </button>
                  ))}
                </nav>

                <section className="min-w-0 flex-1" aria-label="사진">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="mr-auto min-w-0 truncate text-sm text-white/80">
                      {group?.title}
                      {group?.sub && <span className="num ml-2 text-[11px] text-white/30">{group.sub}</span>}
                    </h2>
                    {selectMode && <span className="num text-xs text-white/50">{selected.size}개 선택</span>}
                    {selectMode && <Button disabled={items.length === 0} onClick={toggleAll}>{allSelected ? "전체 선택 해제" : "전체 선택"}</Button>}
                    <Button
                      variant="primary"
                      disabled={chosen.length === 0 || moving !== null}
                      onClick={() => setPicking(true)}
                      data-move
                    >
                      {moving ? "옮기는 중…" : `옮기기${selected.size ? ` (${selected.size})` : ""}`}
                    </Button>
                    <Button disabled={!selectMode && items.length === 0} onClick={() => (selectMode ? cancelSelect() : setSelectMode(true))}>
                      {selectMode ? "취소" : "선택"}
                    </Button>
                  </div>
                  {moveError && <p className="mb-2 text-xs text-red-400">{moveError}</p>}
                  {scan?.truncated && <p className="mb-2 text-xs text-white/50">목록이 너무 많아 일부만 표시합니다.</p>}

                  <div ref={attachOuter} className="relative select-none" style={winHeight === null ? undefined : { height: winHeight }}>
                    <div
                      ref={attachGrid}
                      data-count={items.length}
                      className="absolute inset-x-0 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                      style={{ top: winTop }}
                    >
                      {items.slice(winStart, winEnd).map((item, offset) => {
                        const index = winStart + offset;
                        return (
                          <Tile
                            key={item.rel}
                            item={item}
                            selectMode={selectMode}
                            picked={selected.has(index)}
                            busy={isMoving(item)}
                            onClick={(event) => (selectMode ? (isMoving(item) ? undefined : pick(index, event)) : setViewing(index))}
                          />
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {viewing !== null && viewerItems[viewing] && (
        <MediaViewer items={viewerItems} index={viewing} onIndex={setViewing} onClose={closeViewer} />
      )}
      {picking && (
        <GamePicker
          pinnedId={pinnedId}
          count={chosen.length}
          onPick={(entryId) => void startMove(entryId)}
          onClose={() => setPicking(false)}
        />
      )}
    </main>
  );
}

function Tile({
  item,
  selectMode,
  picked,
  busy,
  onClick,
}: {
  item: InboxItem;
  selectMode: boolean;
  picked: boolean;
  /** 옮기는 중 — 선택 못 한다 */
  busy: boolean;
  onClick: (event: React.MouseEvent) => void;
}) {
  const isVideo = item.kind === "VIDEO";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={item.name}
      aria-pressed={selectMode ? picked : undefined}
      aria-disabled={busy || undefined}
      className={`${busy ? "pointer-events-none opacity-40 " : ""}group relative aspect-video overflow-hidden rounded-lg border text-left transition-colors ${
        picked ? "border-white/80" : "border-white/10 hover:border-white/30"
      } ${selectMode ? "cursor-pointer" : "cursor-zoom-in"}`}
    >
      <MediaThumb
        thumbUrl={item.thumbUrl}
        url={item.url}
        isVideo={isVideo}
        alt={item.name}
        placeholder={item.placeholder}
        className={picked ? "opacity-70" : ""}
      />
      {isVideo && <PlayBadge />}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
        <span className="num text-white/60">{kstDate(new Date(item.takenAtMs))}</span>
      </span>
      {selectMode && (
        <span
          aria-hidden
          className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded border text-[11px] ${
            picked ? "border-white bg-white text-black" : "border-white/70 bg-black/40 text-transparent"
          }`}
        >
          ✓
        </span>
      )}
    </button>
  );
}
