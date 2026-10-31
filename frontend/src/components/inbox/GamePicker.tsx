"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Field";
import SearchInput from "@/components/ui/SearchInput";
import { api, errorMessage } from "@/lib/api";
import { coverSrc } from "@/lib/cover";
import type { BacklogCard, EntryStatus } from "@/lib/types";

/** 지금 하는 중 → 잠깐 멈춤 → 나머지(마지막으로 한 날 최신순). 사용자가 방금 하던 게임이 위에 오게 */
const RANK: Partial<Record<EntryStatus, number>> = { PLAYING: 0, PAUSED: 1 };

const lastPlayed = (c: BacklogCard) => {
  const p = c.lastPlaythrough;
  return p ? (p.finishedOn ?? p.startedOn ?? "") : "";
};

/**
 * 옮길 게임 고르기. 정렬은 상태와 마지막 플레이 날짜뿐이다 — 날짜·이름으로 게임을 **추천하지 않는다.**
 * 스팀 묶음이면 지난번에 이 appid를 옮긴 게임(`pinnedId`)을 맨 위에 박는다: 추천이 아니라 사용자의 지난 선택의 기억이다
 */
export default function GamePicker({
  pinnedId,
  count,
  onPick,
  onClose,
}: {
  pinnedId: number | null;
  count: number;
  onPick: (entryId: number) => void;
  onClose: () => void;
}) {
  const [cards, setCards] = useState<BacklogCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<BacklogCard[]>("/api/backlog/cards", controller.signal)
      .then((r) => { if (!controller.signal.aborted) setCards(r); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorMessage(caught, "게임 목록을 불러오지 못했습니다.")); });
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...(cards ?? [])].sort((a, b) => {
      const ra = RANK[a.status] ?? 2, rb = RANK[b.status] ?? 2;
      if (ra !== rb) return ra - rb;
      const la = lastPlayed(a), lb = lastPlayed(b);
      if (la !== lb) return la < lb ? 1 : -1;
      return a.displayName.localeCompare(b.displayName);
    });
    const hit = q === "" ? all : all.filter((c) => c.displayName.toLowerCase().includes(q) || (c.masterName ?? "").toLowerCase().includes(q));
    const pinned = hit.find((c) => c.entryId === pinnedId);
    return pinned ? [pinned, ...hit.filter((c) => c !== pinned)] : hit;
  }, [cards, query, pinnedId]);

  return (
    <Modal
      title={`${count}장을 옮길 게임`}
      onClose={onClose}
      width="max-w-lg"
      footer={<Button onClick={onClose}>취소</Button>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex">
          <SearchInput value={query} onChange={setQuery} placeholder="게임 검색…" />
        </div>
        <p className="text-[11px] text-white/35">옮기면 원본은 휴지통으로 갑니다.</p>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !cards ? (
          <p className="py-8 text-center text-sm text-white/30">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/30">맞는 게임이 없습니다.</p>
        ) : (
          <ul className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto" aria-label="게임 목록">
            {rows.map((c) => {
              const cover = coverSrc(c.coverUrl, c.coverImageId, "t_thumb");
              const pinned = c.entryId === pinnedId;
              return (
                <li key={c.entryId}>
                  <button
                    type="button"
                    data-entry-id={c.entryId}
                    onClick={() => onPick(c.entryId)}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                      pinned ? "border-white/30 bg-white/10" : "border-transparent hover:bg-white/5"
                    }`}
                  >
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="image-placeholder h-9 w-9 shrink-0 rounded" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white/90">{c.displayName}</span>
                      {pinned && <span className="text-[10px] text-white/45">지난번에 이 게임으로 옮겼습니다</span>}
                    </span>
                    <StatusBadge status={c.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
