/**
 * 로그인 구역. 헤더/네비게이션이 여기 붙는다.
 *
 * 인증 가드도 여기 자리 — 정적/SSR이 아니라 클라이언트에서 GET /api/me 를 부르고
 * 401이면 /login 으로 보낸다. 서버는 어차피 403으로 막으므로 이건 UX일 뿐이다.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
