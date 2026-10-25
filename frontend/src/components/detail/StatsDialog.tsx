"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import DurationField from "@/components/ui/DurationField";
import PlayTime from "@/components/ui/PlayTime";
import { api, errorMessage } from "@/lib/api";
import {
  EMPTY_SEGS,
  MAX_MINUTES,
  minutesFromSegs,
  minutesToHours,
  segsFromHours,
  type DurSegs,
} from "@/lib/playtimeInput";
import type { PersonalRecord } from "@/lib/types";

/**
 * 점수 · 플레이타임 수정 — 상세 맨 위 요약 줄의 연필, 카드 우클릭, [완료] 뒤 토스트가 연다.
 *
 * 플레이타임은 칸이 둘이고, 저장하면 **기록이 남는다** (v2 S4 — 합계는 기록의 합이다):
 *   - **지금까지**를 고치면 → 서버가 지금 합계와의 차이를 "직접 수정" 한 줄로 (`playTimeMinutes`)
 *   - **+ 더하기**를 채우면 → "추가" 한 줄 (`addMinutes`)
 * 둘 다 한 번의 저장(한 트랜잭션)이다. 미리보기는 "고친 합계 + 더한 시간"을 보여 준다.
 * 지금까지 칸을 비우거나 그대로 두면 합계는 안 건드린다 — 기록을 지우려면 상세의 기록 표에서.
 * 분은 정수 분 그대로 보낸다 — 시간(소수 둘째 자리)으로 바꿔 보내면 20분이 0.33시간(19.8분)이 된다
 *
 * ⚠️ 서버 PUT은 점수·메모를 통째로 받는다 (빠진 값은 null = 지움). 안 건드린 메모를 현재 값 그대로 보낸다
 */
export default function StatsDialog({
  entryId,
  record,
  onClose,
  onSaved,
}: {
  entryId: number;
  record: PersonalRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(record.rating == null ? "" : String(record.rating));
  const [base, setBase] = useState<DurSegs>(() => segsFromHours(record.playTimeHours));
  const [add, setAdd] = useState<DurSegs>(EMPTY_SEGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 처음 포커스는 더하기 칸 — 여는 이유 대부분이 "이번에 한 만큼 얹기"라서
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const [initialBase] = useState(() => minutesFromSegs(segsFromHours(record.playTimeHours)));
  const baseMinutes = minutesFromSegs(base);
  const baseChanged = baseMinutes != null && baseMinutes !== initialBase;
  const addMinutes = minutesFromSegs(add);
  const adding = addMinutes != null && addMinutes > 0;
  // 저장 뒤 합계 미리보기. 둘 다 안 건드렸으면 null
  const minutes = baseChanged || adding ? (baseChanged ? baseMinutes : (initialBase ?? 0)) + (adding ? addMinutes : 0) : null;
  const over = minutes != null && minutes > MAX_MINUTES;
  const ratingNumber = rating === "" ? null : Number(rating);
  const ratingBad = ratingNumber != null && (!Number.isFinite(ratingNumber) || ratingNumber < 0 || ratingNumber > 100);

  const save = async () => {
    if (over || ratingBad || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/backlog/${entryId}/personal-record`, {
        rating: ratingNumber,
        playTimeMinutes: baseChanged ? baseMinutes : null,
        addMinutes: adding ? addMinutes : null,
        memo: record.memo,
      });
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="점수 · 플레이타임"
      width="max-w-md"
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save} disabled={saving || over || ratingBad}>
            {saving ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      {/* Enter는 어느 칸에서든 저장 (한글 조합 중 Enter는 조합 확정이라 제외) */}
      <div
        className="flex flex-col gap-5"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <Field label="Rating" hint="0.0 ~ 100.0 사이로 입력해 주세요">
          <input
            type="text"
            inputMode="decimal"
            value={rating}
            onChange={(event) => setRating(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="83.0"
            aria-invalid={ratingBad || undefined}
            className={`${FIELD_INPUT} num`}
          />
        </Field>

        <Field label="Playtime" composite>
          <div className="grid grid-cols-[4rem_1fr] items-center gap-x-3 gap-y-2">
            <span className="text-xs text-white/45">지금까지</span>
            <DurationField ariaLabel="지금까지 플레이타임" value={base} onChange={setBase} invalid={over} />
            <span className="text-xs text-white/45">더하기</span>
            <DurationField ariaLabel="더할 플레이타임" prefix="+" value={add} onChange={setAdd} hoursRef={firstRef} invalid={over} />
          </div>
          <p className={`min-h-4 text-[11px] ${over ? "text-red-400" : "text-white/45"}`}>
            {over ? (
              "99,999시간 59분을 넘을 수 없습니다"
            ) : minutes != null ? (
              <>
                저장될 값 <span className="text-white/80"><PlayTime hours={minutesToHours(minutes)} /></span>
              </>
            ) : (
              "고치면 '직접 수정', 더하면 '추가' 기록으로 남습니다 · ↑↓로 증감"
            )}
          </p>
        </Field>
      </div>
    </Modal>
  );
}
