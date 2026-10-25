"use client";

import { useEffect, useState } from "react";
import StatsDialog from "@/components/detail/StatsDialog";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { closeCardStats, useCardStatsTarget } from "@/lib/cardStats";
import { invalidateQueries } from "@/lib/useApi";
import { putTask } from "@/lib/tasks";
import type { BacklogDetail, PersonalRecord } from "@/lib/types";

/**
 * 카드에서 연 점수·플레이타임 팝업. 카드는 점수·시간·메모를 다 모르므로 **열 때 서버에서 새로 읽는다**
 * (PUT이 세 값을 통째로 받아서, 낡은 메모를 실어 보내면 지운다).
 * 읽는 동안은 **같은 팝업 틀에 임시 상자**를 먼저 띄운다 — 클라우드(Neon)면 읽기에 한참 걸려
 * 아무것도 안 뜨면 메뉴가 안 먹은 줄 안다. 읽기에 실패하면 닫고 토스트로 알린다
 */
export default function CardStatsHost() {
  const entryId = useCardStatsTarget();
  const [loaded, setLoaded] = useState<{ entryId: number; record: PersonalRecord } | null>(null);

  useEffect(() => {
    if (entryId == null) return;
    let alive = true;
    api
      .get<BacklogDetail>(`/api/backlog/${entryId}`)
      .then((d) => alive && setLoaded({ entryId, record: d.personalRecord }))
      .catch(() => {
        if (!alive) return;
        closeCardStats();
        putTask({ id: "card-stats", kind: "quick-play", title: "점수·플레이타임을 불러오지 못했습니다", result: { ok: false } });
      });
    return () => {
      alive = false;
      setLoaded(null);
    };
  }, [entryId]);

  if (entryId == null) return null;
  if (loaded?.entryId !== entryId) {
    return (
      <Modal title="점수 · 플레이타임" onClose={closeCardStats} footer={<Button onClick={closeCardStats}>취소</Button>}>
        <div className="flex flex-col gap-5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-3 w-20 skeleton-sweep rounded bg-white/[0.06]" />
              <div className="h-10 skeleton-sweep rounded-md bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </Modal>
    );
  }
  return (
    <StatsDialog
      entryId={entryId}
      record={loaded.record}
      onClose={closeCardStats}
      onSaved={invalidateQueries}
    />
  );
}
