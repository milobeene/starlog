"use client";

import GameCover from "@/components/ui/GameCover";
import GameRowActions from "@/components/system/GameRowActions";
import type { GameRow } from "@/components/system/gameMaster";

/** 마스터 목록과 IGDB 검색 결과를 같은 줄 모양으로 그린다. 선택 상태는 위에서 들고 있다 */
export default function GameMasterList({
  rows,
  selected,
  onSelect,
  onInfo,
  onResync,
  onDelete,
}: {
  rows: GameRow[];
  selected: Set<number>;
  onSelect: (gameId: number, checked: boolean) => void;
  onInfo: (game: GameRow) => void;
  onResync: (game: GameRow) => void;
  onDelete: (game: GameRow) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((game) => (
        <li
          key={game.gameId ?? `ext-${game.name}-${game.releasedOn}`}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
            game.gameId && selected.has(game.gameId)
              ? "border-white/40 bg-white/10"
              : "border-white/10 bg-white/5"
          }`}
        >
          {/*
            마스터에 있는 것만 고를 수 있다 — IGDB 결과는 아직 우리 것이 아니다.

            ⚠️ **label로 감싸 클릭 영역을 커버 높이만큼 넓힌다** (2026-08-29).
            동그라미만 누를 수 있으면 목표가 18px이라 자주 빗나간다 —
            `self-stretch`가 행 높이를 그대로 받고, 음수 마진으로 패딩까지 먹는다
          */}
          {game.gameId ? (
            <label className="-my-2.5 flex shrink-0 cursor-pointer items-center self-stretch py-2.5 pr-1 pl-0.5">
              <input
                type="checkbox"
                checked={selected.has(game.gameId)}
                onChange={(e) => onSelect(game.gameId!, e.target.checked)}
                className="pick-circle"
              />
            </label>
          ) : (
            <span className="w-[1.15rem] shrink-0" />
          )}

          <div className="w-10 shrink-0">
            <GameCover coverUrl={null} coverImageId={game.coverImageId} name={game.name} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{game.name}</div>
            <div className="num text-xs text-white/35">
              {game.releasedOn ?? "출시일 없음"} · {game.source}
              {game.gameId ? ` · #${game.gameId}` : " · 마스터에 없음"}
              {game.lastSyncedAt && ` · 동기화 ${game.lastSyncedAt.slice(0, 10)}`}
            </div>
          </div>

          {/* 마스터에 없는 검색 결과(IGDB 전용)는 고칠 대상이 아니다 */}
          {game.gameId == null ? (
            <span className="shrink-0 text-xs text-white/25">마스터 등록 후 수정 가능</span>
          ) : (
            <GameRowActions
              game={game}
              onInfo={() => onInfo(game)}
              onResync={() => onResync(game)}
              onDelete={() => onDelete(game)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
