"use client";

import type { BacklogCard, PageResponse } from "./types";
import type { Filters } from "@/components/library/FilterBox";

/**
 * 라이브러리 화면의 마지막 상태 (v1.2).
 *
 * ## 왜 필요한가
 *
 * 상세에서 [Back to library]를 누르면 **늘 라이브러리 루트**로 갔다. 폴더 안에서
 * 들어갔든 필터를 잔뜩 걸어놨든 전부 날아가서, 열 개를 훑어보려면 매번 다시 걸어야 했다.
 *
 * ## 응답까지 들고 있는다
 *
 * 상태만 기억하고 다시 받으면 돌아올 때마다 스켈레톤이 스친다. 브라우저 뒤로가기가
 * 즉시인 이유는 **그린 것을 그대로 다시 보여주기 때문**이다. 여기서도 마지막 목록 응답을
 * 들고 있다가 즉시 그리고, 뒤에서 조용히 다시 받아 바뀐 것만 갈아 끼운다.
 *
 * ⚠️ **모듈 스코프라 문서가 다시 로드되면 사라진다** — 그게 맞다.
 * 새로고침은 "처음부터"라는 뜻이고, 다른 세이브파일로 옮겨도 자동으로 비워진다.
 */
type LibraryState = {
  view: "grid" | "folder";
  filters: Filters;
  query: string;
  sort: string;
  page: number;
  /** 폴더 탭에서 열어둔 폴더. null이면 폴더 목록 */
  openFolder: string | null;
  /** 마지막 목록 응답. 돌아왔을 때 스켈레톤 없이 그린다 */
  cards: PageResponse<BacklogCard> | null;
};

let saved: LibraryState | null = null;

export function rememberLibrary(state: LibraryState) {
  saved = state;
}

/** 마지막 상태. 없으면 null — 호출부가 기본값을 쓴다 */
export function takeLibrary(): LibraryState | null {
  return saved;
}

/** 목록만 갈아 끼운다. 상태는 그대로 두고 응답만 최신으로 */
export function rememberCards(cards: PageResponse<BacklogCard> | null) {
  if (saved) saved.cards = cards;
}
