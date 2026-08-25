"use client";

/**
 * 상세 배너 — **뷰포트 폭을 통째로 덮는다.** 헤더 뒤도, 사이드바 뒤도 지나간다.
 *
 * `fixed`인 이유 — 부모(메인 영역) 안에 두면 사이드바 옆에서 잘린다.
 * 라이브러리 레이아웃이 `overflow-hidden`이라 음수 마진으로도 못 뚫는다.
 *
 * 대신 fixed는 스크롤해도 못박혀 따라다니므로, 부모가 onScroll에서 이 ref를
 * `translateY(-scrollTop)` 시킨다 → 콘텐츠와 같이 흐르는 것처럼 보인다.
 * 걷히는 게 아니라 **위로 밀려 올라가 사라진다**.
 *
 * -z-10이라 흐름 콘텐츠보다 뒤, body 직속의 유체 캔버스보다는 앞이다.
 * 사이드바가 유리 판넬이라 backdrop-blur가 이 배너를 빨아들여 흐릿하게 비친다
 */
export default function DetailBanner({
  src,
  bannerRef,
}: {
  src: string | null;
  bannerRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!src) return null;

  return (
    <div
      ref={bannerRef}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] will-change-transform"
    >
      <div
        className="banner-fade h-full w-full bg-cover bg-center opacity-85"
        style={{ backgroundImage: `url(${src})` }}
      />
      {/* 텍스트 대비 확보 — 이미지가 밝으면 흰 글씨가 안 읽힌다 */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-transparent" />
    </div>
  );
}
