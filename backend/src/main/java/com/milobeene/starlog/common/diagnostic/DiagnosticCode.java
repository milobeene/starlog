package com.milobeene.starlog.common.diagnostic;

/**
 * 기동 진단 결과 (v1.0 5단계).
 *
 * **왜 코드로 만드나** — 일렉트론이 사용자에게 한글 안내를 띄워야 하는데,
 * 예외 메시지를 그대로 보여주면 "Connection to ep-xxx.neon.tech:5432 refused"가 뜬다.
 * 사람이 읽고 뭘 고쳐야 할지 알 수 있는 문장은 **화면 쪽에만 있으면 되고**,
 * 백엔드는 "무슨 부류의 실패인지"만 정확히 넘기면 된다.
 *
 * 코드 종류를 미리 못 박아두는 게 실제 일이다. 안 하면 "연결 실패" 한 줄만 뜨는 앱이 나온다
 * (docs/v1.0-architecture.md §3).
 */
public enum DiagnosticCode {

    /** 호스트를 못 찾거나 거절당함 — 주소 오타 / 인터넷 / 방화벽 */
    DB_UNREACHABLE,

    /** 사용자명·비밀번호가 틀림 */
    DB_AUTH_FAILED,

    /** 접속은 됐는데 그 이름의 데이터베이스가 없음 */
    DB_NOT_FOUND,

    /**
     * 우리 것이 아닌 테이블이 이미 있음.
     *
     * **이때만 사람이 직접 [초기화]를 누른다.** 무료 티어 DB 하나를 여러 프로젝트가
     * 나눠 쓰는 건 흔하고, "URL만 넣으면 알아서"를 하려다 drop을 돌리면 복구가 없다.
     * 탈출구는 스키마 지정이다 — `currentSchema=starlog`를 주면 이 경우가 아예 안 생긴다
     */
    DB_NOT_EMPTY,

    /** DB 스키마가 이 앱이 아는 것보다 최신 — 앱을 업데이트해야 한다 */
    SCHEMA_TOO_NEW,

    /** 위 어디에도 안 맞는 접속 실패 */
    DB_UNKNOWN_ERROR,

    /**
     * 세이브파일을 다른 프로세스가 이미 열고 있음 (H2 파일 잠금).
     *
     * **흔하다.** 앱을 두 번 켜거나, 입구로 돌아간 직후 옛 백엔드가 아직 안 죽었을 때 난다.
     * 이걸 UNKNOWN에 섞어두면 "로그를 확인하세요"만 뜨는데,
     * 실제로 필요한 안내는 "이미 실행 중인 창이 있습니다" 한 줄이다.
     *
     * **맨 뒤에 붙였다** — `exitCode()`가 ordinal 기반이라 중간에 끼우면 기존 코드가 전부 밀린다
     */
    DB_IN_USE;

    /**
     * 일렉트론이 stdout에서 긁어갈 한 줄.
     *
     * 종료 코드만 쓰지 않는 이유 — 종료 코드는 OS·JVM이 이미 쓰는 값들과 섞이고
     * (137은 SIGKILL, 1은 그냥 실패), 로그 파일에 남지도 않는다.
     * 한 줄을 찍으면 **로그만 봐도 왜 죽었는지 나온다**
     */
    public String marker() {
        return "STARLOG_DIAGNOSTIC: " + name();
    }

    /** 40부터 쓴다 — 1(일반 실패)·130(SIGINT)·137(SIGKILL) 같은 관례값과 안 겹치게 */
    public int exitCode() {
        return 40 + ordinal();
    }
}
