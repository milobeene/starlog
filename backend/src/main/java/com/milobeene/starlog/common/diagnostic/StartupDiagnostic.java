package com.milobeene.starlog.common.diagnostic;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 스프링이 뜨기 **전에** DB를 확인한다 (v1.0 5단계, architecture §3).
 *
 * ## 왜 스프링 밖인가
 *
 * 같은 실패가 스프링 안에서는 여러 얼굴로 나온다 — Hikari가 `CannotGetJdbcConnectionException`으로,
 * Flyway가 `FlywayException`으로, 검증이 `SchemaManagementException`으로 죽는다.
 * 거기서 "비번이 틀린 건지 호스트가 없는 건지"를 도로 끄집어내려면 예외를 몇 겹 벗겨야 하고,
 * 라이브러리가 판올림될 때마다 그 껍질이 바뀐다.
 *
 * **JDBC 한 줄이면 SQLState가 그대로 나온다.** 스프링 컨텍스트가 필요 없으니
 * 실패했을 때 기동 시간도 안 버린다 (Hikari 타임아웃까지 기다릴 일이 없다).
 *
 * ## 언제 도나
 *
 * `--starlog.diagnose=true`(또는 `STARLOG_DIAGNOSE=1`)일 때만. **일렉트론이 띄울 때만 켠다.**
 * 개발자가 `bootRun`으로 띄우는 길에는 안 끼어든다 — 그 길이 살아 있어야 백엔드를 고칠 때
 * 일렉트론을 거치지 않는다 (architecture §2 "딸려오는 자잘한 일" 1번).
 *
 * ## 하는 일
 *
 * <pre>
 *   접속 → 실패면 SQLState로 분류하고 죽는다
 *        → 되면 스키마를 본다
 *            flyway_schema_history 있음 → 버전이 jar보다 최신이면 죽는다
 *            없는데 다른 테이블이 있음   → DB_NOT_EMPTY로 죽는다
 *            둘 다 없음(빈 DB)          → 통과. Flyway가 다 만든다
 * </pre>
 *
 * **만드는 건 자동, 지우는 건 절대 자동이 아니다.**
 */
public final class StartupDiagnostic {

    private static final String FLYWAY_HISTORY = "flyway_schema_history";

    private StartupDiagnostic() {
    }

    /**
     * 진단하고, 문제가 있으면 **프로세스를 끝낸다.** 통과하면 조용히 돌아온다.
     *
     * `System.exit`을 여기서 부르는 게 거칠어 보이지만, 여기는 아직 스프링도 안 뜬 `main()`이라
     * 닫아야 할 자원도 되돌릴 상태도 없다. 예외를 던져 올려봐야 받을 곳이 없다
     */
    public static void runOrExit(String[] args) {
        Map<String, String> config = resolve(args);
        if (!"true".equals(config.get("starlog.diagnose"))) {
            return;
        }
        String url = config.get("spring.datasource.url");
        String username = config.get("spring.datasource.username");
        /*
         * ⚠️ **주소와 사용자명이 둘 다 넘어왔을 때만 진단한다.**
         *
         * 하나라도 없으면 스프링은 `application.yml`에서 읽어 쓰는데 여기는 그걸 안 본다.
         * 그러면 **서로 다른 자격증명으로 접속하게 되고**, H2 파일 모드에서는 그게 조용한
         * 사고가 된다 — 첫 접속이 DB를 만들므로, 진단이 빈 사용자명으로 파일을 만들어 두면
         * 곧이어 붙는 스프링이 자기 계정으로는 못 열어 `Wrong user name or password`로 죽는다.
         * (실제로 이렇게 났다. 새 세이브파일이 만들어지자마자 못 쓰게 된다.)
         *
         * 일렉트론은 항상 셋을 다 넘긴다. 안 넘기는 건 개발자가 손으로 띄우는 길이고,
         * 그 길에서는 진단이 빠지는 게 맞다
         */
        if (url == null || url.isBlank() || username == null) {
            return;
        }

        DiagnosticCode failure = diagnose(
                url,
                username,
                config.getOrDefault("spring.datasource.password", ""));

        if (failure != null) {
            System.out.println(failure.marker());
            System.out.flush();
            System.exit(failure.exitCode());
        }
    }

    /** 통과면 null. 테스트가 이 메서드를 직접 부른다 — {@code System.exit}이 없어야 테스트가 산다 */
    public static DiagnosticCode diagnose(String url, String username, String password) {
        try (Connection conn = DriverManager.getConnection(url, username, password)) {
            return inspectSchema(conn);
        } catch (SQLException e) {
            return classify(e);
        }
    }

    /**
     * SQLState는 SQL 표준이라 드라이버가 달라도 앞 두 자리(클래스)는 같은 뜻이다.
     * 세 자리까지 보는 건 PostgreSQL 전용 코드들이라 H2에서는 안 걸리고, 걸릴 필요도 없다
     * (H2는 파일이라 인증도 네트워크도 없다)
     */
    static DiagnosticCode classify(SQLException e) {   // 가시성: 테스트가 매핑을 직접 단언한다
        String state = e.getSQLState();
        if (state == null) {
            return DiagnosticCode.DB_UNKNOWN_ERROR;
        }
        if (state.startsWith("08")) {
            return DiagnosticCode.DB_UNREACHABLE;      // connection exception
        }
        if (state.startsWith("28")) {
            return DiagnosticCode.DB_AUTH_FAILED;      // invalid authorization
        }
        if (state.equals("3D000")) {
            return DiagnosticCode.DB_NOT_FOUND;        // invalid catalog name
        }
        /*
         * H2는 자기 에러 코드를 그대로 SQLState로 준다. 90020 = Database may be already in use.
         * 표준 코드가 아니라 H2 전용이지만, **파일 잠금이라는 개념 자체가 로컬 모드에만 있다**
         */
        if (state.equals("90020")) {
            return DiagnosticCode.DB_IN_USE;
        }
        return DiagnosticCode.DB_UNKNOWN_ERROR;
    }

    private static DiagnosticCode inspectSchema(Connection conn) throws SQLException {
        /*
         * `getSchema()`를 쓰는 이유 — URL에 `currentSchema=starlog`를 주면 우리 테이블이
         * 그 스키마에만 들어간다. "public에 남의 테이블이 있다"가 우리 문제가 아니게 되는 탈출구다.
         * 하드코딩하면 그 탈출구가 막힌다
         */
        String schema = conn.getSchema();
        /*
         * ⚠️ **실제 이름을 그대로 들고 간다.** Flyway는 H2에 테이블을 **따옴표 친 소문자**로
         * 만든다(`"flyway_schema_history"`). 그런데 H2는 따옴표 없는 식별자를 대문자로 올리므로,
         * 아래에서 `select ... from flyway_schema_history`라고 쓰면 못 찾고 42S02로 죽는다.
         * PostgreSQL에서는 반대로 소문자라 안 따옴표해도 되는데, **두 DB에서 동시에 맞는 건
         * "information_schema가 알려준 이름을 큰따옴표로 감싸는 것"뿐이다.**
         * (실제로 이 한 줄 때문에 로컬 모드 두 번째 실행이 전부 DB_UNKNOWN_ERROR로 죽었다.)
         */
        String historyTable = null;
        boolean hasOther = false;

        String sql = "select table_name from information_schema.tables where table_schema = '"
                + schema.replace("'", "''") + "'";
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                String name = rs.getString(1);
                if (FLYWAY_HISTORY.equalsIgnoreCase(name)) {
                    historyTable = name;
                } else {
                    hasOther = true;
                }
            }
        }

        if (historyTable != null) {
            return schemaTooNew(conn, historyTable) ? DiagnosticCode.SCHEMA_TOO_NEW : null;
        }
        return hasOther ? DiagnosticCode.DB_NOT_EMPTY : null;
    }

    /**
     * DB가 앱보다 앞서 있으면 막는다.
     *
     * 이 경우가 실제로 생긴다 — 같은 클라우드 DB를 최신 앱으로 쓰다가 옛 앱으로 열면,
     * Hibernate 검증은 통과할 수 있는데(컬럼이 늘기만 했다면) **앱이 모르는 제약을 어기는 INSERT**를
     * 날린다. 조용히 굴러가다 저장할 때 터지는 게 최악이라 문 앞에서 막는다
     */
    private static boolean schemaTooNew(Connection conn, String historyTable) {
        long inDb = 0;
        /*
         * ⚠️ **테이블도 컬럼도 큰따옴표로 감싼다.** Flyway는 H2에 전부 소문자로 만드는데
         * H2는 따옴표 없는 식별자를 대문자로 올린다 — 따옴표를 빼면 테이블은 42S02,
         * 컬럼은 42S22(`Column "VERSION" not found`)로 죽는다.
         * PostgreSQL도 소문자라 큰따옴표가 그대로 맞는다. **두 DB에서 동시에 맞는 유일한 형태다**
         */
        String sql = "select \"version\" from \"" + historyTable
                + "\" where \"success\" = true and \"version\" is not null";
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                inDb = Math.max(inDb, majorOf(rs.getString(1)));
            }
        } catch (SQLException e) {
            /*
             * **진단 실패가 앱을 막으면 안 된다.** 여기까지 왔다는 건 우리 스키마라는 뜻이고,
             * 버전 비교는 "혹시 앱이 옛것인가"를 보는 부가 검사일 뿐이다.
             * 못 읽으면 통과시키고 Flyway가 제 검사를 하게 둔다 —
             * 이 한 줄이 없어서 실제로 **정상적인 세이브파일이 열리지 않았다**
             */
            return false;
        }
        return inDb > bundledMaxVersion();
    }

    /** 마이그레이션 버전을 `V4__…` 형태로만 쓰고 있어 주 버전만 본다 */
    private static long majorOf(String version) {
        try {
            int dot = version.indexOf('.');
            return Long.parseLong(dot < 0 ? version : version.substring(0, dot));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static final Pattern MIGRATION = Pattern.compile("^V(\\d+)(?:\\.\\d+)*__");

    /**
     * jar 안의 마이그레이션 파일을 세서 "이 앱이 아는 최신 버전"을 구한다.
     *
     * 상수로 박아두면 V5를 추가할 때 **여기를 같이 고쳐야 한다는 걸 아무도 기억 못 한다.**
     * 파일이 곧 사실이므로 파일을 읽는다. jar 안이라 `File`로는 못 읽어
     * 스프링의 리소스 스캐너를 쓴다 — 컨텍스트 없이 도는 유틸이다
     */
    private static long bundledMaxVersion() {
        try {
            Resource[] found = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:db/migration/V*__*.sql");
            return java.util.Arrays.stream(found)
                    .map(Resource::getFilename)
                    .filter(java.util.Objects::nonNull)
                    .map(MIGRATION::matcher)
                    .filter(Matcher::find)
                    .map(m -> Long.parseLong(m.group(1)))
                    .max(Comparator.naturalOrder())
                    .orElse(0L);
        } catch (Exception e) {
            /*
             * 못 세면 0이 되고, 그러면 DB의 어떤 버전도 "더 최신"이 되어 전부 막힌다.
             * 진단 실패가 앱을 막는 건 본말전도라 이때는 통과시킨다 —
             * 뒤에서 Flyway가 제 검사를 다시 한다
             */
            return Long.MAX_VALUE;
        }
    }

    /**
     * 인자(`--키=값`)를 먼저 보고, 없으면 환경변수를 본다.
     *
     * 환경변수를 함께 보는 이유 — **DB 비번을 인자로 넘기면 `ps`에 그대로 찍힌다.**
     * 일렉트론은 비밀이 아닌 것(포트·프로필)만 인자로 주고 비번은 환경변수로 준다.
     * 스프링도 정확히 같은 두 경로를 읽으므로, 여기만 특별한 규칙을 만드는 게 아니다
     */
    private static Map<String, String> resolve(String[] args) {
        Map<String, String> out = new HashMap<>();
        for (String key : new String[]{
                "starlog.diagnose",
                "spring.datasource.url",
                "spring.datasource.username",
                "spring.datasource.password"}) {
            String fromEnv = System.getenv(key.toUpperCase().replace('.', '_'));
            if (fromEnv != null) {
                out.put(key, fromEnv);
            }
        }
        for (String arg : args) {
            if (!arg.startsWith("--")) {
                continue;
            }
            int eq = arg.indexOf('=');
            if (eq < 0) {
                continue;
            }
            String key = arg.substring(2, eq);
            if (out.containsKey(key) || key.startsWith("starlog.") || key.startsWith("spring.datasource.")) {
                out.put(key, arg.substring(eq + 1));
            }
        }
        return out;
    }
}
