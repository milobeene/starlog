package com.milobeene.gamebacklog;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 마이그레이션 ↔ 엔티티 드리프트 감시.
 *
 * 일반 테스트는 ddl-auto: create로 엔티티에서 스키마를 만들기 때문에, 엔티티를 고치고
 * 마이그레이션 추가를 잊어도 383개가 전부 초록불이다. 이 테스트만 실제 배포 경로를 탄다 —
 * 빈 DB에 Flyway로 V1부터 전부 적용한 뒤, Hibernate validate가 엔티티 매핑과 대조한다.
 * 컬럼 하나라도 어긋나면 컨텍스트 기동이 실패해서 여기서 빨간불이 난다.
 */
@SpringBootTest(properties = {
        // dev(H2 TCP)와 prod(PostgreSQL) 양쪽을 대표하는 PostgreSQL 모드 인메모리 DB
        "spring.datasource.url=jdbc:h2:mem:flyway-validate;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
class FlywayMigrationTest {

    @Test
    void 마이그레이션_적용_후_엔티티와_스키마가_일치한다() {
        // 검증은 컨텍스트 기동 자체. Flyway 적용 실패든 validate 불일치든 여기 못 온다
    }
}
