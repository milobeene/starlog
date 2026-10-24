"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Field } from "@/components/ui/Field";
import MarkdownTextarea from "@/components/ui/MarkdownTextarea";
import { api, errorMessage } from "@/lib/api";
import type { PersonalRecord } from "@/lib/types";

/**
 * 메모 수정. 점수·플레이타임은 맨 위 요약 줄의 `StatsDialog`로 옮겼다.
 *
 * ⚠️ 서버 PUT은 세 값을 **통째로 받는다** (빠진 값은 null = 지움). 안 건드린 점수·플레이타임을
 * 현재 값 그대로 같이 보낸다
 */
export default function MemoDialog({
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
  const [memo, setMemo] = useState(record.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/backlog/${entryId}/personal-record`, {
        rating: record.rating,
        playTimeHours: record.playTimeHours,
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
      title="메모"
      onClose={onClose}
      tall
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
      {/* 라벨까지 포함해 본문을 꽉 채운다 — 팝업 높이가 고정이라 입력칸이 남는 높이를 먹는다 */}
      <Field label="Memo" hint="마크다운을 지원합니다 · Enter로 목록 이어쓰기, Tab으로 들여쓰기 · 5,000자 이내" className="min-h-0 flex-1">
        <MarkdownTextarea
          fill
          value={memo}
          onChange={setMemo}
          maxLength={5000}
          placeholder={"# 총평\n- 좋았던 점\n- 아쉬운 점"}
        />
      </Field>
    </Modal>
  );
}
