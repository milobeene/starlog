"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Field";
import {
  estimateSyncSeconds,
  formatSyncEstimate,
  runBulkSync,
} from "@/components/system/bulkSync";
import { api, qs } from "@/lib/api";
import type { GameMaster, PageResponse } from "@/lib/types";

type Scope = "outdated" | "selected" | "all";

/** 마스터 전체를 100개씩 끌어온다 — 서버 상한이 100이다 */
async function fetchAllMasters(): Promise<GameMaster[]> {
  const all: GameMaster[] = [];
  for (let page = 0; ; page += 1) {
    const result = await api.get<PageResponse<GameMaster>>(
      `/api/games/master${qs({ page, size: 100 })}`,
    );
    all.push(...result.items);
    if (page + 1 >= result.totalPages) return all;
  }
}

/**
 * 일괄 동기화 승인 (§10-2). 대상 목록과 **예상 시간**을 먼저 보여준다 —
 * "몇 개를 얼마나 오래" 돌릴지 모르고 시작하면 중간에 끊고 싶어진다.
 *
 * 대상은 셋 중 고른다. 3개월 지난 게임이 없어도 `선택`·`전체`로 **강제 실행**할 수 있다.
 * (수동 등록은 원본이 없어 어느 쪽에서도 뺀다)
 *
 * `abort`는 부모가 들고 있다 — 이 다이얼로그는 승인 직후 닫히지만 동기화는 계속 도는데,
 * 알림의 [중단]이 그 ref를 건드려야 하기 때문이다
 */
export default function BulkSyncDialog({
  selectedIds,
  initialScope,
  abort,
  onClose,
  onDone,
}: {
  /** 목록에서 고른 마스터 번호 — 다른 페이지에서 고른 것도 들어 있다 */
  selectedIds: number[];
  initialScope?: Scope;
  abort: MutableRefObject<boolean>;
  onClose: () => void;
  /** 동기화가 끝난 뒤 목록을 새로 읽는다 */
  onDone: () => void;
}) {
  const [outdated, setOutdated] = useState<GameMaster[] | null>(null);
  const [all, setAll] = useState<GameMaster[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Scope | null>(initialScope ?? null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.get<GameMaster[]>("/api/games/outdated"), fetchAllMasters()])
      .then(([old, everything]) => {
        if (!alive) return;
        setOutdated(old);
        setAll(everything.filter((game) => game.source !== "MANUAL"));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const targets = useMemo<Record<Scope, GameMaster[]> | null>(() => {
    if (!outdated || !all) return null;
    const ids = new Set(selectedIds);
    return { outdated, selected: all.filter((game) => ids.has(game.gameId)), all };
  }, [outdated, all, selectedIds]);

  /* 고르기 전의 기본값 — 오래된 게 있으면 그것, 없으면 고른 것, 그것도 없으면 전체 */
  const scope: Scope | null = !targets
    ? null
    : (picked ??
      (targets.outdated.length > 0 ? "outdated" : targets.selected.length > 0 ? "selected" : "all"));
  const current = targets && scope ? targets[scope] : [];
  const forced = scope !== null && scope !== "outdated";

  const options: { value: Scope; label: string; hint: string }[] = [
    { value: "outdated", label: "3개월 지난 게임", hint: "마지막 동기화가 3개월 넘었거나 한 번도 안 한 것" },
    { value: "selected", label: "선택한 게임", hint: "강제 실행 — 최근에 맞췄어도 다시 받아옵니다" },
    { value: "all", label: "전체", hint: "강제 실행 — 외부 DB에서 가져온 모든 게임" },
  ];

  return (
    <Modal
      title="일괄 동기화"
      width="max-w-md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={current.length === 0}
            onClick={async () => {
              const list = current;
              onClose();
              await runBulkSync(list, abort);
              onDone();
            }}
          >
            {forced ? "강제 동기화" : "동기화"}
          </Button>
        </>
      }
    >
      {failed ? (
        <p className="text-sm text-red-300/90">대상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      ) : !targets ? (
        <p className="text-sm text-white/45">대상을 찾는 중…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" className="flex flex-col gap-1.5">
            {options.map((option) => {
              const count = targets[option.value].length;
              const disabled = count === 0;
              return (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                  } ${
                    scope === option.value
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
                  }`}
                >
                  <input
                    type="radio"
                    name="sync-scope"
                    checked={scope === option.value}
                    disabled={disabled}
                    onChange={() => setPicked(option.value)}
                    className="mt-1 accent-white"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3 text-sm text-white/85">
                      {option.label}
                      <span className="num text-xs text-white/50">{count.toLocaleString()}개</span>
                    </span>
                    <span className="block text-[11px] text-white/35">{option.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {current.length === 0 ? (
            <p className="text-xs text-white/40">동기화할 게임이 없습니다.</p>
          ) : (
            <>
              <p className="text-sm text-white/70">
                {current.length.toLocaleString()}개를 한 건씩 차례로 부릅니다 · 예상{" "}
                <b className="num text-white">
                  {formatSyncEstimate(estimateSyncSeconds(current.length))}
                </b>
              </p>
              <span className="block max-h-32 overflow-y-auto rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-white/50">
                {current.map((game) => game.name).join(" · ")}
              </span>
              <p className="text-[11px] text-white/30">
                외부 DB의 초당 4회 한도에 맞춰 0.3초 간격으로 보냅니다. 중간에 닫으셔도 됩니다 —
                진행은 알림에서 보고 중단할 수 있습니다.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
