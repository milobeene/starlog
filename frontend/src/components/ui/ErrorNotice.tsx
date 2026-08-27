"use client";

import { ApiError } from "@/lib/api";

/**
 * 백엔드가 `{ code, message }`로 통일해 준다. 화면이 분기해야 하는 것만 갈라 쓴다.
 *
 * **v1.0에서 401 분기가 사라졌다** — 로그인이 없으니 "로그인이 필요합니다"로 갈 길이 없다.
 * 남겨두면 입구(`/`)로 보내는데, 데스크탑에서 그 주소는 **모드 선택 화면**이라
 * 앱 안에서 열면 다리(`window.starlog`) 없이 뜬 빈 화면이 된다
 */
export default function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
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
