"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthCard, { AuthLink } from "@/components/auth/AuthCard";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api } from "@/lib/api";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthCard title="확인하는 중">{null}</AuthCard>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

/**
 * 메일 링크의 토큰을 자동으로 제출한다.
 *
 * **실패 사유를 구분해 알려주지 않는다** — 없는 토큰·만료·이미 사용됨이 전부 같은
 * `400 INVALID_INPUT`이다 (NFR-S3). 그래서 화면도 성공/실패 두 얼굴뿐이다
 */
function VerifyEmailContent() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"loading" | "done" | "failed">(token ? "loading" : "failed");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .post("/api/auth/email-verification", { token })
      .then(() => setState("done"))
      .catch(() => setState("failed"));
  }, [token]);

  if (state === "loading") {
    return <AuthCard title="인증하는 중">{null}</AuthCard>;
  }

  if (state === "done") {
    return (
      <AuthCard title="인증이 완료되었습니다" subtitle="이제 로그인하실 수 있습니다.">
        <AuthLink href="/login">로그인 화면으로</AuthLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="인증하지 못했습니다"
      subtitle="링크가 만료되었거나 이미 사용된 것 같습니다."
      footer={<AuthLink href="/login">로그인 화면으로</AuthLink>}
    >
      {resent ? (
        <p className="text-sm text-white/60">인증 메일을 다시 보내 드렸습니다. 메일함을 확인해 주세요.</p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await api.post("/api/auth/email-verification/resend", { email });
            } finally {
              // 응답이 항상 202라 실패를 구분할 수 없다
              setResent(true);
            }
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Email" hint="가입 시 사용하신 주소">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD_INPUT}
            />
          </Field>
          <Button type="submit" variant="primary">
            인증 메일 다시 받기
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
