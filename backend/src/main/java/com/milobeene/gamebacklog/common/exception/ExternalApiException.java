package com.milobeene.gamebacklog.common.exception;

/**
 * 502 — 외부 서비스가 응답하지 않거나 이해할 수 없는 응답을 줬다 (FR-SYS-04).
 *
 * 500이 아닌 이유 — 우리 코드가 터진 게 아니라 **의존하는 쪽**이 터진 것이다.
 * 사용자에게는 "잠시 후 다시"가 맞는 안내고, 500이면 우리 버그를 찾으러 간다.
 * 이 예외가 나가면 어떤 것도 저장되지 않은 상태여야 한다 — 부분 저장 금지.
 *
 * **service를 들고 다니는 이유** — 외부 의존이 둘(게임 DB·이미지 저장소)로 늘었는데
 * 전역 핸들러가 메시지를 하나로 뭉개면 **커버 업로드가 실패해도 "게임 정보 서비스"라고 안내한다.**
 * 실제로 그렇게 나가는 것을 앱을 띄워 확인하고 고쳤다
 */
public class ExternalApiException extends RuntimeException {

    /** 사용자에게 보여줄 서비스 이름. 내부 벤더명(IGDB·R2)을 노출하지 않는다 */
    public enum Service {
        GAME_CATALOG("게임 정보 서비스"),
        FILE_STORAGE("이미지 저장소"),
        MAIL("메일 발송 서비스");

        private final String label;

        Service(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    private final Service service;

    public ExternalApiException(Service service, String message) {
        super(message);
        this.service = service;
    }

    public ExternalApiException(Service service, String message, Throwable cause) {
        super(message, cause);
        this.service = service;
    }

    public Service getService() {
        return service;
    }
}
