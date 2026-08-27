import Link from "next/link";
import { API_BASE } from "@/lib/apiBase";

/**
 * 로그인 전 화면의 공통 껍데기. 안내성 화면 4종이 생김새가 같아 한 컴포넌트로 묶었다.
 * 유리 판넬을 쓰는 이유 — 입구와 같은 유체 배경 위라 면을 깔아야 폼이 읽힌다
 */
export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-full w-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="font-display mb-8 block text-center text-base font-bold tracking-[0.25em] text-white/80 transition-colors hover:text-white"
        >
          STARLOG
        </Link>

        <div className="glass-panel rounded-xl px-7 py-8">
          <h1 className="mb-1 text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mb-6 text-sm text-white/45">{subtitle}</p>}
          <div className={subtitle ? "" : "mt-6"}>{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-xs text-white/45">{footer}</div>}
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-white/70 underline underline-offset-2 hover:text-white">
      {children}
    </Link>
  );
}

/** 구글은 fetch가 아니라 **브라우저 통째 이동**이다 — OAuth 리다이렉트라 XHR로는 못 탄다 */
export function GoogleButton({ label }: { label: string }) {
  const base = API_BASE;
  return (
    <a
      href={`${base}/oauth2/authorization/google`}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-white/15 py-2.5 text-sm font-medium transition-all hover:bg-white hover:text-black"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M12 11v2.8h6.6c-.3 1.7-2 5-6.6 5-4 0-7.2-3.3-7.2-7.3S8 4.2 12 4.2c2.2 0 3.7.9 4.6 1.8l3.1-3C17.7 1.2 15.1 0 12 0 5.4 0 0 5.4 0 12s5.4 12 12 12c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2H12z" />
      </svg>
      {label}
    </a>
  );
}
