/**
 * 백엔드 주소를 정하는 단 한 곳.
 *
 * **웹**은 프론트(Vercel)와 백엔드(Render)가 다른 오리진이라 절대 주소가 필요하다.
 * **데스크탑(v1.0)**은 스프링이 프론트까지 서빙해서 오리진이 하나다 → 상대 경로만 쓰면 되고,
 * 그래야 **일렉트론이 실행 시점에 고른 포트를 프론트가 몰라도 된다.**
 * `NEXT_PUBLIC_API_BASE`는 빌드 시점에 굳어서 그 포트를 담을 수 없다.
 * → docs/v1.0-architecture.md §2
 *
 * 빈 문자열을 쓰지 않고 플래그를 따로 둔 이유 — 빌드 도구마다 빈 환경변수를
 * "설정 안 함"으로 접는 경우가 있어서 의도가 조용히 뒤집힌다.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_SAME_ORIGIN === "1"
    ? ""
    : (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080");
