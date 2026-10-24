"use client";

import GameCover from "@/components/ui/GameCover";
import GameRowActions from "@/components/system/GameRowActions";
import type { GameRow, PickModifier } from "@/components/system/gameMaster";

/** 마스터 목록과 IGDB 검색 결과를 같은 줄 모양으로 그린다. 선택 상태는 위에서 들고 있다 */
export default function GameMasterList({
  rows,
  selected,
  onPick,
  onInfo,
  onResync,
  onDelete,
}: {
  rows: GameRow[];
  selected: Set<number>;
  onPick: (gameId: number, mod: PickModifier) => void;
  onInfo: (game: GameRow) => void;
  onResync: (game: GameRow) => void;
  onDelete: (game: GameRow) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((game) => (
        <li
          key={game.gameId ?? `ext-${game.name}-${game.releasedOn}`}
          /*
            행 본문 클릭도 선택이다 — Shift/Ctrl(⌘)는 동그라미가 아니라 행 어디를 눌러도 먹어야
            파일 관리자처럼 느껴진다. 버튼·링크·동그라미는 제 일이 있으니 건너뛴다.
            Shift를 누른 채 누르면 브라우저가 글자 범위를 칠하므로 mousedown에서 막는다
          */
          onMouseDown={(e) => {
            if (e.shiftKey) e.preventDefault();
          }}
          onClick={(e) => {
            if (!game.gameId) return;
            if ((e.target as HTMLElement).closest("button, a, input, label")) return;
            onPick(game.gameId, {
              shift: e.shiftKey,
              toggle: e.ctrlKey || e.metaKey,
              row: true,
            });
          }}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
            game.gameId ? "cursor-pointer" : ""
          } ${
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
                onChange={() => {}}
                onClick={(e) =>
                  onPick(game.gameId!, {
                    shift: e.shiftKey,
                    toggle: e.ctrlKey || e.metaKey,
                    row: false,
                  })
                }
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
