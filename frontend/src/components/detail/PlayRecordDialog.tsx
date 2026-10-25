"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DateField from "@/components/ui/DateField";
import DurationField from "@/components/ui/DurationField";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import { PLAY_RECORD_KIND_LABEL } from "@/lib/labels";
import { EMPTY_SEGS, MAX_MINUTES, minutesFromSegs, segsFromMinutes, type DurSegs } from "@/lib/playtimeInput";
import { todayKst } from "@/lib/format";
import type { PlayRecord } from "@/lib/types";

/**
 * 플레이 기록 한 줄 추가·수정 (v2 S4). 새로 만드는 건 언제나 **추가**다 —
 * 직접 수정(차이)은 점수·플레이타임 팝업에서 합계를 고칠 때 서버가 남긴다.
 *
 * 직접 수정은 부호가 있다(줄인 기록은 `−`). 기존 기록·추가는 0 이상이라 부호 칸이 없다.
 * 양을 안 건드리면 **원래 값을 그대로** 보낸다 — 기존 기록에는 `142.8분`처럼 칸(정수 분)으로
 * 못 옮기는 값이 있어서, 날짜만 고쳐도 반올림된 143분으로 바뀌면 안 된다
 */
export default function PlayRecordDialog({
  entryId,
  record,
  onClose,
  onSaved,
}: {
  entryId: number;
  record: PlayRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const kind = record?.kind ?? "ADD";
  const signed = kind === "ADJUST";
  const initial: DurSegs = record ? segsFromMinutes(Math.round(Math.abs(record.minutes))) : EMPTY_SEGS;
  const [amount, setAmount] = useState<DurSegs>(initial);
  const [negative, setNegative] = useState(record ? record.minutes < 0 : false);
  const [playedOn, setPlayedOn] = useState(record?.playedOn ?? todayKst());
  const [note, setNote] = useState(record?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const hoursRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hoursRef.current?.focus();
  }, []);

  const typed = minutesFromSegs(amount);
  const untouched = record != null && amount.h === initial.h && amount.m === initial.m && negative === record.minutes < 0;
  const minutes = untouched ? record.minutes : typed == null ? null : negative ? -typed : typed;
  const over = typed != null && typed > MAX_MINUTES;
  const bad = minutes == null || over || (kind === "ADD" && minutes <= 0);

  const save = async () => {
    if (bad || saving) return;
    setSaving(true);
    setError(null);
    const body = { minutes, playedOn: playedOn || null, note: note.trim() || null };
    try {
      if (record) await api.put(`/api/play-records/${record.recordId}`, body);
      else await api.post(`/api/backlog/${entryId}/play-records`, body);
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  };

  const signButton = (value: boolean, label: string) => (
    <button
      type="button"
      onClick={() => setNegative(value)}
      aria-pressed={negative === value}
      className={`num h-9 w-9 rounded-md border text-sm transition-colors ${
        negative === value ? "border-white/30 bg-white/15 text-white" : "border-white/10 text-white/45 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <Modal
        title={record ? `플레이 기록 수정 — ${PLAY_RECORD_KIND_LABEL[kind]}` : "플레이 기록 추가"}
        width="max-w-md"
        onClose={onClose}
        footer={
          <>
            {record && (
              <button
                onClick={() => setRemoving(true)}
                className="text-xs text-white/30 transition-colors hover:text-red-400"
              >
                삭제
              </button>
            )}
            {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
            {!error && record && <span className="mr-auto" />}
            <Button onClick={onClose}>취소</Button>
            <Button variant="primary" onClick={save} disabled={saving || bad}>
              {saving ? "저장 중" : "저장"}
            </Button>
          </>
        }
      >
        <div
          className="flex flex-col gap-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && !removing) {
              e.preventDefault();
              void save();
            }
          }}
        >
          <Field
            label="Time"
            composite
            hint={
              over
                ? undefined
                : signed
                  ? "합계를 고칠 때 생긴 차이입니다. 줄인 기록은 − 입니다"
                  : kind === "ADD"
                    ? "이번에 플레이하신 시간"
                    : "이전 기록에서 옮겨 온 합계입니다"
            }
          >
            <div className="flex items-center gap-2">
              {signed && (
                <>
                  {signButton(false, "+")}
                  {signButton(true, "−")}
                </>
              )}
              <DurationField
                ariaLabel="플레이 시간"
                prefix={kind === "ADD" ? "+" : undefined}
                value={amount}
                onChange={setAmount}
                hoursRef={hoursRef}
                invalid={over}
              />
            </div>
            {over && <span className="text-[11px] text-red-400">99,999시간 59분을 넘을 수 없습니다</span>}
          </Field>

          <Field label="Date" composite>
            <DateField value={playedOn} onChange={setPlayedOn} />
          </Field>

          <Field label="Note" hint="100자 이내">
            <input
              type="text"
              value={note}
              maxLength={100}
              onChange={(event) => setNote(event.target.value)}
              placeholder="주말에 몰아서"
              className={FIELD_INPUT}
            />
          </Field>
        </div>
      </Modal>

      {/* 형제로 그린다 — 판넬 안이면 backdrop-filter가 fixed의 기준이 돼 딤·확인창이 판넬 안에 갇힌다 */}
      {removing && record && (
        <ConfirmDialog
          title="플레이 기록 삭제"
          message={
            <>
              이 기록을 삭제합니다. 되돌릴 수 없으며,{" "}
              <b className="text-white">플레이타임 합계에서도 빠집니다.</b>
            </>
          }
          onConfirm={async () => {
            await api.del(`/api/play-records/${record.recordId}`);
            onSaved();
            onClose();
          }}
          onClose={() => setRemoving(false)}
        />
      )}
    </>
  );
}
