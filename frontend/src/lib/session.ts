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
 * 그래서 첫 페인트는 항상 loading이다. 입구 페이지의 버튼이 살짝 늦게 뜨는 게 이것 때문
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading", me: null });

  useEffect(() => {
    const controller = new AbortController();

    api
      .get<MeResponse>("/api/me", controller.signal)
      .then((me) => setState({ status: "member", me }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // 401뿐 아니라 네트워크 실패도 비로그인으로 본다 — 입구 페이지가 그려져야 하므로
        if (error instanceof ApiError || error instanceof Error) {
          setState({ status: "guest", me: null });
        }
      });

    return () => controller.abort();
  }, []);

  return state;
}

/** 로그아웃은 성공 시 204. 세션을 무효화하고 JSESSIONID를 지운다 */
export async function logout(): Promise<void> {
  try {
    await api.post("/api/auth/logout");
  } finally {
    window.location.href = "/";
  }
}
