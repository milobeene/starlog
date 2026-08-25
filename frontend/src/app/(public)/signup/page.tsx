"use client";

import AuthCard, { AuthLink, GoogleButton } from "@/components/auth/AuthCard";

/**
 * 가입은 **Google 계정으로만** 받는다.
 *
 * 이메일 가입은 인증 메일을 보내야 하는데(FR-AUTH-02), 지금 이 서비스는 메일을 보낼 수단이 없다 —
 * Resend는 도메인 인증 전까지 계정 소유자에게만 보내주고, 유일한 우회로였던 SMTP는
 * Render 무료 플랜이 아웃바운드를 막았다. 메일이 안 가면 미인증으로 남아 **로그인이 영영 403이라**
 * 가입만 시키고 못 들어오게 하는 꼴이 된다.
 *
 * 구글은 구글이 이메일 소유를 확인해주므로 우리가 메일을 보낼 이유가 없다.
 * 백엔드도 같은 제한을 건다 (`app.signup.email-allowlist`) — 서버는 클라이언트를 믿지 않는다
 */
export default function SignupPage() {
  return (
    <AuthCard
      title="Sign up"
      subtitle="Google 계정으로 시작해 주세요."
      footer={<>이미 계정이 있으신가요? <AuthLink href="/login">로그인</AuthLink></>}
    >
      <div className="flex flex-col gap-5">
        <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-relaxed text-white/50">
          이 서비스는 아직 <b className="text-white/75">자체 도메인이 없어 인증 메일을 보내 드릴 수
          없습니다.</b> 그래서 이메일 가입 대신 Google 로그인만 받고 있습니다 — 구글이 이메일 소유를
          확인해 주므로 별도 인증 절차가 필요하지 않습니다.
        </p>

        <GoogleButton label="Google로 시작" />

        <p className="text-[11px] leading-relaxed text-white/30">
          Google 계정으로 가입하시면 이후에도 Google 로그인으로만 이용하시게 됩니다. 비밀번호 설정과
          연결 해제는 같은 이유로 막혀 있으며, 계정 정리는 설정의 회원 탈퇴로 하실 수 있습니다.
        </p>
      </div>
    </AuthCard>
  );
}
