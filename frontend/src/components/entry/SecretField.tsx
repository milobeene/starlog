"use client";

import { useState } from "react";
import { Field, FIELD_INPUT } from "@/components/ui/Field";

/**
 * DB 비번·스토리지 키 칸.
 *
 * **가리는 게 목적이 아니라 오타를 확인하는 게 목적이다** (결정 63).
 * 혼자 쓰는 앱이라 숨겨서 얻는 게 없고, 안 보이면 "왜 연결이 안 되지"를
 * 영영 못 푼다. 기본은 가려두되 눈 버튼으로 언제든 본다
 */
export default function SecretField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <Field label={label} composite>
      <div className="relative">
        <input
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className={`${FIELD_INPUT} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "숨기기" : "보기"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/35 transition-colors hover:text-white/80"
        >
          {shown ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </Field>
  );
}

function Eye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M2 12s3.5-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.5 7-10 7c-2 0-3.7-.7-5.1-1.6" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
