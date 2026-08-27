"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SettingsSection from "./SettingsSection";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
import Chip from "@/components/ui/Chip";
import { Button } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { coverSrc } from "@/lib/cover";
import { formatRating } from "@/lib/labels";
import { api, errorMessage } from "@/lib/api";
import { invalidateQueries, useApi } from "@/lib/useApi";
import type { DeletedEntry, DeletedEntryDetail, PageResponse } from "@/lib/types";
import { formatHours } from "@/lib/format";

const PAGE_SIZE = 10;

/**
 * 삭제한 게임 — 되살리기와 완전 삭제 (§7.4).
 *
 * **되살리기 자체는 예전부터 있었다.** 다만 들어가는 문이 담기 화면 하나뿐이라 —
 * 같은 게임을 다시 담으려 할 때만 "되살릴까요"가 떴다 — 사용자 눈에는 되돌릴 방법이
 * 없어 보였다. 이 목록이 문을 하나 더 낸다.
 *
 * 삭제한 게 없으면 섹션을 통째로 안 그린다. 늘 비어 있는 칸은 설정 화면만 길게 만든다
 */
export default function DeletedEntriesSection() {
  const [page, setPage] = useState(0);
  const deleted = useApi<PageResponse<DeletedEntry>>(
    `/api/backlog/deleted?page=${page}&size=${PAGE_SIZE}`,
  );
  const [preview, setPreview] = useState<DeletedEntry | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // `loading ||`을 빼야 완전 삭제 직후 섹션이 통째로 깜빡 사라지지 않는다
  if (!deleted.data) return null;
  if (deleted.data.totalElements === 0) return null;

  const revive = async (entryId: number) => {
    setBusy(entryId);
    setError(null);
    try {
      await api.post(`/api/backlog/${entryId}/revive`);
      invalidateQueries();   // 사이드바·파셋·이 목록이 전부 바뀐다
      router.push(`/library/detail?entry=${entryId}`);
    } catch (caught) {
      setError(errorMessage(caught, "되살리지 못했습니다."));
      setBusy(null);
    }
  };

  const purge = async (entryId: number) => {
    setBusy(entryId);
    setError(null);
    try {
      await api.del(`/api/backlog/deleted/${entryId}`);
      setPreview(null);
      /*
       * 마지막 항목을 지우면 이 페이지가 빈다 — 한 장 앞으로 물러선다.
       * 안 그러면 "3페이지"에 머문 채 아무것도 안 보인다
       */
      const lastOnPage = deleted.data!.items.length === 1 && page > 0;
      if (lastOnPage) setPage(page - 1);
      invalidateQueries();
    } catch (caught) {
      setError(errorMessage(caught, "지우지 못했습니다."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection
      title="삭제한 게임"
      icon="note"
      description="삭제하신 게임은 기한 없이 보관됩니다. 되살리시면 예전 회차·취득·평점·메모가 그대로 돌아옵니다."
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <ul className="flex flex-col gap-2">
        {deleted.data.items.map((entry) => (
          <li
            key={entry.entryId}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
          >
            {/* 이름을 눌러 미리보기를 연다 — 되돌릴 수 없는 버튼 옆이라 확인 경로가 필요하다 */}
            <button
              type="button"
              onClick={() => setPreview(entry)}
              className="min-w-0 flex-1 truncate text-left text-sm transition-colors hover:text-white hover:underline"
              title={entry.displayName}
            >
              {entry.displayName}
            </button>
            <span className="num shrink-0 text-xs text-white/30">
              {entry.deletedAt.slice(0, 10)}
            </span>
            <Button onClick={() => revive(entry.entryId)} disabled={busy === entry.entryId}>
              {busy === entry.entryId ? "처리 중" : "되살리기"}
            </Button>
          </li>
        ))}
      </ul>

      {deleted.data.totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={deleted.data.totalPages} onChange={setPage} />
        </div>
      )}

      {preview && (
        <PreviewDialog
          entry={preview}
          onClose={() => setPreview(null)}
          onRevive={() => revive(preview.entryId)}
          onPurge={() => purge(preview.entryId)}
          busy={busy === preview.entryId}
          error={error}
        />
      )}
    </SettingsSection>
  );
}

/**
 * 미리보기 + 완전 삭제.
 *
 * **완전 삭제는 한 번 더 묻는다.** 되살리기와 달리 되돌릴 수 없어서, 같은 창의 같은 자리에서
 * 한 번에 눌리면 안 된다. 첫 클릭은 "정말 지울까요"로 바뀌기만 한다
 */
function PreviewDialog({
  entry,
  onClose,
  onRevive,
  onPurge,
  busy,
  error,
}: {
  entry: DeletedEntry;
  onClose: () => void;
  onRevive: () => void;
  onPurge: () => void;
  busy: boolean;
  error: string | null;
}) {
  const detail = useApi<DeletedEntryDetail>(`/api/backlog/deleted/${entry.entryId}`);
  const [confirming, setConfirming] = useState(false);

  const cover = detail.data ? coverSrc(null, detail.data.coverImageId, "t_cover_small") : null;

  return (
    <Modal
      title={entry.displayName}
      onClose={onClose}
      footer={
        <>
          {/* 실패 문구를 모달 안에 그린다 — 섹션 상단에 그리면 백드롭 아래라 안 보인다 */}
          {error ? (
            <span className="mr-auto text-xs text-red-400">{error}</span>
          ) : confirming ? (
            <span className="mr-auto text-xs text-red-400">
              되돌릴 수 없습니다. 회차·취득·메모가 함께 사라집니다.
            </span>
          ) : (
            <span className="mr-auto text-xs text-white/30">
              {entry.deletedAt.slice(0, 10)}에 삭제하셨습니다
            </span>
          )}

          <Button
            variant="danger"
            disabled={busy || detail.error !== null}
            onClick={() => (confirming ? onPurge() : setConfirming(true))}
          >
            {busy ? "지우는 중" : confirming ? "정말 지웁니다" : "완전 삭제"}
          </Button>
          <Button variant="primary" disabled={busy || detail.error !== null} onClick={onRevive}>
            되살리기
          </Button>
        </>
      }
    >
      {detail.error ? (
        /*
         * useApi는 실패하면 `{data: null, loading: false}`가 된다 — error를 안 보면
         * **스켈레톤 분기에 영영 갇힌다.** 다른 탭에서 이미 되살렸거나 지운 항목을 열면 그렇게 된다
         */
        <p className="py-6 text-center text-sm text-red-400">
          불러오지 못했습니다. 목록이 오래되었을 수 있습니다.
        </p>
      ) : !detail.data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            {cover ? (
              <img src={cover} alt="" className="h-28 w-21 shrink-0 rounded object-cover" />
            ) : (
              <div className="image-placeholder h-28 w-21 shrink-0 rounded" />
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
              <Stat label="평점" value={detail.data.rating === null ? "—" : `★ ${formatRating(detail.data.rating)}`} />
              <Stat label="플레이 시간" value={detail.data.playTimeHours === null ? "—" : `${formatHours(detail.data.playTimeHours)}시간`} />
              {/* 되살리면 통째로 돌아온다 — 몇 개나 딸려 있었나가 판단 기준이다 */}
              <Stat label="회차 / 취득" value={`${detail.data.playthroughCount} / ${detail.data.acquisitionCount}`} />
              <Stat label="담은 날" value={detail.data.createdAt.slice(0, 10)} />
            </div>
          </div>

          {detail.data.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {detail.data.genres.map((genre) => (
                <Chip key={genre} label={genre} rounded />
              ))}
            </div>
          )}

          {detail.data.memo && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div className="markdown text-xs leading-relaxed font-light text-white/70">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.data.memo}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-white/35">{label}</span>
      <span className="num text-white/80">{value}</span>
    </div>
  );
}
