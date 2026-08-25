"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthCard, { AuthLink } from "@/components/auth/AuthCard";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";

export default function PasswordResetConfirmPage() {
  return (
    <Suspense fallback={<AuthCard title="새 비밀번호">{null}</AuthCard>}>
      <ConfirmContent />
    </Suspense>
  );
}

/**
 * 재설정 확정. 성공하면 **그 회원의 기존 세션이 전부 끊긴다** —
 * 다른 기기에서 로그인돼 있었으면 거기서도 로그아웃되므로 미리 알려준다
 */
function ConfirmContent() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthCard title="링크가 올바르지 않습니다" subtitle="메일에 포함된 링크를 다시 눌러 주세요.">
        <AuthLink href="/password-reset">재설정 다시 요청</AuthLink>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="비밀번호가 변경되었습니다" subtitle="새 비밀번호로 로그인해 주세요.">
        <AuthLink href="/login">로그인 화면으로</AuthLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="새 비밀번호" subtitle="기존과 다른 비밀번호를 입력해 주세요.">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (password.length < 4 || password.length > 64) {
            setError("비밀번호는 4~64자로 입력해 주세요");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await api.post("/api/auth/password-reset", { token, newPassword: password });
            setDone(true);
          } catch (caught) {
            setError(
              errorMessage(caught, "링크가 만료되었거나 이미 사용되었습니다"),
            );
            setBusy(false);
          }
        }}
        className="flex flex-col gap-4"
      >
        <Field label="New Password" hint="4~64자">
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

        <p className="text-[11px] leading-relaxed text-white/35">
          변경하시면 로그인 중인 다른 기기에서도 모두 로그아웃됩니다.
        </p>

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "변경 중" : "비밀번호 변경"}
        </Button>
      </form>
    </AuthCard>
  );
}
