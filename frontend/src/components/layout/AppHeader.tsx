"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Dropdown from "@/components/ui/Dropdown";
import HeaderSymbol from "./HeaderSymbol";
import { useSession } from "@/lib/session";
import { getBridge } from "@/lib/desktop";

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
      {/*
        ## 왜 flex인가 (v1.0 반응형)
        예전엔 워드마크·프로필이 absolute(left-8/right-8)였고 nav가 절대 중앙이었다.
        데스크탑에서는 괜찮지만 **390px에서는 워드마크와 nav가 겹친다** — absolute끼리는
        서로를 밀어내지 못하기 때문이다. 컨테이너를 flex로 바꿔 서로 밀게 했다.
        심볼을 정확히 화면 중앙에 두는 절대 배치는 md 이상에서만 쓴다
      */}
      <header className="page-x pointer-events-none fixed top-0 left-0 z-40 flex h-16 w-full items-center justify-between mix-blend-difference">
        {/*
          워드마크. **입구로 나가는 출구다.**

          데스크탑에서는 여기 링크를 그냥 따라가면 안 된다 — `/`는 스프링이 서빙하는
          사본이라 다리(`window.starlog`)가 없어 아무것도 못 고르는 빈 모드 선택 화면이 뜬다.
          진짜 입구는 일렉트론이 `app://`로 여는 쪽이고, 거기 가려면 **백엔드를 먼저 내려야** 한다
          (DB를 갈아끼우러 나가는 것이니까). 그래서 다리가 있으면 기본 이동을 막고
          `backToEntry()`에 맡긴다.

          브라우저에는 다리가 없으니 평범한 링크로 남아 `[들어가기]` 화면으로 간다
        */}
        <Link
          href="/"
          onClick={(e) => {
            const bridge = getBridge();
            if (!bridge) return;
            e.preventDefault();
            bridge.backToEntry();
          }}
          className="pointer-events-auto flex h-full shrink-0 translate-y-[0.049em] items-center font-display text-sm leading-none font-bold tracking-[0.15em] text-white sm:text-base sm:tracking-[0.2em] lg:text-lg"
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
        {/*
          ## 폰(< md)에서는 이 덩어리를 통째로 숨긴다
          w-44 슬롯 두 개 + 심볼 = 최소 400px이라 390px 화면에 애초에 안 들어간다.
          대신 아래 모바일 줄이 같은 링크를 더 촘촘하게 보여준다.
          심볼 장난감은 폰에서 뺀다 — 2초 꾹 누르기는 스크롤 제스처와 싸운다
        */}
        <nav className="absolute left-1/2 hidden h-full -translate-x-1/2 items-center md:flex">
          <div className="flex h-full w-28 items-center justify-end lg:w-44">
            {LEFT.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} />
            ))}
          </div>

          {/* 심볼은 장식이다 — 링크가 아니다. 나가는 출구는 왼쪽 워드마크 하나면 된다 */}
          <HeaderSymbol />

          <div className="flex h-full w-28 items-center justify-start lg:w-44">
            {RIGHT.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} />
            ))}
          </div>
        </nav>

        {/*
          ## 폰 전용 메뉴 줄 (< md)
          심볼과 고정 슬롯을 뺀 압축판이다. 390px에서 워드마크(≈93px) + 프로필(≈30px)을
          빼면 가운데에 약 250px이 남고, 세 항목이 10px 글자로 약 160px이라 들어간다
        */}
        <nav className="flex h-full min-w-0 flex-1 items-center justify-center md:hidden">
          {[...LEFT, ...RIGHT].map((item) => (
            <NavLink key={item.href} {...item} pathname={pathname} compact />
          ))}
        </nav>

        {/*
          프로필도 헤더 안에 둬서 함께 반전된다. 대신 **패널만 포탈로 body에 뺀다** —
          자식은 조상의 블렌딩에서 못 빠져나오므로, 안에 두면 메뉴가 형광색으로 뒤집힌다
        */}
        <div className="pointer-events-auto flex h-full shrink-0 items-center">
        <Dropdown
          portal
          trigger={() => (
            <div className="flex items-center space-x-2 py-2 text-sm font-semibold text-white">
              {/* 폰에서는 닉네임을 접는다 — 가운데 메뉴 줄과 자리를 다툰다 */}
              <span className="hidden max-w-[9rem] truncate sm:inline">{profile?.nickname || " "}</span>
              {/* 이름이 없으면 화살표만 덩그러니 남아 무엇을 여는 메뉴인지 안 보인다 → 사람 아이콘 */}
              <svg className="-mt-[2px] h-5 w-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  d="M16 20v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M14 7a4 4 0 11-8 0 4 4 0 018 0z"
                  transform="translate(2 0)"
                />
              </svg>
              <svg className="hidden h-3.5 w-3.5 sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                **권한 조건이 사라졌다** (v1.0 8단계). 자기 DB의 주인이니 늘 열려 있다.
                예전엔 `role === "ADMIN"`으로 가렸는데, 화면을 숨기는 건 애초에 보안이 아니었고
                (실제 방어선은 서버의 403이었다) 이제 막을 상대도 없다
              */}
              <Link href="/system" onClick={close} className="menu-item">
                System
              </Link>
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
  compact = false,
}: {
  href: string;
  label: string;
  pathname: string;
  /** 폰용 — 글자와 좌우 패딩을 줄인다. 누르는 몸은 헤더 높이 전체로 유지한다 */
  compact?: boolean;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      /*
       * ## 왜 translate로 밀어야 하나
       * 폰트마다 글자(잉크)가 줄 상자 안에 앉는 높이가 다르다. flex로 상자를 가운데
       * 맞춰도 **글자는 가운데가 아니다.** 브라우저에서 실측한 값:
       *   Syncopate(워드마크)  잉크가 0.049em **위**
       *   switzer(메뉴)        잉크가 0.148em **아래**
       * 둘을 각자 제 상자 중앙으로 되돌리면 글자 크기가 달라도 서로 높이가 맞는다.
       * 위 leading-none 덕에 이 값이 글자 크기와 무관한 상수라서 em 하나로 끝난다
       */
      /*
       * leading-none이 **반드시 있어야 한다.** `text-[10px]`은 임의값이라 Tailwind가
       * line-height를 같이 안 붙이고 부모 것을 상속한다 — 그러면 글자 크기마다 줄 상자
       * 비율이 달라져 아래 translate 보정이 폭에 따라 어긋난다.
       * 줄 상자를 글자 크기에 붙여두면 보정값이 em 하나로 고정된다
       */
      className={`pointer-events-auto flex h-full -translate-y-[0.148em] items-center text-white uppercase transition-transform duration-100 ease-out hover:scale-110 ${
        compact ? "px-2 text-[10px] leading-none tracking-wider" : "px-4 text-sm leading-none tracking-wide"
      } ${active ? "font-bold" : "font-medium"}`}
    >
      {label}
    </Link>
  );
}
