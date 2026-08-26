"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { MeResponse } from "./types";

export type SessionState =
  | { status: "loading"; me: null }
  | { status: "guest"; me: null }
  | { status: "member"; me: MeResponse };

/**
 * 로그인 여부 판정. 서버 컴포넌트에서 못 부르는 이유 —
 * 세션 쿠키가 브라우저에 있고 백엔드가 다른 도메인이라 수동 포워딩이 필요하다.
 *
 * 그래서 **탭을 처음 연 순간**의 첫 페인트는 loading이다.
 *
 * 다만 두 번째부터는 아니다 — 판정 결과를 모듈 변수에 남긴다. SPA라 라우트를 옮겨도
 * 이 모듈은 살아있어서, 대시보드에 갔다 입구로 돌아오면 **이미 답을 아는 상태로 첫 렌더**가 된다.
 * 입구의 로딩 연출이 재방문 때 안 뜨는 게 이것 때문이다 (돌아올 때마다 깜빡이면 성가시다).
 *
 * 캐시를 두면서도 매번 다시 묻는 이유 — 다른 탭에서 로그아웃했을 수 있다.
 * 화면은 옛 답으로 즉시 그리고, 새 답이 오면 조용히 갈아끼운다
 */
let cached: SessionState | null = null;

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(cached ?? { status: "loading", me: null });

  useEffect(() => {
    const controller = new AbortController();

    const settle = (next: SessionState) => {
      cached = next;
      setState(next);
    };

    api
      .get<MeResponse>("/api/me", controller.signal)
      .then((me) => settle({ status: "member", me }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // 401뿐 아니라 네트워크 실패도 비로그인으로 본다 — 입구 페이지가 그려져야 하므로
        if (error instanceof ApiError || error instanceof Error) {
          settle({ status: "guest", me: null });
        }
      });

    return () => controller.abort();
  }, []);

  return state;
}

/** 로그아웃·탈퇴처럼 판정이 확실히 뒤집히는 순간에 부른다 */
export function clearSessionCache() {
  cached = null;
}

/** 로그아웃은 성공 시 204. 세션을 무효화하고 JSESSIONID를 지운다 */
export async function logout(): Promise<void> {
  try {
    await api.post("/api/auth/logout");
  } finally {
    clearSessionCache();          // 캐시를 안 지우면 돌아온 입구가 여전히 로그인 상태로 보인다
    window.location.href = "/";
  }
}
