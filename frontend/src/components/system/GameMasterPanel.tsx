"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Pagination from "@/components/ui/Pagination";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import BulkSyncDialog from "@/components/system/BulkSyncDialog";
import GameMasterInfoDialog from "@/components/system/GameMasterInfoDialog";
import GameMasterList from "@/components/system/GameMasterList";
import { applyPick, type GameRow } from "@/components/system/gameMaster";
import { useApi } from "@/lib/useApi";
import { api, errorMessage, qs } from "@/lib/api";
import { putTask, updateTask } from "@/lib/tasks";
import type {
  GameMaster,
  GameResyncResult,
  GameSearchResult,
  PageResponse,
} from "@/lib/types";


const PAGE_SIZE = 30;

/**
 * 게임 마스터 정리 (FR-ADM-01·02, FR-GAME-05).
 *
 * 기본은 **마스터 전체 목록**이다 (`/api/games/master`, 30개씩). 검색어는 선택이고,
 * 정렬·필터는 두지 않았다 — 관리자가 여기서 하는 일은 "특정 게임을 찾아 고치기"뿐이다.
 *
 * `IGDB 포함`을 켜면 `/api/games`로 갈아탄다. 그쪽은 외부 검색이라
 * **페이지네이션이 없고 검색어가 필수다** — 그래서 두 목록을 한 화면에서 갈아끼운다
 */
export default function GameMasterMaster() {
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [includeExternal, setIncludeExternal] = useState(false);
  const [page, setPage] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** 병합 원본. 하나를 고른 뒤 다른 행의 "여기로 병합"을 누르면 합쳐진다 */
  /* 마스터 삭제는 되돌릴 수 없다 — 확인을 한 번 받는다 (§10-3) */
  const [deleting, setDeleting] = useState<GameRow | null>(null);
  /* 여러 개를 골라 한꺼번에 다루기 (2026-08-28) */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Shift 범위의 기준 — 마지막으로 일반/Ctrl 클릭한 행 */
  const anchor = useRef<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  /** 일괄 동기화 — 대상을 먼저 보여주고 승인을 받는다 (§10-2) */
  const [syncDialog, setSyncDialog] = useState<{ scope?: "selected" } | null>(null);
  /** 중단 신호. 루프가 매 바퀴 확인한다 — 되돌릴 게 없어서 그냥 멈추면 된다 */
  const abort = useRef(false);
  const [dialog, setDialog] = useState<{ kind: "info"; game: GameRow } | null>(null);

  const masterList = useApi<PageResponse<GameMaster>>(
    includeExternal ? null : `/api/games/master${qs({ q: keyword, page, size: PAGE_SIZE })}`,
  );
  const externalList = useApi<GameSearchResult[]>(
    includeExternal && keyword ? `/api/games${qs({ q: keyword })}` : null,
  );

  const rows: GameRow[] = includeExternal
    ? (externalList.data ?? []).map((game) => ({
        gameId: game.gameId,
        name: game.name,
        source: game.source,
        releasedOn: game.releasedOn,
        coverImageId: game.coverImageId,
        lastSyncedAt: null,
      }))
    : (masterList.data?.items ?? []).map((game) => ({ ...game, gameId: game.gameId as number | null }));

  const active = includeExternal ? externalList : masterList;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(0);
    setKeyword(draft.trim());
  };

  const reload = async () => {
    if (includeExternal) externalList.reload();
    else masterList.reload();
  };

  /**
   * 액션 실행 → 목록 갱신 → 결과 알림.
   * 알림을 먼저 세우면 갱신 과정에서 지워질 수 있어 순서를 지킨다
   */
  const run = async (label: string, action: () => Promise<string>) => {
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      await reload();
      setNotice(`${label}: ${message}`);
    } catch (caught) {
      setError(errorMessage(caught, `${label}에 실패했습니다.`));
    }
  };

  /** 단건도 외부 호출이라 몇 초 걸린다 — 결과를 알림으로 남겨 화면을 옮겨도 보이게 한다 */
  const resync = async (game: GameRow) => {
    putTask({
      id: "resync",
      kind: "resync",
      title: `${game.name} 동기화 중`,
      progress: { done: 0, total: 0 },
    });
    try {
      const result = await api.post<GameResyncResult>(`/api/games/${game.gameId}/resync`);
      updateTask("resync", {
        title: `${game.name} 동기화 완료`,
        progress: undefined,
        result: {
          ok: true,
          message: result.nameChanged
            ? `이름이 바뀌어 ${result.renamedEntries}건에 전파했습니다.`
            : `변경된 정보가 없습니다 (정렬 ${result.reorderedEntries}건 갱신).`,
        },
      });
      masterList.reload();
    } catch (caught) {
      updateTask("resync", {
        title: `${game.name} 동기화 실패`,
        progress: undefined,
        result: { ok: false, message: errorMessage(caught, "동기화하지 못했습니다.") },
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/*
        일괄 동기화 (§10-2). **먼저 목록을 보여주고 승인을 받는다** — 곧장 돌리면
        몇 개가 얼마나 걸릴지 모른 채 IGDB를 수십 번 두드리게 된다.
        진행률은 따로 저장하지 않는다: `lastSyncedAt`이 이미 상태라 다시 물어보면 남은 것만 나온다
      */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setSyncDialog({})}>일괄 동기화</Button>
        {selected.size > 0 && (
          <>
            <span className="text-xs text-white/40">{selected.size}개 선택</span>
            {/*
              선택 동기화 (2026-08-29). '일괄 동기화'는 **오래된 것 전부**를 잡지만,
              고른 것만 돌리고 싶을 때가 있다 — 방금 고친 몇 개를 다시 받아오는 경우다.
              같은 진행 표시(bulk-sync)를 쓴다: 사용자에겐 같은 종류의 일이다
            */}
            <Button onClick={() => setSyncDialog({ scope: "selected" })}>
              선택 동기화
            </Button>
            <Button variant="danger" onClick={() => setBulkDeleting(true)}>
              선택 삭제
            </Button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-[11px] text-white/35 underline underline-offset-2 hover:text-white"
            >
              선택 해제
            </button>
          </>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            includeExternal
              ? "게임명을 입력해 주세요 (IGDB 검색에는 필수입니다)"
              : "게임명 · 비워 두시면 전체를 보여 드립니다"
          }
          className={`${FIELD_INPUT} min-w-52 flex-1`}
        />
        <Button type="submit" variant="primary">
          검색
        </Button>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={includeExternal}
            onChange={(event) => {
              setIncludeExternal(event.target.checked);
              setPage(0);
            }}
            className="accent-white"
          />
          마스터에 없는 게임 포함
        </label>
      </form>

      {includeExternal && !keyword && (
        <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/45">
          IGDB까지 함께 찾으려면 검색어를 입력해 주세요. 외부 검색이라 전체 목록은 받을 수 없습니다.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </div>
      )}

      {active.error ? (
        <ErrorNotice error={active.error} onRetry={reload} />
      ) : active.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/30">
          {includeExternal && !keyword ? "검색어를 입력해 주세요" : "등록된 게임이 없습니다"}
        </p>
      ) : (
        <>
          <p className="-mb-2 text-[11px] text-white/30">
            행을 눌러 선택 · Shift로 범위 · Ctrl(⌘)로 하나씩 켜고 끄기
          </p>
          <GameMasterList
            rows={rows}
            selected={selected}
            onPick={(gameId, mod) => {
              const order = rows.flatMap((row) => (row.gameId != null ? [row.gameId] : []));
              const result = applyPick(selected, order, anchor.current, gameId, mod);
              anchor.current = result.anchor;
              setSelected(result.next);
            }}
            onInfo={(game) => setDialog({ kind: "info", game })}
            onResync={resync}
            onDelete={setDeleting}
          />
        </>
      )}

      {/* IGDB 검색은 외부 호출이라 총 건수를 모른다 — 페이지네이션은 마스터 목록에만 붙는다 */}
      {!includeExternal && masterList.data && (
        <Pagination page={page} totalPages={masterList.data.totalPages} onChange={setPage} />
      )}

      {/*
        일괄 동기화 승인 (§10-2). 대상 목록을 먼저 보여준다 —
        "몇 개를 얼마나 오래" 돌릴지 모르고 시작하면 중간에 끊고 싶어진다
      */}
      {syncDialog && (
        <BulkSyncDialog
          selectedIds={[...selected]}
          initialScope={syncDialog.scope}
          abort={abort}
          onClose={() => setSyncDialog(null)}
          onDone={() => masterList.reload()}
        />
      )}

      {bulkDeleting && (
        <ConfirmDialog
          title="선택한 마스터 삭제"
          message={`${selected.size}개를 완전히 지웁니다. 담겨 있는 기록(평점·메모·회차·취득)도 함께 사라지며 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          onClose={() => setBulkDeleting(false)}
          onConfirm={async () => {
            setBulkDeleting(false);
            let removed = 0;
            for (const id of selected) {
              try {
                await api.del(`/api/games/${id}`);
                removed += 1;
              } catch {
                // 한 건이 실패해도 나머지는 계속
              }
            }
            setSelected(new Set());
            setNotice(`${removed}개를 삭제했습니다.`);
            masterList.reload();
          }}
        />
      )}

      {/*
        마스터 삭제 (§10-3). **휴지통을 안 거친다** — 마스터를 지우는 건 "이 게임 자체를
        없앤다"는 뜻이라 항목만 휴지통에 남기면 되살릴 마스터가 없어 앞뒤가 안 맞는다.
        중복 방지가 있어 참조는 0건 아니면 1건이므로 "누가 쓰고 있나"를 물을 필요가 없다
      */}
      {deleting && (
        <ConfirmDialog
          title="마스터 게임 삭제"
          message={`${deleting.name}을(를) 완전히 지웁니다. 이 게임의 기록(평점·메모·회차·취득)도 함께 사라지며 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const target = deleting;
            setDeleting(null);
            await run("삭제", async () => {
              const result = await api.del<{ deletedEntries: number }>(
                `/api/games/${target.gameId}`,
              );
              return result.deletedEntries > 0
                ? `삭제했습니다. 담겨 있던 기록 ${result.deletedEntries}건도 함께 지워졌습니다.`
                : "삭제했습니다.";
            });
          }}
        />
      )}

      {dialog?.kind === "info" && (
        <GameMasterInfoDialog
          game={dialog.game}
          onClose={() => setDialog(null)}
          onDone={async (message) => {
            await reload();
            setNotice(`정보 수정: ${message}`);
          }}
        />
      )}
    </div>
  );
}
