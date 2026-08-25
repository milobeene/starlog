"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Field, FIELD_DATE, FIELD_INPUT } from "@/components/ui/Field";
import ChipInput from "@/components/ui/ChipInput";
import { useApi } from "@/lib/useApi";
import { api, errorMessage } from "@/lib/api";
import type { BacklogDetail, CompanyDictionary, OptionsResponse } from "@/lib/types";

/**
 * 마스터 정보 덮어쓰기.
 *
 * **비우면 덮어쓰기가 풀린다** — null/빈 배열이 "안 덮음"이라 마스터 값으로 돌아간다.
 * 그래서 각 칸의 placeholder에 마스터 원본을 넣었다 (API 설계서 §1.3의 "원본: ~" 힌트).
 * 지금 뭘 덮고 있는지 여기서 보이면 상세 화면에 배지를 달 필요가 없다.
 *
 * **개인 장르도 여기서 같이 고친다.** 장르는 오버라이드가 아니라 개인 사전이라
 * 저장이 두 번 나가지만, 쓰는 사람에게는 게임 정보를 고치는 일 하나다
 */
export default function OverridesDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: BacklogDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { master, overrides } = detail;
  const companies = useApi<CompanyDictionary>("/api/backlog/companies");
  const options = useApi<OptionsResponse>("/api/me/options");

  const [name, setName] = useState(overrides.name ?? "");
  const [developers, setDevelopers] = useState<string[]>(overrides.developers);
  const [publishers, setPublishers] = useState<string[]>(overrides.publishers);
  const [genres, setGenres] = useState<string[]>(detail.genres);
  const [releasedOn, setReleasedOn] = useState(overrides.releasedOn ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/backlog/${detail.entryId}/overrides`, {
        name: blankToNull(name),
        developers,
        publishers,
        releasedOn: blankToNull(releasedOn),
        listPrice: null,
      });
      // 장르는 오버라이드가 아니라 개인 사전이라 경로가 따로다 (§6.7)
      await api.put(`/api/backlog/${detail.entryId}/genres`, { names: genres });
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="게임 정보 덮어쓰기"
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
      <p className="mb-5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
        비워 두시면 수정이 해제되어 <span className="text-white/70">원본 정보</span>로 돌아갑니다.
        회색 글씨가 원본 값입니다.
      </p>

      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={master.name}
            className={FIELD_INPUT}
          />
        </Field>

        <Field label="Developers" hint="비워 두시면 원본 정보로 돌아갑니다">
          <ChipInput
            values={developers}
            onChange={setDevelopers}
            dictionary={companies.data?.overriddenDevelopers ?? []}
            placeholder={master.developers[0] ?? "닌텐도"}
          />
        </Field>

        <Field label="Publishers" hint="비워 두시면 원본 정보로 돌아갑니다">
          <ChipInput
            values={publishers}
            onChange={setPublishers}
            dictionary={companies.data?.overriddenPublishers ?? []}
            placeholder={master.publishers[0] ?? "닌텐도"}
          />
        </Field>

        <Field label="Genres" hint="하나라도 입력하시면 원본 장르를 대신합니다">
          <ChipInput
            values={genres}
            onChange={setGenres}
            dictionary={options.data?.genreDictionary ?? []}
            placeholder="메트로배니아"
          />
        </Field>

        <Field label="Release Date">
          <input
            type="date"
            value={releasedOn}
            onChange={(event) => setReleasedOn(event.target.value)}
            className={FIELD_DATE}
          />
        </Field>
        {master.releasedOn && (
          <span className="-mt-2 text-[11px] text-white/30">원본: {master.releasedOn}</span>
        )}
      </div>
    </Modal>
  );
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}
