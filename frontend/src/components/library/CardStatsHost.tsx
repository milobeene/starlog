"use client";

import { useEffect, useState } from "react";
import StatsDialog from "@/components/detail/StatsDialog";
import { api } from "@/lib/api";
import { closeCardStats, useCardStatsTarget } from "@/lib/cardStats";
import { invalidateQueries } from "@/lib/useApi";
import type { BacklogDetail, PersonalRecord } from "@/lib/types";

/**
 * 카드에서 연 점수·플레이타임 팝업. 카드는 점수·시간·메모를 다 모르므로 **열 때 서버에서 새로 읽는다**
 * (PUT이 세 값을 통째로 받아서, 낡은 메모를 실어 보내면 지운다).
 * 읽는 동안은 아무것도 안 그린다 — 읽기 실패면 조용히 닫는다 (카드 쪽엔 토스트로 알릴 자리가 없다)
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
      .catch(() => alive && closeCardStats());
    return () => {
      alive = false;
      setLoaded(null);
    };
  }, [entryId]);

  if (entryId == null || loaded?.entryId !== entryId) return null;
  return (
    <StatsDialog
      entryId={entryId}
      record={loaded.record}
      onClose={closeCardStats}
      onSaved={invalidateQueries}
    />
  );
}
