package com.milobeene.starlog.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.milobeene.starlog.common.quota.NoOpQuotaGuard;
import com.milobeene.starlog.common.quota.QuotaGuard;
import com.milobeene.starlog.common.quota.QuotaKind;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * **로컬 앱 빌드가 실제로 뜨는지** 확인한다 (docs/web-only-inventory.md §5).
 *
 * `@Profile("!local-app")`을 하나씩 붙여 두는 것만으로는 부족하다 —
 * 그 빈을 `final` 필드로 물고 있는 쪽에 게이트가 없으면 컨텍스트가 통째로 죽는다.
 * 실제로 `AdminController`가 `SystemStatusService`를 물고 있어서 그랬다.
 *
 * **이 테스트가 v1.0으로 가는 길의 안전망이다.** WEB-ONLY 표시를 늘릴 때마다
 * 여기가 먼저 깨져서 알려 준다.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:local-app;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
})
@ActiveProfiles({"test", "local-app"})
class LocalAppProfileTest {

    @Autowired QuotaGuard quotaGuard;

    @Test
    void 로컬_앱_프로필로도_기동된다() {
        // 검증은 컨텍스트 기동 자체 — 웹 전용 빈을 누가 무심코 물면 여기 못 온다
    }

    @Test
    void 쿼터가_아무것도_안_한다() {
        //given //when //then — 나 혼자 쓰는 앱에 하루 200번 제한을 둘 이유가 없다
        assertThat(quotaGuard).isInstanceOf(NoOpQuotaGuard.class);
        assertThatCode(() -> {
            for (int i = 0; i < 500; i++) {
                quotaGuard.consume(1L, QuotaKind.GAME_SEARCH);
            }
        }).doesNotThrowAnyException();

        //then — 빈 목록이면 화면이 그 섹션을 통째로 안 그린다
        assertThat(quotaGuard.statusOf(1L)).isEmpty();
    }
}
