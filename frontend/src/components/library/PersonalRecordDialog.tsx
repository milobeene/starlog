"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import MarkdownTextarea from "@/components/ui/MarkdownTextarea";
import { api, errorMessage } from "@/lib/api";
import type { PersonalRecord } from "@/lib/types";
import { roundHours } from "@/lib/format";

/**
 * 내 기록 — 평점·플레이 시간·메모.
 *
 * 평점이 **0~100** 스케일인 걸 화면에 적어둔다. 5점 만점으로 오해하고 4를 넣으면
 * 서버는 통과시키고(범위 안이다) 화면에는 4.0으로 뜬다 — 조용히 틀린다
 */
export default function PersonalRecordDialog({
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
  const [hours, setHours] = useState(record.playTimeHours == null ? "" : String(record.playTimeHours));
  /** 오늘 얼마나 했는지만 적으면 합계를 대신 계산한다 — 31에 5를 더하려고 36을 암산할 이유가 없다 */
  const [addHours, setAddHours] = useState("");
  const [memo, setMemo] = useState(record.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = roundHours((Number(hours) || 0) + (Number(addHours) || 0));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/backlog/${entryId}/personal-record`, {
        rating: rating === "" ? null : Number(rating),
        // 더하기 칸에 값이 남아 있어도 반영한다 — 적어놓고 Enter를 안 눌렀을 뿐이다
        playTimeHours: hours === "" && addHours === "" ? null : total,
        memo: memo.trim() === "" ? null : memo,
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
      title="내 기록"
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-[1fr_1.4fr] gap-4">
          <Field label="Rating" hint="0.0 ~ 100.0 사이로 입력해 주세요">
            <input
              type="text"
              inputMode="decimal"
              value={rating}
              onChange={(event) => setRating(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="83.0"
              className={`${FIELD_INPUT} num`}
            />
          </Field>
          <Field label="Playtime" hint="시간 단위. 소수점 두 자리까지 (1시간 45분 = 1.75)">
            {/*
              왼쪽은 지금까지, 오른쪽은 이번에 더할 시간.
              **저장할 때만 합친다** — 포커스가 빠질 때 합치면 고치는 중에 값이 튄다
            */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                value={hours}
                onChange={(event) => setHours(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                aria-label="지금까지 플레이 시간"
                className={`${FIELD_INPUT} num min-w-0 flex-1`}
              />
              <span className="shrink-0 text-white/30">+</span>
              <input
                type="text"
                inputMode="decimal"
                value={addHours}
                onChange={(event) => setAddHours(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                aria-label="이번에 더할 시간"
                className={`${FIELD_INPUT} num min-w-0 flex-1`}
              />
            </div>
          </Field>
        </div>

        {addHours !== "" && (
          <p className="-mt-2 text-[11px] text-white/45">
            저장 시 <span className="num">{hours || 0}</span> +{" "}
            <span className="num">{addHours}</span> ={" "}
            <span className="num text-white/80">{total}시간</span>으로 기록됩니다
          </p>
        )}

        <Field label="Memo" hint="마크다운을 지원합니다 · Enter로 목록 이어쓰기, Tab으로 들여쓰기 · 5,000자 이내">
          <MarkdownTextarea
            value={memo}
            onChange={setMemo}
            rows={10}
            maxLength={5000}
            placeholder={"# 총평\n- 좋았던 점\n- 아쉬운 점"}
          />
        </Field>
      </div>
    </Modal>
  );
}
