package com.milobeene.starlog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.milobeene.starlog.admin.service.AdminQueryService;
import com.milobeene.starlog.backlog.dto.BacklogSearchCondition;
import com.milobeene.starlog.backlog.dto.BacklogSort;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.tag.service.TagService;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

/**
 * **실 PostgreSQL 검증.** 나머지 400여 개는 H2로 돌고 여기만 컨테이너를 띄운다.
 *
 * 왜 필요한가 — H2(MODE=PostgreSQL)가 원리적으로 못 잡는 부류가 실제로 운영까지 새어나갔다:
 *   · null 파라미터 타입 추론 — `:param is null or …` 관용구가 PG에서 `lower(bytea)` /
 *     `could not determine data type`으로 죽는다. 관리자 검색 2곳이 500이었는데 테스트는 전부 초록
 *   · 인덱스 정렬 방향 — PG는 방향 무지정 btree의 역방향이 `desc nulls FIRST`라 정렬을 못 태운다.
 *     H2는 방언 기본값이 nulls last라 괴리 자체가 안 드러난다
 *
 * 전용 `org.testcontainers:postgresql` 모듈이 이 환경에서 해석되지 않아 GenericContainer로
 * 직접 띄운다. 필요한 건 JDBC URL 하나뿐이라 손해가 없다.
 *
 * ⚠️ 도커가 없으면 이 클래스는 실패한다. 로컬에서 도커 없이 돌리려면
 * `./gradlew test --tests '*' -x` 대신 `-PexcludePgTests` 같은 스위치를 두는 게 다음 숙제다
 */
@SpringBootTest(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
class PostgresSchemaTest {

    private static final GenericContainer<?> POSTGRES =
            new GenericContainer<>(DockerImageName.parse("postgres:17-alpine"))
                    .withExposedPorts(5432)
                    .withEnv("POSTGRES_DB", "starlog")
                    .withEnv("POSTGRES_USER", "starlog")
                    .withEnv("POSTGRES_PASSWORD", "starlog")
                    // 초기화 중 한 번 떴다 재시작하므로 두 번째 신호를 기다린다
                    .waitingFor(Wait.forLogMessage(".*database system is ready to accept connections.*", 2));

    @BeforeAll
    static void startContainer() {
        POSTGRES.start();
    }

    @AfterAll
    static void stopContainer() {
        POSTGRES.stop();
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:postgresql://%s:%d/starlog"
                .formatted(POSTGRES.getHost(), POSTGRES.getMappedPort(5432)));
        registry.add("spring.datasource.username", () -> "starlog");
        registry.add("spring.datasource.password", () -> "starlog");
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired AdminQueryService adminQueryService;
    @Autowired TagService tagService;
    @Autowired BacklogService backlogService;
    @Autowired BacklogEntryRepository backlogEntryRepository;
    @Autowired GameRepository gameRepository;
    @Autowired EntityManager em;

    @Test
    void 마이그레이션이_실_PostgreSQL에서_적용되고_엔티티와_일치한다() {
        // 컨텍스트 기동 자체가 검증 (Flyway 적용 + Hibernate validate).
        // H2 호환 모드가 통과시키던 문법이 여기서 걸린다
        assertThat(jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_schema = 'public'"
                        + " and table_type = 'BASE TABLE'", Integer.class))
                // 25 → 24: 태그 조인 테이블이 사라졌다 (§6.7 v1.6)
                // 24 → 26: V2가 spring_session 2개를 더한다 (O-4)
                // 26 → 27: V3이 usage_quota를 더한다 (일일 쿼터, WEB-ONLY)
                .isEqualTo(27);
    }

    @Test
    void 태그가_backlog_entry의_nullable_FK다() {
        //given — 조인 테이블이 아니라 항목이 태그를 직접 문다. null이 "태그 없음"이다
        //when
        String nullable = jdbc.queryForObject(
                "select is_nullable from information_schema.columns"
                        + " where table_name = 'backlog_entry' and column_name = 'tag_id'",
                String.class);

        //then
        assertThat(nullable).isEqualTo("YES");
        assertThat(jdbc.queryForObject(
                "select count(*) from information_schema.table_constraints"
                        + " where constraint_name = 'fk_backlog_entry_tag'", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void 정렬_인덱스가_desc_nulls_last로_생성된다() {
        //given — H2에서는 방언 기본값이 nulls last라 방향 누락이 드러나지 않는다
        //when
        String definition = jdbc.queryForObject(
                "select indexdef from pg_indexes where indexname = 'idx_backlog_member_rating'",
                String.class);

        //then — 방향이 빠지면 PG가 정렬에 이 인덱스를 못 쓴다
        assertThat(definition).contains("DESC NULLS LAST");
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    void 태그_쿼리_3종이_실_PostgreSQL에서_돈다() {
        /*
         * 태그 단일화(§6.7 v1.6)로 새로 생긴 쿼리 셋을 실 PG에서 한 번 태운다.
         * 나머지 태그 테스트는 전부 H2에서 도는데, **이 파일의 존재 이유가 그게 못 잡는 부류**다 —
         * 실제로 파셋의 생성자 표현식(`new …FacetCount(...)`)이 옛 판에서 PG 전용으로 죽은 적이 있다.
         *
         *   · countByTag  — 생성자 표현식 + group by
         *   · hasTag      — QueryDSL 동적 술어(exists 서브쿼리에서 FK 직접 비교로 바뀐 자리)
         *   · clearTag    — 벌크 update. FK가 살아 있으면 Tag 물리 삭제가 막힌다
         */
        //given
        Member member = Member.signUpWithEmail("pg-tag@example.com", "1111", "테스터");
        em.persist(member);
        Game game = Game.manual("Hollow Knight");
        gameRepository.persist(game);
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        tagService.changeTag(member.getId(), entryId, "명작");
        em.flush();

        Long tagId = tagService.findDictionary(member.getId()).get(0).getId();

        //when //then — 파셋 집계
        assertThat(backlogEntryRepository.countByTag(member.getId()))
                .singleElement()
                .satisfies(facet -> {
                    assertThat(facet.name()).isEqualTo("명작");
                    assertThat(facet.count()).isEqualTo(1);
                });

        //when //then — 태그 필터 (QueryDSL)
        assertThat(backlogEntryRepository.search(member.getId(),
                        new BacklogSearchCondition(null, null, tagId, null, null, null, null,
                                null, null, null),
                        BacklogSort.NAME, org.springframework.data.domain.PageRequest.of(0, 10)))
                .hasSize(1);

        //when //then — 삭제 전파 (벌크 update → Tag 물리 삭제)
        tagService.delete(member.getId(), tagId);
        em.flush();
        em.clear();
        assertThat(tagService.findTagName(member.getId(), entryId)).isNull();
    }

    @Test
    void 관리자_검색이_빈_조건에서도_PostgreSQL을_통과한다() {
        /*
         * `:param is null or …` 관용구가 여기서 죽었다. 빈 조건(검색어·날짜 없음)이
         * 가장 흔한 호출인데 그게 500이었다 — H2는 전부 통과시켰다
         */
        assertThatCode(() -> adminQueryService.findMembers(null, null, null, 0, 30))
                .doesNotThrowAnyException();
        assertThatCode(() -> adminQueryService.findMembers("milo", LocalDate.of(2026, 1, 1),
                LocalDate.of(2026, 12, 31), 0, 30))
                .doesNotThrowAnyException();
        assertThatCode(() -> adminQueryService.findGames(null, 0, 30))
                .doesNotThrowAnyException();
        assertThatCode(() -> adminQueryService.findGames("hollow", 0, 30))
                .doesNotThrowAnyException();
    }
}
