package com.milobeene.gamebacklog.backlog.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.gamebacklog.support.ControllerTestSupport;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;

/**
 * 인덱스 정의 검증 (L-4).
 *
 * **실행계획이 아니라 "인덱스가 존재하는가"를 본다.** 계획을 단언하면 DB마다 달라 깨진다 —
 * 실제로 H2는 아래 복합 인덱스를 정렬에 쓰지 않고, 하이버네이트가 FK마다 자동 생성한
 * member_id 단일 인덱스로 필터만 한 뒤 메모리에서 정렬한다 (실측).
 *
 * **PostgreSQL은 FK에 인덱스를 자동 생성하지 않는다.** 그쪽에서는 이 복합 인덱스가
 * member_id에 대한 유일한 후보라 선택될 가능성이 높다 — 실행계획 확인은 Phase 9(O-2)에서 한다.
 *
 * 이 테스트가 지키는 것은 하나다: **@Index를 실수로 지우면 바로 빨개진다**
 */
class IndexDefinitionTest extends ControllerTestSupport {

    @Test
    public void 비정규화_정렬_컬럼_인덱스가_존재한다() {
        //given — 정렬 대상 3종 (§7.2). 오버라이드·마스터 합성을 피하려고 둔 컬럼들이다
        List<String> expected = List.of(
                "idx_backlog_member_status",
                "idx_backlog_member_last_played",
                "idx_backlog_member_display_name",
                "idx_backlog_member_released_on");

        //when
        List<String> actual = indexNamesOf("BACKLOG_ENTRY");

        //then
        assertThat(actual).containsAll(expected.stream().map(String::toUpperCase).toList());
    }

    @Test
    public void 인덱스의_첫_컬럼은_member_id다() {
        //given — 회원 필터가 항상 붙으므로 선행 컬럼이 아니면 무의미하다

        //when
        List<Object[]> columns = em.createNativeQuery("""
                        select index_name, column_name, ordinal_position
                        from information_schema.index_columns
                        where table_name = 'BACKLOG_ENTRY'
                          and index_name like 'IDX_BACKLOG_%'
                          and ordinal_position = 1
                        """).getResultList();

        //then
        assertThat(columns).isNotEmpty();
        assertThat(columns).allSatisfy(row ->
                assertThat(row[1]).as("인덱스 %s의 첫 컬럼", row[0]).isEqualTo("MEMBER_ID"));
    }

    @Test
    public void 유니크_제약이_이름을_갖고_있다() {
        //given — Phase 9 Flyway 전환 대비 (OI-16). 자동 생성 이름은 DB마다 달라 마이그레이션이 깨진다.
        // H2는 명명된 제약의 뒷받침 인덱스에 _INDEX_n을 덧붙이므로 제약 쪽을 본다

        //when
        List<String> names = constraintNamesOf("BACKLOG_ENTRY");

        //then
        assertThat(names).contains("UK_BACKLOG_ENTRY_MEMBER_GAME");
    }

    @Test
    public void 커버_이미지의_1대1_유니크는_존재하되_이름은_자동_생성이다() {
        //given — 설계서 ⚠️(v0.3)가 예고한 그대로다:
        // @OneToOne은 하이버네이트가 스스로 컬럼 unique를 만들고,
        // @Table(uniqueConstraints)로 같은 컬럼에 이름을 주면 중복으로 판정해 무시한다.
        // **제약 자체는 걸려 있다** — 이름만 자동 생성이고, 명명은 Phase 9(O-2) 숙제다

        //when
        List<Object[]> uniques = em.createNativeQuery("""
                        select tc.constraint_name, ccu.column_name
                        from information_schema.table_constraints tc
                        join information_schema.key_column_usage ccu
                          on tc.constraint_name = ccu.constraint_name
                        where tc.table_name = 'COVER_IMAGE'
                          and tc.constraint_type = 'UNIQUE'
                        """).getResultList();

        //then — 1:1을 지키는 제약이 실제로 있는지가 핵심이다
        assertThat(uniques)
                .as("cover_image.backlog_entry_id 에 unique 제약이 있어야 1:1이 보장된다")
                .anySatisfy(row -> assertThat(row[1]).isEqualTo("BACKLOG_ENTRY_ID"));
    }

    @SuppressWarnings("unchecked")
    private List<String> constraintNamesOf(String table) {
        List<String> raw = em.createNativeQuery("""
                        select constraint_name from information_schema.table_constraints
                        where table_name = :table
                        """)
                .setParameter("table", table)
                .getResultList();

        return raw.stream().map(name -> name.toUpperCase(Locale.ROOT)).toList();
    }

    @SuppressWarnings("unchecked")
    private List<String> indexNamesOf(String table) {
        List<String> raw = em.createNativeQuery("""
                        select distinct index_name from information_schema.indexes
                        where table_name = :table
                        """)
                .setParameter("table", table)
                .getResultList();

        return raw.stream().map(name -> name.toUpperCase(Locale.ROOT)).toList();
    }
}
