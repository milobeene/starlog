"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

type State<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
};

/**
 * 조회 전용 훅. 라이브러리를 안 쓰는 이유 — 화면이 몇 개 안 되고
 * 캐시·재검증이 필요한 자리가 아직 없다. 필요해지면 그때 SWR을 넣는다.
 *
 * path가 null이면 호출하지 않는다 (조건부 조회용).
 * AbortController로 정리하는 이유 — 필터를 빠르게 바꾸면 늦게 온 응답이
 * 최신 응답을 덮어쓴다 (race condition)
 */
export function useApi<T>(path: string | null): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: path !== null,
  });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // path가 null이면 아무것도 안 한다. 여기서 setState를 부르면
    // 효과 안의 동기 상태 변경이라 렌더가 한 번 더 도는데, 아래 파생값으로 충분하다
    if (path === null) return;

    const controller = new AbortController();
    // 로딩 표시를 effect 진입 즉시 켜면 동기 setState라 렌더가 한 번 더 돈다.
    // 마이크로태스크로 한 틱 미루면 같은 프레임 안에서 켜지고 리렌더는 한 번이다
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setState((prev) => ({ ...prev, loading: true }));
    });

    api
      .get<T>(path, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          data: null,
          error: error instanceof ApiError ? error : new ApiError(0, "NETWORK", String(error)),
          loading: false,
        });
      });

    return () => controller.abort();
  }, [path, nonce]);

  // 조건부 조회(path === null)는 상태를 건드리지 않고 여기서 비워 내보낸다
  if (path === null) return { data: null, error: null, loading: false, reload };

  return { ...state, reload };
}
