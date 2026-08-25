"use client";

import { useState } from "react";
import AuthCard, { AuthLink, GoogleButton } from "@/components/auth/AuthCard";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";

/**
 * 가입은 **자동 로그인이 아니다.** `emailVerified = false`로 만들어지고
 * 인증을 마쳐야 로그인이 된다 (FR-AUTH-02) — 그래서 성공하면 안내 화면으로 갈아탄다
 */
export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 4 || password.length > 64) {
      setError("비밀번호는 4~64자로 입력해 주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/signup", { email, password, nickname });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught, "가입하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="메일함을 확인해 주세요" subtitle={`${email}(으)로 인증 링크를 보내 드렸습니다.`}>
        <p className="text-sm leading-relaxed text-white/60">
          링크를 누르시면 인증이 완료되어 로그인하실 수 있습니다. 메일이 도착하지 않았다면 스팸함도 확인해 주세요.
        </p>
        <div className="mt-6">
          <AuthLink href="/login">로그인 화면으로</AuthLink>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign up"
      subtitle="기록을 시작할 계정을 만들어 주세요."
      footer={<>이미 계정이 있으신가요? <AuthLink href="/login">로그인</AuthLink></>}
    >
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

        <Field label="Nickname">
          <input
            type="text"
            required
            maxLength={30}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            className={FIELD_INPUT}
          />
        </Field>

        <Field label="Password" hint="4~64자">
          <input
            type="password"
            required
            minLength={4}
            maxLength={64}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD_INPUT}
          />
        </Field>

        {error && (
          <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "가입 중" : "Sign up"}
        </Button>

        <div className="my-1 flex items-center gap-3 text-[10px] tracking-widest text-white/25 uppercase">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>

        <GoogleButton label="Google로 시작" />
      </form>
    </AuthCard>
  );
}
