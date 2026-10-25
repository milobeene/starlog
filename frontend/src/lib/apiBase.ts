/**
 * 백엔드 주소를 정하는 단 한 곳.
 *
 * ## 데스크탑은 화면과 API의 오리진이 다르다 (2026-08-28에 바뀜)
 *
 * 예전에는 스프링이 프론트까지 서빙해서 오리진이 하나였고 상대 경로만 쓰면 됐다.
 * 대신 창이 입구(`app://`)와 앱(`http://127.0.0.1:포트`)을 오갈 때마다 **문서가 통째로
 * 바뀌어서** 검은 화면이 번쩍이고, 배경 연출이 처음부터 다시 돌고, 진행 중이던 알림이
 * 사라졌다.
 *
 * 이제 창은 **평생 `app://` 한 장**이다. 그래서 API 주소를 실행 중에 알아내야 한다 —
 * 포트는 일렉트론이 그때그때 빈 것을 고르므로 빌드 시점에 담을 수가 없다.
 *
 * ## 세 가지 환경
 *
 * <pre>
 *   웹 배포        NEXT_PUBLIC_API_BASE (Render 주소)
 *   데스크탑       http://127.0.0.1:{일렉트론이 알려주는 포트}
 *   개발 서버      http://localhost:8080  ← 다리가 없으면 여기로 떨어진다
 * </pre>
 */

/** 웹 배포에서 프론트와 백엔드가 같은 오리진일 때 (지금은 안 쓰지만 규약은 남긴다) */
const SAME_ORIGIN = process.env.NEXT_PUBLIC_SAME_ORIGIN === "1";
const WEB_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

/**
 * 알아낸 주소를 들고 있는다.
 *
 * 매번 다리에 물어보지 않는 이유 — `backendPort()`는 **동기 IPC**라 부를 때마다 메인
 * 프로세스를 왕복한다. 화면 하나에 이미지가 수십 개씩 붙는데 그때마다 왕복하면 눈에 띈다.
 * 처음 한 번만 물어보고, 접속 대상이 바뀌면 그때 `setBackendPort`로 갈아끼운다
 */
let cached: string | null = null;

type Bridge = { backendPort?: () => number | null; session?: { token?: () => string | null } };

function bridge(): Bridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { starlog?: Bridge }).starlog;
}

/**
 * 접속한 뒤 주소를 정한다. 기동·복귀 직후에 부른다.
 *
 * **이걸 안 부르면 옛 포트로 계속 요청한다** — 다른 세이브파일을 열어도 화면은 앞엣것을
 * 보게 된다. 실제로 연결 테스트에서 포트가 바뀌는 걸 놓쳐 앱 전체가 `Failed to fetch`가
 * 된 적이 있다
 */
export function setBackendPort(port: number | null | undefined) {
  cached = port ? `http://127.0.0.1:${port}` : null;
  // 토큰은 서버를 띄울 때마다 새로 만든다 — 포트가 바뀌면 토큰도 바뀐 것이다
  cachedToken = null;
}

/**
 * API 토큰 (보안 점검 2026-10-25). 일렉트론이 서버를 띄울 때마다 새로 만들고 다리로 알려준다.
 * 다리가 없으면(개발 서버) 없다 — dev 서버는 토큰 없이 돈다.
 * 포트처럼 들고 있는다 (동기 IPC 왕복을 이미지마다 하지 않으려고). 단 **없음은 들고 있지 않는다** —
 * 입구 화면에서 서버가 뜨기 전에 한 번 물어 null이 굳으면 그 뒤로 전부 401이다
 */
let cachedToken: string | null = null;

export function apiToken(): string | null {
  if (cachedToken !== null) return cachedToken;
  const found = bridge()?.session?.token?.();
  if (typeof found === "string" && found) cachedToken = found;
  return cachedToken;
}

function origin(): string {
  if (SAME_ORIGIN) return "";
  if (cached !== null) return cached;

  const port = bridge()?.backendPort?.();
  if (port) {
    cached = `http://127.0.0.1:${port}`;
    return cached;
  }
  // 다리가 없다 = 브라우저(개발 서버). 백엔드는 늘 8080에 있다
  return WEB_BASE;
}

/**
 * API 호출 주소 — `lib/api.ts`만 쓴다. 토큰은 머리글로 싣으므로 주소엔 안 붙인다
 */
export function apiUrl(path: string): string {
  if (isAbsolute(path)) return path;
  /*
   * 다리는 있는데 포트가 없다 = 입구 화면, 서버가 아직 없다. 개발용 8080으로 떨어뜨리면
   * 같은 맥의 남의 서버를 두드리게 되고 CSP가 막으며 위반을 남긴다 → fetch가 실패할 때와 같은 TypeError로 끝낸다
   */
  if (!SAME_ORIGIN && cached === null && bridge() && !bridge()?.backendPort?.()) {
    throw new TypeError("백엔드가 아직 안 떴습니다");
  }
  return origin() + path;
}

const isAbsolute = (path: string) => /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//");

/**
 * 백엔드가 내려준 경로를 실제로 열 수 있는 주소로 바꾼다 — **`<img>`·`<video>`의 src는 전부 여기를 지난다.**
 *
 * ⚠️ **이미 절대 주소인 것은 그대로 둔다.** 커버는 두 갈래로 온다 —
 * 로컬 저장이면 `/api/backlog/…`(상대), 스토리지면 버킷의 공개 URL(절대)이다.
 * 앞에 무턱대고 붙이면 스토리지 커버가 통째로 깨진다. 토큰도 **우리 API에만** 붙인다 — 버킷에 흘리면 안 된다
 *
 * 우리 API면 `t=<토큰>`을 붙인다. 태그는 머리글을 못 싣고, 서버는 GET에서만 이걸 받는다
 */
export function backendUrl(path: string): string {
  if (isAbsolute(path)) return path;
  const token = path.startsWith("/api/") ? apiToken() : null;
  const withToken = token ? `${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}` : path;
  return origin() + withToken;
}
