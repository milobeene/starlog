package com.milobeene.starlog.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * **데스크탑 빌드가 실제로 뜨는지** 확인한다.
 *
 * ## 왜 아직 필요한가
 *
 * 원래는 `@Profile("!desktop")`이 붙은 웹 전용 빈을 누가 무심코 물어서 컨텍스트가
 * 통째로 죽는 걸 잡던 그물이었다 (실제로 `AdminController`가 `SystemStatusService`를 물었다).
 * **v1.0 8단계에서 그 프로필 게이트가 전부 사라졌다** — 웹 전용 빈 자체가 없어졌기 때문이다.
 *
 * 그래도 남긴다. 이제 잡는 것은 다른 부류다 — `desktop` 프로필로 뜰 때만 갈리는 설정
 * (`application-desktop.yml`의 커넥션 풀·로깅)이 컨텍스트를 깨뜨리지 않는지 본다.
 *
 * ⚠️ **프로필 순서가 뜻을 갖는다.** 프로필 파일은 활성 순서대로 위에 쌓이므로 `test`가
 * 뒤에 와야 `application-test.yml`(인메모리·ddl-auto:create)이 이긴다.
 * 반대로 뒀다가 컨텍스트가 통째로 안 떴다
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:desktop;MODE=PostgreSQL;DB_CLOSE_DELAY=-1"
})
@ActiveProfiles({"desktop", "test"})
class DesktopProfileTest {

    @Test
    void 데스크탑_프로필로도_기동된다() {
        // 검증은 컨텍스트 기동 자체다
    }
}
