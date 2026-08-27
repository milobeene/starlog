package com.milobeene.starlog.common.diagnostic;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 다섯 갈래 진단 (architecture §3).
 *
 * **스프링을 안 띄운다.** 진단이 `main()`에서 컨텍스트 없이 도는 게 요점이라
 * 테스트도 같은 조건이어야 한다. 덤으로 전부 합쳐 1초가 안 걸린다
 */
class StartupDiagnosticTest {

    /** 인메모리 H2를 테스트마다 다른 이름으로 연다 — 같은 이름이면 앞 테스트의 테이블이 남는다 */
    private static String url(String name) {
        return "jdbc:h2:mem:" + name + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
    }

    private static void exec(String url, String... sqls) throws SQLException {
        try (Connection conn = DriverManager.getConnection(url, "sa", "");
             Statement st = conn.createStatement()) {
            for (String sql : sqls) {
                st.execute(sql);
            }
        }
    }

    @Test
    void 빈_DB는_통과한다() {
        //given //when
        DiagnosticCode result = StartupDiagnostic.diagnose(url("empty"), "sa", "");

        //then — Flyway가 다 만든다. 아무것도 안 물어봐야 한다
        assertThat(result).isNull();
    }

    @Test
    void 남의_테이블이_있으면_막는다() throws SQLException {
        //given — 무료 티어 DB 하나를 다른 프로젝트가 이미 쓰고 있는 상황
        String url = url("someone-else");
        exec(url, "create table blog_post (id bigint primary key)");

        //when
        DiagnosticCode result = StartupDiagnostic.diagnose(url, "sa", "");

        //then — 만드는 건 자동이어도 지우는 건 사람이 누른다
        assertThat(result).isEqualTo(DiagnosticCode.DB_NOT_EMPTY);
    }

    @Test
    void 우리_스키마가_구버전이면_통과한다() throws SQLException {
        //given — 이 앱은 V4까지 안다. DB는 V3에 멈춰 있다
        String url = url("older");
        exec(url, historyDdl(), insertVersion("3"), "create table member (id bigint primary key)");

        //when
        DiagnosticCode result = StartupDiagnostic.diagnose(url, "sa", "");

        //then — Flyway가 V4를 올린다. 막을 이유가 없다
        assertThat(result).isNull();
    }

    @Test
    void DB가_앱보다_최신이면_막는다() throws SQLException {
        //given — 최신 앱으로 쓰던 클라우드 DB를 옛 앱으로 여는 상황
        String url = url("newer");
        exec(url, historyDdl(), insertVersion("999"), "create table member (id bigint primary key)");

        //when
        DiagnosticCode result = StartupDiagnostic.diagnose(url, "sa", "");

        //then — 조용히 굴러가다 저장할 때 터지는 게 최악이라 문 앞에서 막는다
        assertThat(result).isEqualTo(DiagnosticCode.SCHEMA_TOO_NEW);
    }

    @Test
    void 실패한_마이그레이션_기록은_버전으로_안_친다() throws SQLException {
        //given — success=false면 그 버전은 DB에 반영되지 않았다
        String url = url("failed-migration");
        exec(url, historyDdl(),
                "insert into \"flyway_schema_history\" values (1, '999', 'x', 'SQL', 'x', 0, 'sa', current_timestamp, 0, false)");

        //when //then
        assertThat(StartupDiagnostic.diagnose(url, "sa", "")).isNull();
    }

    @Test
    void 접속_자체가_안_되면_UNREACHABLE() {
        //given — 아무도 안 듣는 포트
        String url = "jdbc:postgresql://127.0.0.1:1/none";

        //when
        DiagnosticCode result = StartupDiagnostic.diagnose(url, "x", "x");

        //then — 주소 오타나 인터넷 문제다. 비번 문제와 섞이면 안 된다
        assertThat(result).isEqualTo(DiagnosticCode.DB_UNREACHABLE);
    }

    @Test
    void 비밀번호가_틀리면_AUTH_FAILED() throws SQLException {
        //given — H2도 첫 접속의 자격증명으로 DB를 만든다
        String url = url("auth");
        exec2(url, "sa", "right-one");

        //when
        DiagnosticCode result = StartupDiagnostic.diagnose(url, "sa", "wrong-one");

        //then
        assertThat(result).isEqualTo(DiagnosticCode.DB_AUTH_FAILED);
    }

    @Test
    void 버전_기록을_못_읽어도_앱을_막지_않는다() throws SQLException {
        //given — 우리 스키마인데 이력 테이블 모양이 예상과 다르다 (컬럼 이름이 없다)
        String url = url("odd-history");
        exec(url, "create table \"flyway_schema_history\" (\"installed_rank\" integer primary key)",
                "create table member (id bigint primary key)");

        //when
        DiagnosticCode result = StartupDiagnostic.diagnose(url, "sa", "");

        //then — 버전 비교는 부가 검사다. 못 읽는다고 정상 세이브파일을 못 열면 본말전도다
        assertThat(result).isNull();
    }

    /**
     * 앱을 두 번 켠 상황.
     *
     * **여기서는 실제 잠금을 재현할 수 없다** — H2 파일 잠금은 *다른 프로세스*를 막지,
     * 같은 JVM 안의 두 번째 접속은 그냥 공유된다. 프로세스를 새로 띄우면 재현되지만
     * 단위 테스트에 JVM 기동을 넣을 값은 아니다.
     * → **매핑만 여기서 단언하고**, 실제 동작은 jar로 확인했다 (exit 46 / DB_IN_USE)
     */
    @Test
    void 파일이_잠겨_있으면_IN_USE로_분류한다() {
        //given — H2는 자기 에러 코드를 그대로 SQLState로 준다. 90020 = already in use
        SQLException locked = new SQLException("Database may be already in use", "90020");

        //when //then — "로그를 확인하세요"가 아니라 "이미 실행 중입니다"가 나와야 한다
        assertThat(StartupDiagnostic.classify(locked)).isEqualTo(DiagnosticCode.DB_IN_USE);
    }

    @Test
    void 사용자명을_안_주면_진단을_건너뛴다() throws Exception {
        /*
         * given — 주소만 주고 사용자명은 안 준 상황(개발자가 손으로 띄우는 길).
         * 여기서 진단이 제멋대로 붙으면 **H2 파일이 빈 사용자명으로 만들어지고**,
         * 곧이어 붙는 스프링이 자기 계정으로 못 열어 죽는다. 실제로 그렇게 났다
         */
        java.nio.file.Path dir = java.nio.file.Files.createTempDirectory("starlog-diag");
        String base = dir.resolve("새기록").toString();

        //when
        StartupDiagnostic.runOrExit(new String[]{
                "--starlog.diagnose=true",
                "--spring.datasource.url=jdbc:h2:file:" + base + ";MODE=PostgreSQL"});

        //then — 파일을 건드리지도 않았어야 한다
        assertThat(java.nio.file.Files.exists(java.nio.file.Path.of(base + ".mv.db"))).isFalse();
    }

    private static void exec2(String url, String user, String password) throws SQLException {
        try (Connection ignored = DriverManager.getConnection(url, user, password)) {
            // 열기만 해도 DB가 만들어진다
        }
    }

    /**
     * Flyway가 실제로 만드는 모양 그대로.
     *
     * ⚠️ **이름을 큰따옴표로 감싼 게 핵심이다.** Flyway는 H2에도 `"flyway_schema_history"`로
     * 만들어서 **소문자 이름**이 되는데, H2는 따옴표 없는 식별자를 대문자로 올린다.
     * 따옴표 없이 만들면 진단 코드의 버그(따옴표 없이 조회하던 것)를 못 잡는다 —
     * 실제로 그래서 로컬 모드 두 번째 실행이 전부 DB_UNKNOWN_ERROR로 죽었다.
     * 컬럼 순서까지 맞춰야 아래 insert가 산다
     */
    private static String historyDdl() {
        return """
                create table "flyway_schema_history" (
                    "installed_rank" integer primary key,
                    "version" varchar(50),
                    "description" varchar(200),
                    "type" varchar(20),
                    "script" varchar(1000),
                    "checksum" integer,
                    "installed_by" varchar(100),
                    "installed_on" timestamp,
                    "execution_time" integer,
                    "success" boolean
                )""";
    }

    private static String insertVersion(String version) {
        return "insert into \"flyway_schema_history\" values (1, '" + version
                + "', 'x', 'SQL', 'x', 0, 'sa', current_timestamp, 0, true)";
    }
}
