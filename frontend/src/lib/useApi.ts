"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, ApiError } from "./api";

/**
 * 전역 무효화 버스.
 *
 * **왜 필요한가** — 화면마다 useApi가 자기 사본을 들고 있어서, 상세에서 이름을 바꿔도
 * 사이드바는 알 방법이 없었다. 각자가 스냅숏이지 구독이 아니었기 때문이다
 * (`useSession`이 스토어가 아니었던 것과 같은 문제).
 *
 * 경로별로 나누지 않고 **한 번에 전부** 다시 읽는다. 지금 한 화면에 떠 있는 조회가
 * 서넛뿐이라 정교하게 나누는 값을 못 한다 — 게다가 게임 하나를 고치면 상세·사이드바·
 * 파셋·통계가 실제로 다 바뀐다. 나눠 봐야 결국 다 부른다
 */
let version = 0;
const listeners = new Set<() => void>();

/**
 * 응답 캐시 (v1.2).
 *
 * ## 왜 넣었나
 *
 * 상세에 들어갔다 [Back to library]로 나오면 화면이 통째로 다시 마운트된다 —
 * Next의 App Router는 라우트가 바뀌면 컴포넌트를 버리기 때문이다. 그래서 돌아올 때마다
 * **스켈레톤이 1~2초 스쳤다.** 브라우저 뒤로가기가 즉시인 이유는 그린 것을 그대로
 * 다시 보여주기 때문인데, 여기서는 그럴 수가 없다.
 *
 * 그래서 **경로별 마지막 응답을 들고 있는다.** 돌아오면 그것을 즉시 그리고,
 * 뒤에서 조용히 다시 받아 바뀐 것만 갈아 끼운다(stale-while-revalidate).
 *
 * ⚠️ **쓰기 뒤에는 통째로 버린다.** 안 그러면 방금 고친 것이 옛 값으로 한 번 스친다 —
 * 태그 순서에서 실제로 그렇게 났다.
 *
 * ⚠️ 모듈 스코프라 문서가 다시 로드되면 사라진다. 다른 세이브파일로 옮길 때도
 * `clearApiCache()`를 부른다 — 안 부르면 **남의 기록이 잠깐 보인다**
 */
const cache = new Map<string, unknown>();

export function clearApiCache() {
  cache.clear();
}

/** 쓰기 뒤에 부른다. 지금 떠 있는 모든 useApi가 다시 읽는다 */
export function invalidateQueries() {
  cache.clear();
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribeVersion(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;
// 서버 렌더에는 무효화라는 개념이 없다 — 항상 0이어야 hydration이 안 어긋난다
const getServerVersion = () => 0;

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
  const [state, setState] = useState<State<T>>(() => {
    /*
     * 캐시가 있으면 **그것으로 시작한다.** loading을 false로 두는 게 요점 —
     * true면 화면이 스켈레톤을 먼저 그려서 캐시를 둔 보람이 없다
     */
    const cached = path === null ? undefined : (cache.get(path) as T | undefined);
    return {
      data: cached ?? null,
      error: null,
      loading: path !== null && cached === undefined,
    };
  });
  const [nonce, setNonce] = useState(0);
  const globalVersion = useSyncExternalStore(subscribeVersion, getVersion, getServerVersion);

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
      /*
       * data는 남기고 **error는 비운다.** 옛 에러가 남으면 화면이 error를 loading보다
       * 먼저 검사해서, 재시도를 눌러도 에러 화면이 그대로 걸려 있다 — 누른 티가 안 난다
       */
      /*
       * 들고 있는 게 있으면 **loading을 안 켠다.** 켜면 화면이 스켈레톤으로 갈아타서
       * 조용히 갱신하려던 뜻이 사라진다 — 값이 오면 그때 조용히 바뀐다
       */
      setState((prev) => ({ data: prev.data, error: null, loading: prev.data === null }));
    });

    api
      .get<T>(path, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;   // .catch만 가드하고 있었다
        cache.set(path, data);
        setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          data: null,
          error: error instanceof ApiError ? error : new ApiError(0, "NETWORK", String(error)),
          loading: false,
        });
      });

    return () => controller.abort();
  }, [path, nonce, globalVersion]);

  // 조건부 조회(path === null)는 상태를 건드리지 않고 여기서 비워 내보낸다
  if (path === null) return { data: null, error: null, loading: false, reload };

  return { ...state, reload };
}
