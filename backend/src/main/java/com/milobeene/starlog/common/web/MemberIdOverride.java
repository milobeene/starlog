package com.milobeene.starlog.common.web;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.NativeWebRequest;

/**
 * `@LoginMember` 값을 요청 헤더로 덮어쓰는 통로.
 *
 * **인증이 아니다.** v1.0에는 로그인이 없고 주인은 하나뿐이다.
 * 이건 컨트롤러 테스트가 "다른 회원인 척"하기 위한 장치이고,
 * 그 덕에 소유권 검증(남의 항목은 못 본다)이 계속 자동으로 지켜진다.
 *
 * 구현이 둘인 이유 — 실사용 빌드에는 헤더를 읽는 코드가 **아예 없어야** 한다.
 * `if (dev) { ... }` 로 두면 그 분기가 배포본에도 실려 나간다
 */
public interface MemberIdOverride {

    /** 덮어쓸 값이 없으면 null */
    Long from(NativeWebRequest request);

    /** dev·test — 헤더를 읽는다 */
    @Component
    @Profile({"dev", "test"})
    class HeaderOverride implements MemberIdOverride {

        @Override
        public Long from(NativeWebRequest request) {
            String raw = request.getHeader(LoginMemberArgumentResolver.TEST_MEMBER_HEADER);
            if (raw == null || raw.isBlank()) {
                return null;
            }
            try {
                return Long.valueOf(raw.trim());
            } catch (NumberFormatException e) {
                // 잘못된 값으로 400을 내지 않는다 — 이건 테스트 편의 장치이지 입력이 아니다
                return null;
            }
        }
    }

    /** 그 밖(실사용) — 언제나 주인이다 */
    @Component
    @Profile("!dev & !test")
    class AlwaysOwner implements MemberIdOverride {

        @Override
        public Long from(NativeWebRequest request) {
            return null;
        }
    }
}
