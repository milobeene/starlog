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

type Bridge = { backendPort?: () => number | null };

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
 * 백엔드가 내려준 경로를 실제로 열 수 있는 주소로 바꾼다.
 *
 * ⚠️ **이미 절대 주소인 것은 그대로 둔다.** 커버는 두 갈래로 온다 —
 * 로컬 저장이면 `/api/backlog/…`(상대), 스토리지면 버킷의 공개 URL(절대)이다.
 * 앞에 무턱대고 붙이면 스토리지 커버가 통째로 깨진다
 */
export function backendUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) {
    return path;
  }
  return origin() + path;
}

/**
 * @deprecated 새 코드는 `backendUrl()`을 쓴다. 주소가 실행 중에 정해지므로
 *             모듈을 불러오는 시점의 상수로는 담을 수 없다
 */
export const API_BASE = "";
