"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import DurationField from "@/components/ui/DurationField";
import PlayTime from "@/components/ui/PlayTime";
import { api, errorMessage } from "@/lib/api";
import {
  EMPTY_SEGS,
  minutesToHours,
  segsFromHours,
  sumSegs,
  type DurSegs,
} from "@/lib/playtimeInput";
import type { PersonalRecord } from "@/lib/types";

/**
 * 점수 · 플레이타임 수정 — 상세 맨 위 요약 줄의 연필이 연다.
 *
 * 플레이타임은 칸이 둘이다: **지금까지**(현재 합계를 고친다)와 **+ 더하기**(이번에 한 만큼).
 * 더하기 칸을 채우면 저장 때 합계에 더한다 — `10시간 45분`에 `+1시간 15분`이면 12.00으로 저장.
 * 합치는 건 **저장 때 한 번**이다 (칸을 떠날 때 합치면 고치는 중에 값이 튄다). 위쪽 미리보기가
 * 저장될 값을 항상 보여 준다.
 *
 * ⚠️ 서버 PUT은 세 값을 통째로 받는다 (빠진 값은 null = 지움). 안 건드린 메모를 현재 값 그대로 보낸다
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

  const { minutes, over } = sumSegs(base, add);
  const adding = add.h !== "" || add.m !== "";
  const ratingNumber = rating === "" ? null : Number(rating);
  const ratingBad = ratingNumber != null && (!Number.isFinite(ratingNumber) || ratingNumber < 0 || ratingNumber > 100);

  const save = async () => {
    if (over || ratingBad || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/backlog/${entryId}/personal-record`, {
        rating: ratingNumber,
        playTimeHours: minutes == null ? null : minutesToHours(minutes),
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
            ) : adding && minutes != null ? (
              <>
                저장될 값 <span className="text-white/80"><PlayTime hours={minutesToHours(minutes)} /></span>
              </>
            ) : (
              "↑↓로 증감 · 분이 59를 넘으면 시간이 1 올라갑니다"
            )}
          </p>
        </Field>
      </div>
    </Modal>
  );
}
