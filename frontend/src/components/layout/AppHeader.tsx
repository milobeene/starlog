"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Dropdown from "@/components/ui/Dropdown";
import { logout, useSession } from "@/lib/session";

const LEFT = [{ href: "/dashboard", label: "Dashboard" }];
const RIGHT = [
  { href: "/library", label: "Library" },
  { href: "/add", label: "Add" },
];

/**
 * 배경 없이 글자만 떠 있다 — 유체 배경과 상세 배너가 그대로 비쳐야 한다.
 *
 * **mix-blend-difference는 `<header>` 자신에 건다.** 자식에 걸면 안 된다 —
 * z-index가 붙은 조상이 쌓임 맥락을 만들고, 자식의 블렌딩은 그 맥락 **안에서만** 일어나
 * 헤더의 투명 배경하고만 섞인다(아무 일도 안 생긴다). 요소 자신에 걸면 그 요소의 backdrop,
 * 즉 부모 맥락에서 **먼저 그려진 모든 것**과 섞이므로 z-index를 줘도 된다.
 *
 * 그래서 z-40으로 본문 위에 올릴 수 있다 — 이게 없으면 커버·배너가 헤더 글자를 덮고
 * 클릭도 가로챈다(라이브러리에서 메뉴가 안 눌리던 이유).
 *
 * 결과는 배경의 **보색**이다(주황 위에서는 파랑기가 돈다). 흑백으로 떨어뜨리려고
 * backdrop-grayscale을 걸어봤지만 헤더 띠만큼 배경 채도가 빠져 더 나빴다 — 보색 쪽을 택했다.
 *
 * ⚠️ 배경이 중간 밝기면 반전해도 중간 밝기라 대비가 준다. 우리 화면은 어두운 카드와
 * 밝은 배너의 대비가 커서 성립한다.
 */
export default function AppHeader() {
  const pathname = usePathname();
  const session = useSession();
  const profile = session.me?.profile;

  return (
    <>
      {/*
        pointer-events-none을 헤더에 두고 실제 항목에만 auto를 준다 —
        헤더의 빈 영역이 아래 콘텐츠의 클릭을 가로채면 안 된다
      */}
      <header className="pointer-events-none fixed top-0 left-0 z-40 h-16 w-full mix-blend-difference">
        {/* 워드마크. 홈으로 나가는 유일한 출구다 */}
        <Link
          href="/"
          className="pointer-events-auto absolute left-8 flex h-full items-center font-display text-lg font-bold tracking-[0.2em] text-white"
        >
          STARLOG
        </Link>

        {/*
          로고를 **화면 정중앙**에 두려면 좌우 슬롯 폭이 같아야 한다.
          왼쪽 1개 / 오른쪽 2개라 자연 폭으로는 안 맞아 w-44로 고정하고 로고 쪽에 붙였다.
          nav 자체를 절대 중앙 정렬해서 오른쪽 프로필의 폭에 밀리지 않게 한다
        */}
        {/*
          간격을 gap이 아니라 **각 항목의 좌우 패딩**으로 만든다.
          gap은 항목 사이의 빈 공간이라 그만큼 클릭이 안 먹는 띠가 생긴다 —
          패딩이면 그 공간까지 링크의 몸이라 눌린다. 보이는 간격은 같다(px-4 ×2 = 32px)
        */}
        <nav className="absolute left-1/2 flex h-full -translate-x-1/2 items-center">
          <div className="flex h-full w-44 items-center justify-end">
            {LEFT.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} />
            ))}
          </div>

          {/* 심볼은 장식이다 — 링크가 아니다. 나가는 출구는 왼쪽 워드마크 하나면 된다 */}
          {/*
            shapeRendering=geometricPrecision — 브라우저가 속도보다 **정밀도**를 택하게 한다.
            기본값(auto)은 작은 도형에서 픽셀 격자에 맞추려다 곡선을 계단으로 만든다.
            mix-blend-mode가 이 요소를 별도 합성 레이어로 올리는 것도 겹쳐 더 도드라진다
          */}
          <svg
            viewBox="0 0 100 100"
            aria-hidden
            shapeRendering="geometricPrecision"
            className="mx-4 h-7 w-7 shrink-0 text-white"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M50 3 Q60.5 39.5 97 50 Q60.5 60.5 50 97 Q39.5 60.5 3 50 Q39.5 39.5 50 3 Z M50 33 Q55 45 67 50 Q55 55 50 67 Q45 55 33 50 Q45 45 50 33 Z"
            />
          </svg>

          <div className="flex h-full w-44 items-center justify-start">
            {RIGHT.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} />
            ))}
          </div>
        </nav>

        {/*
          프로필도 헤더 안에 둬서 함께 반전된다. 대신 **패널만 포탈로 body에 뺀다** —
          자식은 조상의 블렌딩에서 못 빠져나오므로, 안에 두면 메뉴가 형광색으로 뒤집힌다
        */}
        <div className="pointer-events-auto absolute right-8 flex h-full items-center">
        <Dropdown
          portal
          trigger={() => (
            <div className="flex items-center space-x-2 py-2 text-sm font-semibold text-white">
              <span>{profile?.nickname || " "}</span>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        >
          {(close) => (
            <>
              {/* 프로필과 설정이 같은 페이지라 항목을 나누지 않는다 */}
              <Link href="/settings" onClick={close} className="menu-item">
                Profile &amp; Settings
              </Link>

              {/*
                관리자에게만 보인다. **화면 숨김은 편의일 뿐 방어선이 아니다** —
                /api/admin/** 는 서버가 hasRole("ADMIN")으로 막는다 (AUTH-P2)
              */}
              {profile?.role === "ADMIN" && (
                <Link href="/admin" onClick={close} className="menu-item">
                  Admin
                </Link>
              )}

              <div className="my-1 border-t border-white/10" />
              <button
                onClick={() => {
                  close();
                  void logout();
                }}
                className="menu-item !text-red-400 hover:!text-red-300"
              >
                Sign out
              </button>
            </>
          )}
        </Dropdown>
        </div>
      </header>
    </>
  );
}

/**
 * 현재 페이지는 **굵기**로, 호버는 **크기**로 알린다.
 *
 * 둘을 나눈 이유 — 활성 표시가 scale이면 마우스를 올렸을 때 변화가 없어 반응이 죽은 것처럼 보인다.
 * 굵기는 레이아웃 폭을 바꾸지만 항목이 고정 폭 슬롯 안에 있어 옆이 안 밀린다.
 * scale은 애초에 레이아웃을 다시 계산하지 않는다.
 *
 * h-full — 클릭·호버 범위가 헤더 높이 전체를 차지한다. 글자 높이만큼만 잡으면
 * 조준해서 눌러야 한다
 */
function NavLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`pointer-events-auto flex h-full items-center px-4 text-sm tracking-wide text-white uppercase transition-transform duration-100 ease-out hover:scale-110 ${
        active ? "font-bold" : "font-medium"
      }`}
    >
      {label}
    </Link>
  );
}
