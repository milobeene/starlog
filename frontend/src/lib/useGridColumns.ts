"use client";

import { useEffect, useState } from "react";

/**
 * 라이브러리 그리드의 열 수.
 *
 * ⚠️ **이 표는 `GAME_GRID` 클래스와 한 쌍이다.** 한쪽만 고치면 페이지 끝에 빈 줄이 생기거나
 * 마지막 줄이 잘린다 — 페이지 크기를 `열 수 × 줄 수`로 계산하기 때문이다.
 * Tailwind는 클래스 이름을 정적으로 훑어야 해서 이 값으로 클래스를 만들어낼 수는 없다.
 *
 * 내림차순으로 두고 처음 맞는 것을 쓴다. 위에서부터 넓은 화면이다
 */
const BREAKPOINTS = [
  { query: "(min-width: 1280px)", columns: 8 },   // xl — PC 풀사이즈. 여기는 그대로 둔다
  { query: "(min-width: 1024px)", columns: 4 },   // lg — 사이드바가 나타나는 폭. 6→4
  { query: "(min-width: 768px)", columns: 3 },    // md — 4→3
  { query: "(min-width: 640px)", columns: 3 },    // sm
] as const;

const NARROWEST_COLUMNS = 2;

/** 라이브러리 게임 그리드. 위 BREAKPOINTS와 열 수가 같아야 한다 */
export const GAME_GRID =
  // 폰에서는 간격을 줄인다 — 390px에서 gap-x-6이면 카드가 그만큼 더 작아진다
  // 중간 단계(md·lg)에서 칸이 너무 작아 커버가 안 읽혔다 — 두 칸씩 줄였다.
  // xl(PC 풀사이즈) 8열은 그대로다
  "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8";

function measure(): number {
  // SSR에는 matchMedia가 없다. 첫 렌더는 가장 좁은 값으로 두고 마운트 후 교정한다
  if (typeof window === "undefined") return NARROWEST_COLUMNS;
  return BREAKPOINTS.find((item) => window.matchMedia(item.query).matches)?.columns
      ?? NARROWEST_COLUMNS;
}

/**
 * resize를 듣되 **열 수가 실제로 바뀔 때만** 리렌더된다 —
 * `setColumns`에 같은 값을 넣으면 React가 렌더를 건너뛰기 때문에,
 * 드래그하는 내내 이벤트가 쏟아져도 리렌더는 브레이크포인트를 넘는 순간에만 일어난다.
 *
 * ⚠️ 이 경로는 **자동 검증이 안 된다.** 개발 도구의 뷰포트 변경은 CDP 오버라이드라
 * innerWidth만 바꾸고 resize 이벤트를 쏘지 않는다(matchMedia의 change도 마찬가지).
 * 진입 시점의 계산은 폭을 바꿔 새로고침하면 확인된다
 */
export function useGridColumns(): number {
  /*
   * 초기값을 지연 계산한다. 상수로 두면 첫 렌더가 2열 기준(8개)으로 요청을 한 번 쏘고
   * 곧바로 32개로 다시 쏜다 — 매 진입마다 버려지는 왕복이 하나 생긴다.
   *
   * 하이드레이션은 안전하다: 서버는 window가 없어 NARROWEST를, 클라이언트는 실제 값을 받지만
   * **이 값이 마크업에 안 쓰이기 때문**이다(그리드 클래스는 GAME_GRID 상수, 이 값은 요청 크기만 정한다).
   * 나중에 이 값으로 무언가를 그리게 되면 그때는 불일치가 생긴다
   */
  const [columns, setColumns] = useState(measure);

  useEffect(() => {
    const update = () => setColumns(measure());
    update();

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}
