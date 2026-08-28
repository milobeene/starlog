package com.milobeene.starlog.system.dto;

/**
 * 앱 설정 (2026-08-28).
 *
 * ⚠️ **시크릿을 그대로 돌려준다.** 혼자 쓰는 앱이라 숨겨서 얻는 게 없고,
 * 실제 문제는 유출이 아니라 **"오타를 확인할 수가 없다"**는 것이다 (결정 63과 같은 판단).
 * 화면이 눈 버튼으로 가렸다 보였다 한다
 */
public record AppSettingsResponse(String igdbClientId,
                                  String igdbClientSecret,
                                  /** 부팅 설정에서 온 값인가. 화면이 "설정 파일에서 읽었습니다"를 띄운다 */
                                  boolean fromBootConfig,
                                  /** 번역 키. 안 넣었으면 null — 화면이 "아직 없음"으로 그린다 */
                                  String translateApiKey,
                                  /** 이번 달 번역 사용량. 키 칸 바로 옆에 있어야 뜻이 통한다 */
                                  TranslationUsage translation) {

    /**
     * ⚠️ **`guardChars`와 `freeChars`가 다르다.** 앞엣것은 우리가 막는 선(45만),
     * 뒤엣것은 구글이 공짜로 주는 양(50만)이다. 사이의 5만 자는 **우리가 적게 셀 수 있는
     * 오차**를 위한 여유다 — 화면이 둘을 같이 보여줘야 "왜 50만인데 45만에서 막히지"가 안 생긴다
     */
    public record TranslationUsage(long usedChars, long guardChars,
                                   long freeChars, long remainingChars) {}
}
