import LibrarySidebar from "@/components/library/LibrarySidebar";

/**
 * 라이브러리 구역 — 사이드바 + 메인.
 *
 * 사이드바가 상세 화면에도 남는다: 이름 목록에서 바로 다음 게임으로 건너뛸 수 있다.
 * 상세의 배너는 이 사이드바 **뒤까지** 덮으므로 fixed로 깔린다 (상세 페이지 참고).
 *
 * **컨테이너에 pt-16을 주지 않는다.** 헤더 아래에서 스크롤 영역이 시작하면
 * 올라간 콘텐츠가 그 경계에서 잘려 답답해 보인다. 전체 높이를 쓰고
 * 안쪽 패딩으로 밀어야 콘텐츠가 투명한 헤더 뒤로 지나간다
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <LibrarySidebar />
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
