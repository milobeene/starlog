"use client";

import Link from "next/link";
import { ApiError, isUnauthorized } from "@/lib/api";

/** 백엔드가 `{ code, message }`로 통일해 준다. 화면이 분기해야 하는 것만 갈라 쓴다 */
export default function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (isUnauthorized(error)) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <p className="text-sm text-white/60">로그인이 필요합니다.</p>
        <Link
          href="/"
          className="rounded-full border border-white/20 px-6 py-2 text-xs tracking-widest uppercase transition-all hover:bg-white hover:text-black"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-sm text-white/60">{error.message || "정보를 불러오지 못했습니다."}</p>
      <p className="font-mono text-[11px] text-white/25">{error.code}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-full border border-white/20 px-6 py-2 text-xs tracking-widest uppercase transition-all hover:bg-white hover:text-black"
        >
          Retry
        </button>
      )}
    </div>
  );
}
