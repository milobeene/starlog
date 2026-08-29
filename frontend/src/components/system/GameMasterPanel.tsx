"use client";

import DateField from "@/components/ui/DateField";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import GameCover from "@/components/ui/GameCover";
import Pagination from "@/components/ui/Pagination";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
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
  const [bulkDeleting, setBulkDeleting] = useState(false);
  /** 일괄 동기화 — 대상을 먼저 보여주고 승인을 받는다 (§10-2) */
  const [syncTargets, setSyncTargets] = useState<GameMaster[] | null>(null);
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
        <Button
          onClick={async () => {
            setSyncTargets(await api.get<GameMaster[]>("/api/games/outdated"));
          }}
        >
          일괄 동기화
        </Button>
        {selected.size > 0 && (
          <>
            <span className="text-xs text-white/40">{selected.size}개 선택</span>
            {/*
              선택 동기화 (2026-08-29). '일괄 동기화'는 **오래된 것 전부**를 잡지만,
              고른 것만 돌리고 싶을 때가 있다 — 방금 고친 몇 개를 다시 받아오는 경우다.
              같은 진행 표시(bulk-sync)를 쓴다: 사용자에겐 같은 종류의 일이다
            */}
            <Button
              onClick={() =>
                setSyncTargets(
                  rows.filter(
                    (row) =>
                      row.gameId != null &&
                      selected.has(row.gameId) &&
                      row.source !== "MANUAL",
                  ) as GameMaster[],
                )
              }
            >
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
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(game.gameId!);
                        else next.delete(game.gameId!);
                        return next;
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
                <RowActions
                  game={game}
                  onInfo={() => setDialog({ kind: "info", game })}
                  onResync={() => resync(game)}
                  onDelete={() => setDeleting(game)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* IGDB 검색은 외부 호출이라 총 건수를 모른다 — 페이지네이션은 마스터 목록에만 붙는다 */}
      {!includeExternal && masterList.data && (
        <Pagination page={page} totalPages={masterList.data.totalPages} onChange={setPage} />
      )}

      {/*
        일괄 동기화 승인 (§10-2). 대상 목록을 먼저 보여준다 —
        "몇 개를 얼마나 오래" 돌릴지 모르고 시작하면 중간에 끊고 싶어진다
      */}
      {syncTargets && (
        <ConfirmDialog
          title="일괄 동기화"
          confirmLabel={syncTargets.length > 0 ? "동기화" : "확인"}
          message={
            syncTargets.length === 0 ? (
              "동기화할 게임이 없습니다. 3개월이 지난 IGDB 게임만 대상입니다."
            ) : (
              <>
                마지막 동기화가 3개월이 지난 <b className="text-white">{syncTargets.length}개</b>를
                최신 정보로 갱신합니다. 한 건씩 차례로 부르므로 시간이 걸립니다.
                <span className="mt-3 block max-h-40 overflow-y-auto rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-white/50">
                  {syncTargets.map((g) => g.name).join(" · ")}
                </span>
                <span className="mt-2 block text-[11px] text-white/30">
                  중간에 닫으셔도 됩니다. 다시 누르면 남은 것만 다시 잡힙니다.
                </span>
              </>
            )
          }
          onClose={() => setSyncTargets(null)}
          onConfirm={async () => {
            const targets = syncTargets;
            setSyncTargets(null);
            if (targets.length === 0) return;

            /*
             * **알림으로 옮겼다** (2026-08-28). 예전엔 여기 상태에 진행을 담았는데,
             * 다른 탭으로 옮기면 이 컴포넌트가 언마운트되어 **UI만 사라지고 동기화는 계속** 돌았다.
             * 사용자는 멈춘 줄 알고 또 누른다. 알림은 껍데기에 붙어 있어 화면을 넘어 산다
             */
            abort.current = false;
            const put = (done: number, label: string) =>
              putTask({
                id: "bulk-sync",
                kind: "bulk-sync",
                title: "게임 마스터 일괄 동기화",
                progress: { done, total: targets.length, label },
                onAbort: () => {
                  abort.current = true;
                },
              });

            put(0, targets[0].name);
            let synced = 0;
            let done = 0;

            /*
             * ⚠️ **응답을 기다리지 않고 0.3초마다 쏜다** (2026-08-29).
             *
             * 예전엔 한 건이 끝나길 기다렸다가 0.3초를 더 쉬었다. IGDB 응답이 1초면
             * 한 건에 1.3초라 100개에 2분이 넘었다. 지금은 전체 시간이 **건수 × 0.3초**로
             * 고정된다 — 응답 속도와 무관해진다.
             *
             * **동시 실행 수를 제한하는 방식은 안 쓴다.** IGDB 한도는 "동시 4개"가 아니라
             * **초당 4회**다. 동시 4개로 돌리면 응답이 빠를 때 초당 수십 번이 나간다 —
             * 동시 실행 수는 발사 속도를 전혀 안 막는다. 간격을 재는 쪽이 한도와 같은 단위다
             */
            const flights = targets.map(
              (game, i) =>
                new Promise<void>((resolve) => {
                  setTimeout(async () => {
                    if (abort.current) return resolve();
                    try {
                      await api.post(`/api/games/${game.gameId}/resync`);
                      synced += 1;
                    } catch {
                      // 한 건이 실패해도 나머지는 돈다 — 다시 누르면 그것만 다시 잡힌다
                    }
                    done += 1;
                    put(done, game.name);
                    resolve();
                  }, i * 300);
                }),
            );
            await Promise.all(flights);

            updateTask("bulk-sync", {
              title: abort.current ? "일괄 동기화 중단됨" : "일괄 동기화 완료",
              progress: undefined,
              onAbort: undefined,
              result: {
                ok: !abort.current,
                message: `${targets.length}개 중 ${synced}개를 갱신했습니다.`
                  + (abort.current ? " 다시 누르시면 남은 것만 다시 잡힙니다." : ""),
              },
            });
            masterList.reload();
          }}
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
        <InfoDialog
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

/**
 * 행의 액션 — **좁아지면 `…` 하나로 접힌다** (2026-08-29).
 *
 * 버튼 셋이 가로로 붙어 있으면 좁은 폭에서 게임 이름을 밀어낸다.
 *
 * ⚠️ 기준은 **`sm`(640px)**이다 — 헤더의 프로필이 아이콘이 되는 바로 그 폭
 * (`AppHeader`의 닉네임이 `sm:inline`, 사람 아이콘이 `sm:hidden`).
 * 처음엔 `lg`(1024px)로 잡았는데 **노트북 폭에서 이미 접혀** 있었다.
 * 화면 곳곳이 제각각 접히면 "지금 좁은 화면인가"가 안 읽힌다.
 *
 * 팝오버는 바깥 클릭으로 닫는다. 스크롤로는 안 닫는다 — 목록이 길어 스크롤하다
 * 닫히면 다시 열어야 해서 성가시다
 */
function RowActions({
  game,
  onInfo,
  onResync,
  onDelete,
}: {
  game: GameRow;
  onInfo: () => void;
  onResync: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  /* MANUAL은 원본이 없어 재동기화가 뜻이 없다 (§10-4). **백엔드의 400은 그대로 둔다** */
  const items = (
    <>
      <ActionItem onClick={onInfo}>정보</ActionItem>
      {game.source !== "MANUAL" && <ActionItem onClick={onResync}>재동기화</ActionItem>}
      <ActionItem onClick={onDelete} danger>
        삭제
      </ActionItem>
    </>
  );

  return (
    <div ref={box} className="relative shrink-0">
      {/* 넓을 때 — 가로로 편다 */}
      <div className="hidden items-center gap-3 text-xs text-white/40 sm:flex">{items}</div>

      {/* 좁을 때 — 점 셋 */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="작업"
        className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 flex min-w-28 flex-col gap-1 rounded-lg border border-white/10 bg-neutral-900 p-1.5 text-xs shadow-xl sm:hidden"
          onClick={() => setOpen(false)}
        >
          {items}
        </div>
      )}
    </div>
  );
}

function ActionItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-left transition-colors hover:bg-white/10 sm:px-0 sm:py-0 sm:hover:bg-transparent ${
        danger ? "hover:text-red-400" : "hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/** 마스터 목록과 IGDB 검색 결과를 한 모양으로 합친 표시용 행 */
type GameRow = {
  gameId: number | null;
  name: string;
  source: string;
  releasedOn: string | null;
  coverImageId: string | null;
  lastSyncedAt: string | null;
};

/** 마스터 정보 수정 (FR-ADM-01). **전체 교체** — 비운 칸은 지워진다 */
function InfoDialog({
  game,
  onClose,
  onDone,
}: {
  game: GameRow;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [developers, setDevelopers] = useState("");
  const [publishers, setPublishers] = useState("");
  const [genres, setGenres] = useState("");
  const [releasedOn, setReleasedOn] = useState(game.releasedOn ?? "");
  /*
   * 이름을 여기로 합쳤다 (2026-08-29). 버튼이 둘이면 "이름을 고치려면 어느 쪽이지"가 생긴다.
   *
   * ⚠️ **엔드포인트는 여전히 둘이다.** 이름은 담긴 항목의 displayName까지 전파해서
   * 파급이 다르다 — 합친 것은 화면이지 API가 아니다. 바뀐 것만 부른다
   */
  const [name, setName] = useState(game.name);

  const toList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return (
    <AdminFormDialog
      title="마스터 정보 수정"
      onClose={onClose}
      onSubmit={async () => {
        let propagated = 0;
        // 이름을 먼저 — 실패하면 정보까지 바꾸지 않는다. 반쯤 반영된 상태가 제일 나쁘다
        if (name.trim() !== game.name) {
          const renamed = await api.put<{ updatedEntries: number }>(
            `/api/games/${game.gameId}/name`,
            { name: name.trim() },
          );
          propagated += renamed.updatedEntries;
        }
        const result = await api.put<{ updatedEntries: number }>(
          `/api/games/${game.gameId}`,
          {
            developers: toList(developers),
            publishers: toList(publishers),
            genres: toList(genres),
            releasedOn: releasedOn || null,
            listPrice: null,
          },
        );
        propagated += result.updatedEntries;
        await onDone(`${propagated}건의 항목에 전파했습니다.`);
      }}
    >
      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={300}
          className={FIELD_INPUT}
        />
      </Field>
      <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
        이름을 직접 덮어쓴 회원의 항목은 <b className="text-white/75">바뀌지 않습니다.</b> 개인
        오버라이드가 마스터보다 우선합니다.
      </p>

      <p className="rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
        <b className="text-amber-100">아래 셋은 전체 교체입니다.</b> 비워 두신 칸은 마스터에서 지워집니다.
        현재 값을 유지하시려면 그대로 다시 입력해 주세요.
      </p>
      <Field label="Developers" hint="쉼표로 구분">
        <input
          value={developers}
          onChange={(event) => setDevelopers(event.target.value)}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Publishers" hint="쉼표로 구분">
        <input
          value={publishers}
          onChange={(event) => setPublishers(event.target.value)}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Genres" hint="쉼표로 구분">
        <input
          value={genres}
          onChange={(event) => setGenres(event.target.value)}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Released On" composite>
        <DateField value={releasedOn} onChange={setReleasedOn} />
      </Field>
    </AdminFormDialog>
  );
}

/** 설정 화면의 FormDialog와 같은 모양. 저장·에러 처리를 한곳에 모은다 */
function AdminFormDialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit();
                onClose();
              } catch (caught) {
                setError(errorMessage(caught, "저장하지 못했습니다."));
                setBusy(false);
              }
            }}
          >
            {busy ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Modal>
  );
}
