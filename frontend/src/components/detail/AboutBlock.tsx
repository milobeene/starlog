"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

/**
 * About — 소개문과 스토리라인을 **한 묶음으로** 다룬다 (2026-08-28).
 *
 * ## 원문을 지우지 않는다
 *
 * 번역이 이상할 때 원문을 볼 수 있어야 하고, 다시 번역하려면 원문이 있어야 한다.
 * 서버가 원문과 번역을 둘 다 내려주고 여기서 고른다.
 *
 * ## 토글과 버튼이 하나씩이다
 *
 * 소개문과 스토리라인을 따로 켰다 껐다 하면 **한쪽은 영어, 한쪽은 한국어**인 상태가
 * 생긴다. 같은 글의 두 부분이라 그건 읽는 데 방해만 된다.
 *
 * ## ⚠️ 번역은 돈이 드는 유일한 버튼이다
 *
 * IGDB 검색이나 스토리지 업로드는 한도를 넘으면 거절당하고 끝이지만, 번역은 넘으면
 * **요금이 청구된다.** 그래서 누르기 전에 **합계 글자 수**를 보여준다 —
 * 스토리라인은 실측 최대가 20,764자라 소개문만 보고 짐작하면 크게 어긋난다
 */
export default function AboutBlock({
  entryId,
  master,
  onTranslated,
}: {
  entryId: number;
  master: {
    summary: string | null;
    summaryKo: string | null;
    storyline: string | null;
    storylineKo: string | null;
  };
  onTranslated: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translated = Boolean(master.summaryKo || master.storylineKo);
  const korean = translated && !showOriginal;
  const chars = (master.summary?.length ?? 0) + (master.storyline?.length ?? 0);

  const translate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/backlog/${entryId}/translate`, {});
      setShowOriginal(false);
      onTranslated();
    } catch (caught) {
      setError(errorMessage(caught, "번역하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const summary = korean ? (master.summaryKo ?? master.summary) : master.summary;
  const storyline = korean ? (master.storylineKo ?? master.storyline) : master.storyline;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed font-light text-white/75">
        {summary ?? <span className="text-white/25">등록된 요약이 없습니다.</span>}
      </p>

      {/* 스토리라인은 요약과 별개 필드다 — 없는 게임이 많아 자리를 항상 두되 비워둔다 */}
      <div className="border-t border-white/5 pt-5">
        <h4 className="mb-2 text-xs tracking-wider text-white/40 uppercase">Storyline</h4>
        <p className="text-sm leading-relaxed font-light text-white/65">
          {storyline ?? <span className="text-white/25">등록된 스토리라인이 없습니다.</span>}
        </p>
      </div>

      {chars > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
          {translated && (
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="text-[11px] tracking-wider text-white/35 uppercase transition-colors hover:text-white"
            >
              {showOriginal ? "번역 보기" : "원문 보기"}
            </button>
          )}

          {(!translated || showOriginal) && (
            <button
              onClick={translate}
              disabled={busy}
              className="text-[11px] tracking-wider text-teal-200/70 uppercase transition-colors hover:text-teal-100 disabled:text-white/20"
            >
              {busy ? "번역 중…" : translated ? "다시 번역" : "번역"}
              {/*
                ⚠️ 합계를 보여준다 — 누르는 순간 이만큼이 이번 달 한도에서 빠진다.
                스토리라인이 소개문보다 훨씬 길 수 있어 짐작으로는 어긋난다
              */}
              <span className="ml-1.5 normal-case opacity-60">
                ({chars.toLocaleString()}자)
              </span>
            </button>
          )}

          {error && <span className="text-[11px] text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}
