/**
 * 비로그인 구역. 메뉴·네비게이션이 없다 (스펙 §5 비로그인 사용자 역할).
 * 디자인 확정 후 배경 연출이 여기 들어간다.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
