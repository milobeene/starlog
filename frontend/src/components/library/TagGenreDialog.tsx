"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import ChipInput from "@/components/ui/ChipInput";
import { Button, Field } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";

/**
 * 태그·개인 장르 전체 교체. 둘의 페이로드가 같아 한 다이얼로그로 쓴다 (`{ names: [...] }`).
 *
 * **장르는 마스터를 덮어쓴다** — 하나라도 넣으면 마스터 장르가 화면에서 사라지고
 * 필터도 개인 장르만 본다. 비우면 마스터로 돌아간다 (§6.7)
 */
export default function TagGenreDialog({
  entryId,
  kind,
  values,
  dictionary,
  onClose,
  onSaved,
}: {
  entryId: number;
  kind: "tags" | "genres";
  values: string[];
  dictionary: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [names, setNames] = useState(values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/backlog/${entryId}/${kind}`, { names });
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={kind === "tags" ? "태그" : "장르"}
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
      {kind === "genres" && (
        <p className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
          장르를 하나라도 입력하시면 <span className="text-white/70">원본 장르를 대신합니다.</span>{" "}
          비워 두시면 원본 정보로 돌아갑니다.
        </p>
      )}

      <Field label={kind === "tags" ? "Tags" : "Genres"}>
        <ChipInput
          values={names}
          onChange={setNames}
          dictionary={dictionary}
          placeholder={kind === "tags" ? "명작" : "메트로배니아"}
        />
      </Field>
    </Modal>
  );
}
