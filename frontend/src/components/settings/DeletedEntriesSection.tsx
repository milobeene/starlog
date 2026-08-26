"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SettingsSection from "./SettingsSection";
import { Button } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { invalidateQueries, useApi } from "@/lib/useApi";
import type { DeletedEntry } from "@/lib/types";

/**
 * 삭제한 게임 되살리기 (§7.4).
 *
 * **되살리기 자체는 예전부터 있었다.** 다만 들어가는 문이 담기 화면 하나뿐이라 —
 * 같은 게임을 다시 담으려 할 때만 "되살릴까요"가 떴다 — 사용자 눈에는 되돌릴 방법이
 * 없어 보였다. 이 목록이 문을 하나 더 낸다.
 *
 * 삭제한 게 없으면 섹션을 통째로 안 그린다. 늘 비어 있는 칸은 설정 화면만 길게 만든다
 */
export default function DeletedEntriesSection() {
  const deleted = useApi<DeletedEntry[]>("/api/backlog/deleted");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (deleted.loading || !deleted.data || deleted.data.length === 0) return null;

  const revive = async (entry: DeletedEntry) => {
    setBusy(entry.entryId);
    setError(null);
    try {
      await api.post(`/api/backlog/${entry.entryId}/revive`);
      // 되살리면 사이드바·파셋·목록이 전부 바뀐다. 이 목록도 여기 포함된다
      invalidateQueries();
      router.push(`/library/${entry.entryId}`);
    } catch (caught) {
      setError(errorMessage(caught, "되살리지 못했습니다."));
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
        {deleted.data.map((entry) => (
          <li
            key={entry.entryId}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
          >
            <span className="min-w-0 flex-1 truncate text-sm" title={entry.displayName}>
              {entry.displayName}
            </span>
            <span className="num shrink-0 text-xs text-white/30">
              {entry.deletedAt.slice(0, 10)}
            </span>
            <Button onClick={() => revive(entry)} disabled={busy === entry.entryId}>
              {busy === entry.entryId ? "되살리는 중" : "되살리기"}
            </Button>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
