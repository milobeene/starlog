"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthCard, { AuthLink, GoogleButton } from "@/components/auth/AuthCard";
import GoogleResultBanner from "@/components/auth/GoogleResultBanner";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api, ApiError, ERROR } from "@/lib/api";

/**
 * 로그인 — **JSON이 아니라 form 형식**이다 (`email=...&password=...`).
 * 컨트롤러 메서드가 없고 시큐리티 필터가 이 경로를 가로챈다.
 *
 * 비밀번호 오류와 없는 계정을 구분해 보여주지 않는다 (NFR-S3) — 서버도 같은 401을 준다
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  // 보호된 화면에서 튕겨 왔으면 로그인 뒤 그리로 돌려보낸다
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [resent, setResent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.postForm<{ withdrawalPending: boolean }>("/api/auth/login", {
        email,
        password,
      });
      // 유예 중 계정은 복구 화면 말고는 전부 403이라 다른 데로 보내면 막힌다 (FR-AUTH-10)
      router.push(result.withdrawalPending ? "/restore" : (next ?? "/dashboard"));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, "NETWORK", "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await api.post("/api/auth/email-verification/resend", { email });
    } finally {
      // 응답이 항상 202라 성공/실패를 구분해 보여줄 수 없다 (NFR-S3)
      setResent(true);
    }
  };

  return (
    <AuthCard
      title="Log in"
      subtitle="기록해 두신 게임이 기다리고 있습니다."
      footer={<>아직 계정이 없으신가요? <AuthLink href="/signup">회원가입</AuthLink></>}
    >
      <GoogleResultBanner basePath="/login" />

      <form onSubmit={submit} className="flex flex-col gap-4">
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

        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD_INPUT}
          />
        </Field>

        {error && (
          <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error.code === ERROR.EMAIL_NOT_VERIFIED ? (
              <>
                이메일 인증이 완료되지 않았습니다.{" "}
                {resent ? (
                  <span className="text-white/60">인증 메일을 다시 보내 드렸습니다.</span>
                ) : (
                  <button type="button" onClick={resend} className="underline underline-offset-2">
                    인증 메일 다시 받기
                  </button>
                )}
              </>
            ) : (
              (error.message ?? "이메일 또는 비밀번호가 올바르지 않습니다")
            )}
          </div>
        )}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "로그인 중" : "Log in"}
        </Button>

        <div className="my-1 flex items-center gap-3 text-[10px] tracking-widest text-white/25 uppercase">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>

        <GoogleButton label="Google로 로그인" />

        <div className="pt-1 text-center text-xs">
          <AuthLink href="/password-reset">비밀번호를 잊으셨나요</AuthLink>
        </div>
      </form>
    </AuthCard>
  );
}
