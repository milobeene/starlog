import { useCallback, useRef } from "react";

/**
 * 배너 시차 스크롤. `bannerRef`는 배너에, `onScroll`은 스크롤하는 `<main>`에 건다
 */
export function useBannerScroll() {
  const bannerRef = useRef<HTMLDivElement>(null);

  /**
   * 배너는 fixed라 뷰포트 폭을 다 쓰지만 스크롤을 안 탄다.
   * 스크롤한 만큼 위로 밀어 콘텐츠와 같이 흐르는 것처럼 만든다.
   * 상태가 아니라 ref로 스타일을 직접 만지는 이유 — 프레임마다 리렌더하면
   * 표 두 개와 마크다운이 통째로 다시 그려진다
   */
  const onScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    requestAnimationFrame(() => {
      if (bannerRef.current) {
        bannerRef.current.style.transform = `translateY(${-scrollTop}px)`;
      }
    });
  }, []);

  return { bannerRef, onScroll };
}
