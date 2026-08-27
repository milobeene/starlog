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
                                  boolean fromBootConfig) {}
