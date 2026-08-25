"use client";

import { useState } from "react";
import AuthCard, { AuthLink } from "@/components/auth/AuthCard";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api } from "@/lib/api";

/**
 * 재설정 요청. 응답이 **항상 202**라 "가입돼 있으면 보냈다"는 식으로만 말할 수 있다 —
 * 성공/실패를 구분해 보여주면 가입 여부가 새어나간다 (NFR-S3)
 */
export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <AuthCard title="메일을 보내 드렸습니다" subtitle={`${email}(으)로 재설정 링크를 보내 드렸습니다.`}>
        <p className="text-sm leading-relaxed text-white/60">
          가입된 주소라면 메일이 도착합니다. 링크는 <b className="text-white/80">30분</b> 동안 유효합니다.
        </p>
        <div className="mt-6">
          <AuthLink href="/login">로그인 화면으로</AuthLink>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="비밀번호 재설정"
      subtitle="가입하신 이메일로 링크를 보내 드립니다."
      footer={<AuthLink href="/login">로그인 화면으로</AuthLink>}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await api.post("/api/auth/password-reset/request", { email });
          } finally {
            setSent(true);
          }
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={FIELD_INPUT}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "발송 중" : "재설정 링크 받기"}
        </Button>
      </form>
    </AuthCard>
  );
}
