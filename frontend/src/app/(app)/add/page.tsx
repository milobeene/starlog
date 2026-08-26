"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PageHeading from "@/components/ui/PageHeading";
import SearchInput from "@/components/ui/SearchInput";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { coverSrc } from "@/lib/cover";
import { api, ApiError, busyMessage, ERROR, errorMessage } from "@/lib/api";
import type { GameSearchResult } from "@/lib/types";

/** 마스터에 없는 게임은 gameId가 없어 externalId가 유일한 식별자다 */
function keyOf(game: GameSearchResult): string {
  return game.gameId != null ? `g${game.gameId}` : `x${game.externalId}`;
}

/** 되살리기 응답은 에러 본문에 대상 id를 실어 준다 (API 설계서 §3) */
type Revivable = { targetId: number };

/**
 * 게임 검색 → 담기.
 *
 * 검색은 **IGDB 온디맨드**라 느리다 — 로컬에 없으면 외부를 치고 캐시한다.
 * 자격증명이 없으면 502로 끊긴다(로컬 개발이 그렇다).
 *
 * 이미 담은 게임은 409, **삭제했던 게임은 409 REVIVABLE**이다 —
 * 되살리면 예전 회차·취득·메모가 통째로 돌아온다 (§7.4)
 */
export default function AddPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<GameSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [revive, setRevive] = useState<{ name: string; targetId: number } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) return;

    const controller = new AbortController();
    let live = true;
    // 요청 직전에 켠다 — effect 진입 즉시 setState를 부르면 렌더가 한 번 더 돈다
    queueMicrotask(() => {
      if (!live) return;
      setSearching(true);
      setError(null);
    });

    api
      .get<GameSearchResult[]>(`/api/games?q=${encodeURIComponent(debounced)}`, controller.signal)
      .then((data) => {
        setResults(data);
        setSearching(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        /*
         * 429는 서버가 사람이 읽을 문구를 담아 준다 — 붐빔("바로 다시")과
         * 쿼터 소진("자정에")은 대처가 달라서 뭉뚱그리면 안 된다
         */
        setError(
          busyMessage(caught) ??
            (caught instanceof ApiError && caught.status === 502
              ? "게임 정보 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "검색하지 못했습니다. 잠시 후 다시 시도해 주세요."),
        );
        setSearching(false);
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [debounced]);

  const add = async (game: GameSearchResult) => {
    setAdding(keyOf(game));
    setError(null);
    try {
      /*
       * 마스터에 이미 있으면 gameId, IGDB에만 있으면 externalId를 보낸다.
       * 서버가 externalId로 마스터를 만들어 담는다 — 둘 중 하나만 있으면 된다
       */
      const created = await api.post<{ id: number }>("/api/backlog", {
        gameId: game.gameId,
        externalId: game.externalId,
      });
      router.push(`/library/${created.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === ERROR.REVIVABLE) {
        const body = caught.body as Revivable | undefined;
        if (body?.targetId) setRevive({ name: game.name, targetId: body.targetId });
      } else {
        setError(errorMessage(caught, "라이브러리에 담지 못했습니다. 잠시 후 다시 시도해 주세요."));
      }
      setAdding(null);
    }
  };

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 pt-24 pb-16">
        <PageHeading
          eyebrow="Add"
          title="게임 담기"
          subtitle="이름으로 검색하여 라이브러리에 추가하실 수 있습니다."
        />

        <div className="mt-8 flex items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="게임 이름으로 검색…" />
          <Button onClick={() => setManualOpen(true)}>직접 등록</Button>
        </div>

        {error && (
          <div className="mt-5 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="mt-8">
          {searching ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : debounced.length < 2 || results === null ? (
            <EmptyState
              title="두 글자 이상 입력해 주세요"
              hint="라이브러리에 없는 게임은 IGDB에서 조회합니다. 다소 시간이 걸릴 수 있습니다."
            />
          ) : results.length === 0 ? (
            <EmptyState
              title="검색 결과가 없습니다"
              hint="다른 이름으로 검색하시거나 직접 등록해 주세요"
              action={<Button onClick={() => setManualOpen(true)}>직접 등록</Button>}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((game) => (
                <li
                  key={keyOf(game)}
                  className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:border-white/25"
                >
                  <GameThumb game={game} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{game.name}</div>
                    {/* 검색 결과는 거의 전부 IGDB라 출처를 매 줄에 적으면 노이즈다 */}
                    <div className="num text-xs text-white/40">
                      {game.releasedOn ?? "출시일 정보 없음"}
                      {game.source === "MANUAL" && (
                        <span className="font-sans"> · 직접 등록</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    disabled={adding === keyOf(game)}
                    onClick={() => void add(game)}
                  >
                    {adding === keyOf(game) ? "담는 중" : "담기"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {revive && (
        <Modal
          title="이전에 담으셨던 게임입니다"
          width="max-w-md"
          onClose={() => setRevive(null)}
          footer={
            <>
              <Button onClick={() => setRevive(null)}>취소</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await api.post(`/api/backlog/${revive.targetId}/revive`);
                  router.push(`/library/${revive.targetId}`);
                }}
              >
                되살리기
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-white/70">
            <b className="text-white">{revive.name}</b>은(는) 이전에 담았다가 삭제하신 게임입니다.
            <br />
            복구하시면 <b className="text-white">이전 회차·취득·메모가 그대로 복원됩니다.</b>
          </p>
        </Modal>
      )}

      {manualOpen && (
        <ManualGameDialog
          onClose={() => setManualOpen(false)}
          onCreated={(gameId, name) =>
            void add({
              gameId,
              externalId: null,
              name,
              releasedOn: null,
              source: "MANUAL",
              coverImageId: null,
            })
          }
        />
      )}
    </main>
  );
}

/** 검색 결과도 커버 id를 준다 — 개인 커버는 담기 전이라 없다 */
function GameThumb({ game }: { game: GameSearchResult }) {
  const src = coverSrc(null, game.coverImageId, "t_cover_small");
  return src ? (
    <img src={src} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
  ) : (
    <div className="image-placeholder flex h-16 w-12 shrink-0 items-center justify-center rounded text-[9px] text-white/20">
      {game.name.slice(0, 4)}
    </div>
  );
}

/** IGDB에 없는 게임 — 이름만 있으면 만들 수 있다 */
function ManualGameDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (gameId: number, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title="게임 직접 등록"
      width="max-w-md"
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const created = await api.post<{ id: number }>("/api/games", { name: name.trim() });
                onCreated(created.id, name.trim());
                onClose();
              } catch (caught) {
                setError(errorMessage(caught, "등록하지 못했습니다. 잠시 후 다시 시도해 주세요."));
                setBusy(false);
              }
            }}
          >
            등록하고 담기
          </Button>
        </>
      }
    >
      <Field label="Name" hint="등록 후 상세 화면에서 개발사·출시일을 입력하실 수 있습니다">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={300}
          className={FIELD_INPUT}
        />
      </Field>
    </Modal>
  );
}
