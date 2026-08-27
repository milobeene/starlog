package com.milobeene.starlog.system.dto;

/**
 * IGDB 연결 테스트 결과 (2026-08-28).
 *
 * **단계를 나눠서 준다.** "실패했습니다" 한 줄이면 키가 틀린 건지 인터넷이 없는 건지
 * 알 수가 없다 — 실제로 사용자가 키를 안 넣고 접속했다가 **빈 화면만 하염없이** 봤다.
 */
public record IgdbTestResult(boolean ok,
                             /** 토큰을 받았나 (= 키가 맞나) */
                             boolean tokenIssued,
                             /** 실제 검색이 도나 */
                             boolean searchWorks,
                             String message) {}
