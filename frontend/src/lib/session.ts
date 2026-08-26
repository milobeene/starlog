"use client";

import { useSyncExternalStore } from "react";
import { api, ApiError } from "./api";
import type { MeResponse } from "./types";

export type SessionState =
  | { status: "loading"; me: null }
  | { status: "guest"; me: null }
  | { status: "member"; me: MeResponse };

/**
 * 로그인 여부 판정. 서버 컴포넌트에서 못 부르는 이유 —
 * 세션 쿠키가 브라우저에 있고 백엔드가 다른 도메인이라 수동 포워딩이 필요하다.
 * 그래서 **탭을 처음 연 순간**의 첫 페인트는 loading이다.
 *
 * **훅이 아니라 모듈 스토어다.** 예전에는 `useSession()`을 부르는 컴포넌트마다
 * 각자 /api/me를 때리고 각자 상태를 들었다. 그래서 두 가지가 어긋났다:
 *   1. 화면 하나 여는 데 같은 요청이 네 번 나갔다
 *   2. 설정에서 프로필을 저장해도 **배경·헤더는 옛 값을 그대로 들고 있었다** —
 *      구독이 아니라 각자의 스냅숏이었기 때문이다
 *
 * 지금은 상태가 한 벌이고 구독자에게 방송된다. 요청도 한 번만 나간다
 * (in-flight 약속을 공유한다).
 *
 * 캐시를 두면서도 매번 다시 묻는 이유 — 다른 탭에서 로그아웃했을 수 있다.
 * 화면은 옛 답으로 즉시 그리고, 새 답이 오면 조용히 갈아끼운다
 */
let state: SessionState = { status: "loading", me: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function load(): Promise<void> {
  // 이미 나간 요청이 있으면 그걸 같이 기다린다 — 네 컴포넌트가 동시에 떠도 요청은 하나다
  if (inFlight) return inFlight;

  inFlight = api
    .get<MeResponse>("/api/me")
    .then((me) => publish({ status: "member", me }))
    .catch((error: unknown) => {
      // 401뿐 아니라 네트워크 실패도 비로그인으로 본다 — 입구 페이지가 그려져야 하므로
      if (error instanceof ApiError || error instanceof Error) {
        publish({ status: "guest", me: null });
      }
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 첫 구독자가 붙을 때 한 번만 묻는다. 이후 구독자는 이미 있는 답을 그대로 받는다
  if (state.status === "loading") void load();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

/**
 * 서버 렌더에서는 늘 loading이다.
 *
 * 클라이언트 스냅숏을 그대로 쓰면 안 된다 — 모듈 상태가 서버 프로세스에 남아
 * **다른 사용자의 세션이 초기 HTML에 섞여 나갈 수 있다**
 */
const getServerSnapshot = (): SessionState => ({ status: "loading", me: null });

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 서버의 답을 다시 받아 온다. 프로필을 저장한 직후처럼 **화면 전체가 따라와야 할 때** 부른다.
 * 배경 색을 바꾸고 저장하면 이것 때문에 배경이 즉시 갈아끼워진다
 */
export async function refreshSession(): Promise<void> {
  inFlight = null;   // 진행 중인 옛 요청에 얹히면 저장 전 값을 받는다
  await load();
}

/** 로그아웃·탈퇴처럼 판정이 확실히 뒤집히는 순간에 부른다 */
export function clearSessionCache() {
  inFlight = null;
  publish({ status: "loading", me: null });
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
