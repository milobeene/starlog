package com.milobeene.starlog.member.dto;

/**
 * 프로필 수정 (FR-AUTH-11의 데이터 부분). 이메일·비밀번호는 Phase 3의 몫이다.
 * memo는 TEXT 컬럼이라 도메인 제한이 없다 — 2000은 규칙이 아니라 폭주 방지 상한 (메모류 공통)
 */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ProfileUpdateRequest(@NotBlank @Size(max = 30) String nickname,
                                   @Size(max = 2000) String memo,
                                   /*
                                    * 유체 배경 팔레트. `#rrggbb` 다섯 개를 쉼표로 이은 한 줄이고,
                                    * **null이면 기본 팔레트로 되돌린다.**
                                    *
                                    * 여기 @Pattern은 형식만 거른다 — 진짜 규칙은 엔티티에 있다.
                                    * 빈 문자열을 허용하는 이유: 화면이 "기본값으로"를 누르면 빈 값이 온다
                                    */
                                   @Pattern(regexp = "|(#[0-9a-fA-F]{6})(,#[0-9a-fA-F]{6}){4}",
                                            message = "배경 색은 #rrggbb 다섯 개를 쉼표로 이어 주세요")
                                   String backgroundColors) {
}
