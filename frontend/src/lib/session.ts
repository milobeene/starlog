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
/**
 * 세대 번호. **늦게 도착한 옛 답이 새 답을 덮는 걸 막는다.**
 *
 * `inFlight = null`은 약속 참조를 버릴 뿐 요청을 취소하지 않는다. 그래서 로그인 직후
 * `refreshSession()`이 새 요청을 띄워도, 그 전에 나갔던(예: 잠든 서버를 기다리던) 요청이
 * 뒤늦게 401로 도착하면 **로그인 성공을 비로그인으로 덮어쓴다.**
 */
let generation = 0;
const listeners = new Set<() => void>();

function publish(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function load(): Promise<void> {
  // 이미 나간 요청이 있으면 그걸 같이 기다린다 — 네 컴포넌트가 동시에 떠도 요청은 하나다
  if (inFlight) return inFlight;

  const mine = generation;
  const promise = api
    .get<MeResponse>("/api/me")
    .then((me) => {
      if (mine === generation) publish({ status: "member", me });
    })
    .catch((error: unknown) => {
      if (mine !== generation) return;

      /*
       * **401만 비로그인으로 확정한다.**
       *
       * 예전엔 네트워크 실패·502도 guest로 떨어뜨렸는데, 그러면 잠든 서버를 처음 깨울 때나
       * 잠깐 끊겼을 때 **로그인돼 있는데도 비로그인으로 굳었다.** 게다가 재검증 경로가 없어
       * 앱 화면으로 들어가려 하면 계속 /login으로 튕겼다 — 새로고침해야만 풀렸다.
       *
       * 판정이 안 서면 "모름"(loading)으로 남긴다. 게이트는 loading에서 아무것도 안 하므로
       * 튕기지 않고, 다음 재검증 기회에 다시 묻는다
       */
      const unauthorized = error instanceof ApiError
          && (error.status === 401 || error.status === 403);

      publish(unauthorized
          ? { status: "guest", me: null }
          : { status: "loading", me: null });
    })
    .finally(() => {
      // 내 슬롯일 때만 비운다 — 버려진 옛 요청이 새 요청의 자리를 지우면 안 된다
      if (inFlight === promise) inFlight = null;
    });

  inFlight = promise;
  return promise;
}

/*
 * **탭이 다시 보이면 판정을 갱신한다.**
 *
 * 예전엔 "구독자가 0 → 1이 되는 순간"에 다시 물으려 했는데 **그 순간이 오지 않았다** —
 * `FluidBackground`가 루트 레이아웃에 상주하며 이 스토어를 구독하고, 루트 레이아웃은
 * 클라이언트 내비게이션으로 언마운트되지 않는다. 그래서 그 분기는 죽은 코드였고,
 * "다른 탭에서 로그아웃했을 수 있다"는 원래 의도가 달성되지 않았다.
 *
 * 탭 포커스는 그 의도를 실제로 잡는 신호다 — 화면을 옮길 때마다 요청이 늘지도 않는다.
 * 옛 답으로 즉시 그리고 새 답이 오면 조용히 갈아끼운다
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && listeners.size > 0) void load();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);

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
 *
 * ⚠️ **매번 새 객체를 만들면 안 된다.** useSyncExternalStore는 스냅숏을 `Object.is`로
 * 비교해서 바뀐 걸 판단하는데, 호출마다 새 리터럴을 주면 늘 "바뀌었다"가 되어
 * 리렌더가 꼬리를 문다. React가 콘솔로 경고하는 것도 그 이유다.
 * 상수 하나를 돌려줘도 의미는 같다 — 서버에서는 언제나 loading이다
 */
const SERVER_SNAPSHOT: SessionState = { status: "loading", me: null };
const getServerSnapshot = (): SessionState => SERVER_SNAPSHOT;

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 서버의 답을 다시 받아 온다. 프로필을 저장한 직후처럼 **화면 전체가 따라와야 할 때** 부른다.
 * 배경 색을 바꾸고 저장하면 이것 때문에 배경이 즉시 갈아끼워진다
 */
export async function refreshSession(): Promise<void> {
  generation += 1;   // 진행 중인 옛 요청의 답을 여기서 무효로 만든다
  inFlight = null;   // 옛 요청에 얹히면 저장 전 값을 받는다
  await load();
}

/** 로그아웃·탈퇴처럼 판정이 확실히 뒤집히는 순간에 부른다 */
export function clearSessionCache() {
  // 세대를 올려야 한다 — 안 그러면 진행 중이던 요청이 로그아웃 직후 member를 되살린다
  generation += 1;
  inFlight = null;
  publish({ status: "loading", me: null });
}

/** 로그아웃은 성공 시 204. 세션을 무효화하고 JSESSIONID를 지운다 */
export async function logout(): Promise<void> {
  try {
    await api.post("/api/auth/logout");
  } catch {
    // 삼킨다 — 호출부가 전부 `void logout()`이라 안 잡으면 unhandled rejection이 뜬다.
    // 서버가 못 받았어도 아래에서 캐시를 비우고 나가는 편이 낫다
  } finally {
    clearSessionCache();          // 캐시를 안 지우면 돌아온 입구가 여전히 로그인 상태로 보인다
    window.location.href = "/";
  }
}
