"use client";

import { useState } from "react";
import Combobox, { type ComboOption } from "./Combobox";
import Chip from "./Chip";
import { FIELD_INPUT } from "./Field";

/**
 * 태그·장르처럼 **문자열 여러 개**를 다루는 입력.
 * 사전에서 고르거나 직접 쳐서 추가한다 — 개인 사전은 자동 생성되므로 새 값도 허용된다 (§6.7)
 */
export default function ChipInput({
  values,
  onChange,
  dictionary,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  dictionary: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const name = raw.trim();
    // 대소문자만 다른 중복도 막는다 — 사전이 "명작"과 "명작 "으로 갈리면 폴더가 쪼개진다
    if (!name || values.some((item) => item.toLowerCase() === name.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, name]);
    setDraft("");
  };

  const options: ComboOption[] = dictionary
    .filter((name) => !values.some((item) => item.toLowerCase() === name.toLowerCase()))
    .map((name) => ({ value: name, label: name }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && <span className="text-xs text-white/25">없음</span>}
        {values.map((name) => (
          <Chip
            key={name}
            label={name}
            rounded
            onRemove={() => onChange(values.filter((item) => item !== name))}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Combobox
            options={options}
            value={draft}
            onChange={(value) => {
              // 목록에서 고르면 바로 추가, 타이핑은 draft로만 쌓인다
              if (options.some((option) => option.value === value)) add(value);
              else setDraft(value);
            }}
            placeholder={placeholder}
            freeText
            className={FIELD_INPUT}
          />
        </div>
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          className="shrink-0 rounded-md border border-white/15 px-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          추가
        </button>
      </div>
    </div>
  );
}
