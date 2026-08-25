/** 비로그인 구역 — 헤더도 메뉴도 없다 (스펙 §5 비로그인 사용자 역할) */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full w-full flex-col overflow-y-auto">{children}</div>;
}
