"use client";

import DateField from "@/components/ui/DateField";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import GameCover from "@/components/ui/GameCover";
import Pagination from "@/components/ui/Pagination";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { useApi } from "@/lib/useApi";
import { api, errorMessage, qs } from "@/lib/api";
import type {
  AdminGame,
  GameResyncResult,
  GameSearchResult,
  PageResponse,
} from "@/lib/types";

const PAGE_SIZE = 30;

/**
 * 게임 마스터 정리 (FR-ADM-01·02, FR-GAME-05).
 *
 * 기본은 **마스터 전체 목록**이다 (`/api/admin/games`, 30개씩). 검색어는 선택이고,
 * 정렬·필터는 두지 않았다 — 관리자가 여기서 하는 일은 "특정 게임을 찾아 고치기"뿐이다.
 *
 * `IGDB 포함`을 켜면 `/api/games`로 갈아탄다. 그쪽은 외부 검색이라
 * **페이지네이션이 없고 검색어가 필수다** — 그래서 두 목록을 한 화면에서 갈아끼운다
 */
export default function AdminGameMaster() {
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [includeExternal, setIncludeExternal] = useState(false);
  const [page, setPage] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** 병합 원본. 하나를 고른 뒤 다른 행의 "여기로 병합"을 누르면 합쳐진다 */
  const [mergeSource, setMergeSource] = useState<GameRow | null>(null);
  const [dialog, setDialog] = useState<{ kind: "name" | "info"; game: GameRow } | null>(null);

  const masterList = useApi<PageResponse<AdminGame>>(
    includeExternal ? null : `/api/admin/games${qs({ q: keyword, page, size: PAGE_SIZE })}`,
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

  const resync = (game: GameRow) =>
    run("재동기화", async () => {
      const result = await api.post<GameResyncResult>(`/api/admin/games/${game.gameId}/resync`);
      return result.nameChanged
        ? `이름이 바뀌어 ${result.renamedEntries}건에 전파했습니다.`
        : `변경된 정보가 없습니다 (정렬 ${result.reorderedEntries}건 갱신).`;
    });

  const merge = (target: GameRow) =>
    run("병합", async () => {
      const result = await api.post<{ movedEntries: number }>(
        `/api/admin/games/${mergeSource!.gameId}/merge-into/${target.gameId}`,
      );
      setMergeSource(null);
      return `${result.movedEntries}건의 항목을 옮기고 원본을 삭제했습니다.`;
    });

  return (
    <div className="flex flex-col gap-4">
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

      {mergeSource && (
        <div className="flex items-center gap-3 rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-200">
          <span className="flex-1">
            <b className="text-amber-100">{mergeSource.name}</b>을(를) 병합하실 대상을 선택해 주세요. 이
            게임의 항목이 대상으로 옮겨지며 <b className="text-amber-100">원본은 삭제됩니다.</b>
          </span>
          <button
            onClick={() => setMergeSource(null)}
            className="shrink-0 underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            취소
          </button>
        </div>
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
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5"
            >
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
              ) : mergeSource ? (
                mergeSource.gameId === game.gameId ? (
                  <span className="shrink-0 text-xs text-amber-300">병합 원본</span>
                ) : (
                  <button
                    onClick={() => merge(game)}
                    className="shrink-0 text-xs text-amber-300 transition-colors hover:text-amber-200"
                  >
                    여기로 병합
                  </button>
                )
              ) : (
                <div className="flex shrink-0 items-center gap-3 text-xs text-white/40">
                  <button
                    onClick={() => setDialog({ kind: "name", game })}
                    className="transition-colors hover:text-white"
                  >
                    이름
                  </button>
                  <button
                    onClick={() => setDialog({ kind: "info", game })}
                    className="transition-colors hover:text-white"
                  >
                    정보
                  </button>
                  <button
                    onClick={() => resync(game)}
                    className="transition-colors hover:text-white"
                  >
                    재동기화
                  </button>
                  <button
                    onClick={() => setMergeSource(game)}
                    className="transition-colors hover:text-amber-300"
                  >
                    병합
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* IGDB 검색은 외부 호출이라 총 건수를 모른다 — 페이지네이션은 마스터 목록에만 붙는다 */}
      {!includeExternal && masterList.data && (
        <Pagination page={page} totalPages={masterList.data.totalPages} onChange={setPage} />
      )}

      {dialog?.kind === "name" && (
        <NameDialog
          game={dialog.game}
          onClose={() => setDialog(null)}
          onDone={async (message) => {
            await reload();
            setNotice(`이름 수정: ${message}`);
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

/** 마스터 목록과 IGDB 검색 결과를 한 모양으로 합친 표시용 행 */
type GameRow = {
  gameId: number | null;
  name: string;
  source: string;
  releasedOn: string | null;
  coverImageId: string | null;
  lastSyncedAt: string | null;
};

/**
 * 마스터 게임명 수정 (FR-ADM-01).
 *
 * 정보 수정과 엔드포인트가 갈린 이유 — 이름은 담긴 항목의 `displayName`까지 전파해야 해서
 * 파급이 다르고, 실수로 통째 교체될 때의 피해도 크다
 */
function NameDialog({
  game,
  onClose,
  onDone,
}: {
  game: GameRow;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(game.name);

  return (
    <AdminFormDialog
      title="마스터 게임명 수정"
      onClose={onClose}
      onSubmit={async () => {
        const result = await api.put<{ updatedEntries: number }>(
          `/api/admin/games/${game.gameId}/name`,
          { name },
        );
        await onDone(`${result.updatedEntries}건의 항목에 전파했습니다.`);
      }}
    >
      <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
        이름을 직접 덮어쓴 회원의 항목은 <b className="text-white/75">바뀌지 않습니다.</b> 개인
        오버라이드가 마스터보다 우선합니다.
      </p>
      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={300}
          className={FIELD_INPUT}
        />
      </Field>
    </AdminFormDialog>
  );
}

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
        const result = await api.put<{ updatedEntries: number }>(
          `/api/admin/games/${game.gameId}`,
          {
            developers: toList(developers),
            publishers: toList(publishers),
            genres: toList(genres),
            releasedOn: releasedOn || null,
            listPrice: null,
          },
        );
        await onDone(`${result.updatedEntries}건의 항목에 전파했습니다.`);
      }}
    >
      <p className="rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
        <b className="text-amber-100">전체 교체입니다.</b> 비워 두신 칸은 마스터에서 지워집니다.
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
