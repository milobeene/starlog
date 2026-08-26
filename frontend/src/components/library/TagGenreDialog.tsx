"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import ChipInput from "@/components/ui/ChipInput";
import Combobox from "@/components/ui/Combobox";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";

/**
 * 태그·개인 장르 편집. 한 다이얼로그지만 **페이로드가 갈린다** —
 * 태그는 항목당 하나라 `{ name }`, 장르는 여러 개라 `{ names: [...] }`다 (§6.7 v1.6).
 *
 * **장르는 마스터를 덮어쓴다** — 하나라도 넣으면 마스터 장르가 화면에서 사라지고
 * 필터도 개인 장르만 본다. 비우면 마스터로 돌아간다 (§6.7)
 */
type Props = {
  entryId: number;
  dictionary: string[];
  onClose: () => void;
  onSaved: () => void;
} & (
  | { kind: "tag"; value: string | null }
  | { kind: "genres"; values: string[] }
);

export default function TagGenreDialog(props: Props) {
  const { entryId, dictionary, onClose, onSaved } = props;

  const [tag, setTag] = useState(props.kind === "tag" ? (props.value ?? "") : "");
  const [names, setNames] = useState(props.kind === "genres" ? props.values : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // 빈 문자열은 보내지 않고 null로 바꾼다 — 서버도 공백을 null로 수렴시키지만
      // "뗀다"는 의도가 페이로드에 그대로 보이는 편이 낫다
      if (props.kind === "tag") {
        await api.put(`/api/backlog/${entryId}/tag`, { name: tag.trim() || null });
      } else {
        await api.put(`/api/backlog/${entryId}/genres`, { names });
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={props.kind === "tag" ? "태그" : "장르"}
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
      {props.kind === "genres" ? (
        <>
          <p className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
            장르를 하나라도 입력하시면 <span className="text-white/70">원본 장르를 대신합니다.</span>{" "}
            비워 두시면 원본 정보로 돌아갑니다.
          </p>
          {/* 칩의 × 가 첫 컨트롤이라 composite가 필요하다 (Field 주석 참고) */}
          <Field label="Genres" composite>
            <ChipInput
              values={names}
              onChange={setNames}
              dictionary={dictionary}
              placeholder="메트로배니아"
            />
          </Field>
        </>
      ) : (
        <>
          <p className="mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
            태그는 <span className="text-white/70">하나만</span> 붙습니다. 라이브러리를 묶는
            폴더라서, 비워 두시면 <span className="text-white/70">태그 없음</span>으로 모입니다.
          </p>
          <Field label="Tag">
            <div className="flex gap-2">
              <div className="flex-1">
                <Combobox
                  options={dictionary.map((name) => ({ value: name, label: name }))}
                  value={tag}
                  onChange={setTag}
                  placeholder="명작"
                  freeText
                  className={FIELD_INPUT}
                />
              </div>
              <button
                type="button"
                onClick={() => setTag("")}
                disabled={!tag}
                className="shrink-0 rounded-md border border-white/15 px-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
              >
                떼기
              </button>
            </div>
          </Field>
        </>
      )}
    </Modal>
  );
}
