package com.milobeene.gamebacklog;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * V2 데이터 이행 검증.
 *
 * FlywayMigrationTest는 **빈 DB**에 마이그레이션을 걸어 스키마만 본다. 그런데 V2에서 진짜 위험한 건
 * 스키마가 아니라 **기존 행을 옮기는 UPDATE들**이다 — 마스터를 회원별로 복제하고 회차·취득·계정의
 * FK를 사본으로 갈아끼운다. 여기서 하나라도 어긋나면 Neon의 실데이터가 조용히 끊긴다.
 *
 * 그래서 V1까지만 적용한 뒤 V1 모양의 데이터를 손으로 넣고, V2를 그 위에 돌려 결과를 확인한다.
 * ddl-auto를 none으로 두는 이유 — 엔티티는 이미 V2 모양이라 V1 스키마와 대조하면 기동이 실패한다
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:v2-data;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.flyway.enabled=true",
        "spring.flyway.target=1",
        "spring.jpa.hibernate.ddl-auto=none"
})
@ActiveProfiles("test")
class V2DataMigrationTest {

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;

    @Test
    void 마스터가_회원별로_복제되고_기존_참조가_사본으로_옮겨진다() {
        //given — V1 모양의 데이터. 회원 둘이 같은 마스터를 공유하던 상황이다
        givenV1Data();

        //when
        Flyway.configure().dataSource(dataSource).load().migrate();

        //then ── 마스터가 회원 수만큼 복제된다 (플랫폼 2종 × 회원 2명)
        assertThat(count("select count(*) from platform")).isEqualTo(4);
        assertThat(count("select count(*) from platform where member_id = 1")).isEqualTo(2);

        // 회차가 "내 사본" 기기를 가리킨다
        Long deviceOwner = jdbc.queryForObject("""
                select d.member_id from playthrough p join device d on d.id = p.device_id
                 where p.id = 1""", Long.class);
        assertThat(deviceOwner).isEqualTo(1L);

        // 보유 기기의 라벨·메모가 사본 위로 승격된다 — "Nintendo Switch" → "거실 스위치"
        assertThat(jdbc.queryForObject("""
                select d.label from playthrough p join device d on d.id = p.device_id
                 where p.id = 1""", String.class)).isEqualTo("거실 스위치");
        assertThat(jdbc.queryForObject("""
                select d.device_type from playthrough p join device d on d.id = p.device_id
                 where p.id = 1""", String.class)).isEqualTo("Nintendo Switch");
        assertThat(jdbc.queryForObject("""
                select d.memo from playthrough p join device d on d.id = p.device_id
                 where p.id = 1""", String.class)).isEqualTo("조이콘 드리프트 있음");

        // 같은 기종 두 번째 보유 기기도 독립된 행으로 살아남는다
        assertThat(count("select count(*) from device where member_id = 1 and label = '침실 스위치'"))
                .isEqualTo(1);

        // 에뮬레이터도 내 사본으로
        assertThat(jdbc.queryForObject("""
                select e.member_id from playthrough p join emulator e on e.id = p.emulator_id
                 where p.id = 1""", Long.class)).isEqualTo(1L);

        // 입력 방식 enum이 내 행으로 승격된다
        assertThat(jdbc.queryForObject("""
                select i.name from playthrough p join input_method i on i.id = p.input_method_id
                 where p.id = 1""", String.class)).isEqualTo("닌텐도 컨트롤러");
        assertThat(count("select count(*) from input_method where member_id = 1")).isEqualTo(4);

        // 계정·취득의 플랫폼도 내 사본으로. 회원 2의 계정은 회원 2의 사본을 문다
        assertThat(jdbc.queryForObject("""
                select p.member_id from platform_account a join platform p on p.id = a.platform_id
                 where a.id = 1""", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("""
                select p.member_id from platform_account a join platform p on p.id = a.platform_id
                 where a.id = 2""", Long.class)).isEqualTo(2L);
        assertThat(jdbc.queryForObject("""
                select p.name from acquisition a join platform p on p.id = a.platform_id
                 where a.id = 1""", String.class)).isEqualTo("Steam");
        assertThat(jdbc.queryForObject("""
                select p.member_id from acquisition a join platform p on p.id = a.platform_id
                 where a.id = 1""", Long.class)).isEqualTo(1L);

        // 마스터였던 원본 행은 남지 않는다
        assertThat(count("select count(*) from platform where member_id is null")).isZero();
        assertThat(count("select count(*) from device where member_id is null")).isZero();
    }

    private void givenV1Data() {
        jdbc.execute("""
                insert into member (id, email, nickname, role, email_verified)
                values (1, 'a@example.com', '회원A', 'USER', true),
                       (2, 'b@example.com', '회원B', 'USER', true)""");

        // 마스터 3종은 id를 직접 박지 않는다 — V2가 여기에 새 행을 넣으므로
        // identity 카운터가 실제 운영처럼 앞서 있어야 한다
        jdbc.execute("insert into platform (name) values ('Steam'), ('Nintendo')");
        jdbc.execute("insert into device (name) values ('Nintendo Switch'), ('Windows PC')");
        jdbc.execute("insert into emulator (name) values ('Ryujinx')");

        jdbc.execute("""
                insert into platform_account (id, member_id, platform_id, account_label)
                values (1, 1, (select id from platform where name = 'Steam'), '본계정'),
                       (2, 2, (select id from platform where name = 'Steam'), '남의 본계정')""");

        // 같은 기종을 두 대 보유. 회차가 가리키는 건 기종뿐이라 한 대만 이어붙을 수 있다
        jdbc.execute("""
                insert into member_device (id, member_id, device_id, label, memo)
                values (1, 1, (select id from device where name = 'Nintendo Switch'),
                        '거실 스위치', '조이콘 드리프트 있음'),
                       (2, 1, (select id from device where name = 'Nintendo Switch'),
                        '침실 스위치', null)""");

        jdbc.execute("""
                insert into game (id, source, name) values (1, 'MANUAL', 'Hollow Knight')""");
        jdbc.execute("""
                insert into backlog_entry (id, member_id, game_id, status, display_name)
                values (1, 1, 1, 'PLAYING', 'Hollow Knight')""");

        jdbc.execute("""
                insert into playthrough
                       (id, backlog_entry_id, sequence_no, status, started_on,
                        device_id, emulator_id, platform_account_id, input_method)
                values (1, 1, 1, 'PLAYING', date '2026-01-01',
                        (select id from device where name = 'Nintendo Switch'),
                        (select id from emulator where name = 'Ryujinx'),
                        1, 'NINTENDO')""");

        jdbc.execute("""
                insert into acquisition (id, backlog_entry_id, method, platform_id)
                values (1, 1, 'PURCHASED', (select id from platform where name = 'Steam'))""");
    }

    private long count(String sql) {
        Long value = jdbc.queryForObject(sql, Long.class);
        return value == null ? 0 : value;
    }
}
