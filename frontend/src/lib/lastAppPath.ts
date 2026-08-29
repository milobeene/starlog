"use client";

/**
 * 입구로 나가기 직전의 앱 경로 (2026-08-29).
 *
 * 입구와 앱은 **같은 문서**다(v1.0 §2 이후). 그래서 나가기 전 경로를 일렉트론까지
 * 왕복시킬 필요가 없다 — 모듈 변수 하나면 된다.
 *
 * ⚠️ **경로만 담는다.** 필터·스크롤은 되살리지 않는다(사용자 결정). 주소에 필터를
 * 실으려면 라이브러리 화면을 한 번 더 손봐야 하는데, 얻는 것에 비해 값이 크다.
 *
 * 문서가 다시 로드되면 사라진다 — 그게 맞다. 새로고침은 "처음부터"라는 뜻이다
 */
let lastPath: string | null = null;

/** 입구로 나갈 때 부른다. 입구(`/`) 자신은 담지 않는다 */
export function rememberAppPath(path: string) {
  if (path && path !== "/") {
    lastPath = path;
  }
}

/** 되돌아갈 곳. 기억한 게 없으면 대시보드 */
export function takeAppPath(): string {
  return lastPath ?? "/dashboard";
}
