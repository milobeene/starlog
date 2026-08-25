"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * 구글 인증 결과 안내.
 *
 * 서버는 `?google=CODE`만 실어 보내고 **문구는 여기서 고른다** —
 * OAuth는 브라우저 통째 이동이라 예전에는 `{"code":"LINKED"}` 원문이 그대로 보였다.
 *
 * 읽고 나면 쿼리를 지운다. 새로고침할 때마다 같은 배너가 다시 뜨면 성가시다
 */
const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  LINKED: { tone: "ok", text: "구글 계정을 연결했습니다." },
  ALREADY_LINKED: {
    tone: "warn",
    text: "이미 다른 계정에 연결된 구글 계정입니다. 해당 계정에서 연결을 해제한 뒤 다시 시도해 주세요.",
  },
  EMAIL_ALREADY_REGISTERED: {
    tone: "warn",
    text: "이미 가입된 이메일입니다. 기존 계정으로 로그인하신 뒤 설정에서 구글 계정을 연결해 주세요.",
  },
  EMAIL_REQUIRED: {
    tone: "warn",
    text: "구글 계정의 이메일 제공에 동의하셔야 가입하실 수 있습니다.",
  },
  EMAIL_NOT_VERIFIED: {
    tone: "warn",
    text: "이메일 인증이 완료되지 않은 계정입니다. 인증을 마친 뒤 다시 시도해 주세요.",
  },
  APPROVAL_PENDING: {
    tone: "warn",
    text:
      "가입 요청이 접수되었습니다. 관리자 승인 후 이용하실 수 있습니다. " +
      "무료로 운영되는 서비스라 이용 인원을 관리하고 있습니다.",
  },
  FAILED: { tone: "warn", text: "구글 인증에 실패했습니다. 잠시 후 다시 시도해 주세요." },
};

export default function GoogleResultBanner({ basePath }: { basePath: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("google");
  if (!code) return null;

  const message = MESSAGES[code] ?? {
    tone: "warn" as const,
    text: "구글 인증을 처리하지 못했습니다.",
  };

  return (
    <div
      role="status"
      className={`mb-5 flex items-start gap-3 rounded-md border px-3 py-2.5 text-xs leading-relaxed ${
        message.tone === "ok"
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
          : "border-amber-400/25 bg-amber-400/10 text-amber-200"
      }`}
    >
      <span className="flex-1">{message.text}</span>
      <button
        type="button"
        aria-label="닫기"
        onClick={() => router.replace(basePath)}
        className="shrink-0 opacity-50 transition-opacity hover:opacity-100"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
