package com.milobeene.starlog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 배포 스키마(V1) 검증 — 드리프트 감시 + 제약 실재 확인.
 *
 * 일반 테스트는 `ddl-auto: create`로 **엔티티에서** 스키마를 만든다. 그래서 마이그레이션을
 * 고치는 걸 잊어도 400여 개가 전부 초록불이다. 이 테스트만 실제 배포 경로를 탄다 —
 * 빈 DB에 Flyway로 V1을 적용한 뒤 검사한다.
 *
 * **왜 validate만으로는 부족한가** — Hibernate validate는 (테이블, 컬럼, 타입)만 대조하고
 * unique·check·FK·index는 **아예 보지 않는다.** 실제로 V1에서 제약을 전부 지워도
 * 이 테스트는 초록불이었다. CLAUDE.md JPA 원칙 7번("DB 유니크 제약이 진짜 방어선")이
 * CI에서 한 번도 확인된 적이 없다는 뜻이라, 아래 단언으로 그 사각지대를 덮는다.
 *
 * **개수가 아니라 이름을 센다** — H2는 FK마다 인덱스를 자동 생성하고 PostgreSQL은 안 해서
 * 개수 단언은 DB마다 깨진다. V1이 모든 제약에 이름을 붙여둔 걸 살려 이름의 존재를 본다
 * (OI-16이 이름을 붙인 이유가 에러 메시지 가독성이었는데, 여기서 한 번 더 값을 한다).
 */
@SpringBootTest(properties = {
        // H2의 PostgreSQL 호환 모드. **PG 전용 동작까지 대변하지는 못한다** —
        // 타입 추론·인덱스 방향·격리 수준 차이는 이 테스트의 사각지대다 (아래 PgSchemaTest가 덮는다)
        "spring.datasource.url=jdbc:h2:mem:flyway-validate;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
class FlywayMigrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void 마이그레이션_적용_후_엔티티와_스키마가_일치한다() {
        // 검증은 컨텍스트 기동 자체. Flyway 적용 실패든 validate 불일치든 여기 못 온다
    }

    @Test
    void V1이_유니크_제약을_전부_만든다() {
        //given — 2026-08-26 V1 기준. 스키마를 늘리면 이 목록도 같이 늘려야 한다.
        // uk_backlog_entry_tag가 없는 이유 — 태그가 항목당 하나가 되면서 조인 테이블이 사라졌다
        List<String> expected = List.of(
                "uk_member_email", "uk_member_google_subject", "uk_auth_token_hash",
                "uk_game_source_external_id", "uk_platform", "uk_device", "uk_emulator",
                "uk_input_method", "uk_platform_account", "uk_tag_member_name",
                "uk_genre_member_name", "uk_backlog_entry_member_game",
                "uk_backlog_entry_genre", "uk_playthrough_sequence", "uk_cover_image_backlog_entry");

        //when
        List<String> actual = constraintNamesOf("UNIQUE");

        //then — 하나라도 빠지면 그 순간 중복이 DB를 통과한다
        assertThat(actual).containsAll(upper(expected));
    }

    @Test
    void V1이_check_제약을_전부_만든다() {
        //given — enum 도메인을 DB에서 지키는 7개
        List<String> expected = List.of(
                "chk_member_role", "chk_auth_token_purpose", "chk_game_source",
                "chk_subscription_billing_cycle", "chk_backlog_entry_status",
                "chk_playthrough_status", "chk_acquisition_method");

        //when //then
        assertThat(constraintNamesOf("CHECK")).containsAll(upper(expected));
    }

    @Test
    void 마이그레이션이_외래키를_전부_만든다() {
        //given — 34개 전부를 나열하는 대신 개수로 본다. FK는 이름보다 "빠진 게 없는가"가 중요하고,
        // 이름 목록은 스키마가 늘 때마다 갱신 비용이 크다
        //when
        int count = constraintNamesOf("FOREIGN KEY").size();

        //then
        // 태그 단일화로 34 → 33 (조인 FK 2개 빠지고 tag_id 1개 추가),
        // 세션 테이블(V2)의 spring_session_attributes_fk가 더해져 34,
        // V3의 fk_usage_quota_member가 더해져 35.
        //
        // **V5에서 셋이 한꺼번에 빠져 32** — audit_log·usage_quota·spring_session을 지웠다.
        // 감사 로그와 쿼터는 물어볼 상황이 없어서, 세션은 로그인이 없어서 (architecture §9).
        // api_call_log는 회원을 안 물어서 FK를 늘리지 않는다
        assertThat(count).isEqualTo(32);
    }

    @Test
    void V1이_정렬_인덱스를_방향까지_지정해_만든다() {
        /*
         * 목록 정렬 4종은 전부 desc nulls last다 (BacklogSort). PostgreSQL에서 방향 무지정
         * btree는 역방향 스캔이 desc nulls FIRST라 정렬을 못 태운다 — 그래서 V1이 방향을
         * 명시했고, 그 명시가 지워지지 않았는지 여기서 지킨다.
         *
         * **이 테스트는 배포 스키마(V1)를 본다.** IndexDefinitionTest는 ddl-auto:create가 만든
         * 엔티티 스키마를 보므로 배포 스키마의 인덱스는 여기서만 검증된다
         */
        List<String> expected = List.of(
                "idx_backlog_member_status", "idx_backlog_member_last_played",
                "idx_backlog_member_display_name", "idx_backlog_member_released_on",
                "idx_backlog_member_rating", "idx_backlog_member_play_time",
                "idx_playthrough_input_method",
                // V5 — 정렬 키(§10-5)와 API 호출 기록. 둘 다 이 인덱스로만 훑는다
                "idx_backlog_entry_sort_key", "idx_api_call_log_provider_called");

        //when
        List<String> actual = jdbc.queryForList(
                "select index_name from information_schema.indexes where index_schema = 'PUBLIC'",
                String.class);

        //then
        assertThat(upper(actual)).containsAll(upper(expected));
    }

    @Test
    void 목록_인덱스의_선두_컬럼은_member_id다() {
        /*
         * 회원 필터가 항상 붙으므로 선두가 member_id가 아니면 그 인덱스는 무의미하다.
         * (IndexDefinitionTest가 보던 불변식인데, 그쪽은 ddl-auto:create가 만든 **엔티티 스키마**를
         *  검사해서 배포 스키마와 무관했다 — 여기로 옮겨 배포 스키마를 보게 했다)
         */
        //when
        List<Object[]> firstColumns = jdbc.query(
                "select index_name, column_name from information_schema.index_columns"
                        + " where table_name = 'BACKLOG_ENTRY' and index_name like 'IDX_BACKLOG_MEMBER%'"
                        + "   and ordinal_position = 1",
                (rs, rowNum) -> new Object[] {rs.getString(1), rs.getString(2)});

        //then
        assertThat(firstColumns).isNotEmpty();
        assertThat(firstColumns).allSatisfy(row ->
                assertThat(row[1]).as("인덱스 %s의 선두 컬럼", row[0]).isEqualTo("MEMBER_ID"));
    }

    private List<String> constraintNamesOf(String type) {
        return jdbc.queryForList(
                "select constraint_name from information_schema.table_constraints"
                        + " where constraint_schema = 'PUBLIC' and constraint_type = ?",
                String.class, type);
    }

    private static List<String> upper(List<String> names) {
        return names.stream().map(name -> name.toUpperCase(Locale.ROOT)).toList();
    }
}
