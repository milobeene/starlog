package com.milobeene.gamebacklog.common.exception;

import com.milobeene.gamebacklog.backlog.exception.RevivableEntryException;
import com.milobeene.gamebacklog.platform.exception.RevivableAccountException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * 예외 → 상태코드 변환을 한 곳에 모은다 (FR-SYS-03).
 *
 * @RestControllerAdvice는 모든 @RestController를 감싸는 전역 처리기다.
 * 컨트롤러에서 예외가 빠져나오면 스프링이 여기서 타입에 맞는 메서드를 찾아 호출한다.
 * **더 구체적인 타입의 핸들러가 이긴다** — RevivableException은 ConflictException을
 * 상속하지만 전용 핸들러가 있으므로 그쪽으로 간다
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 404 — 없거나, 있어도 내 것이 아님 */
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse("NOT_FOUND", e.getMessage()));
    }

    /** 400 — 입력값 규칙 위반 */
    @ExceptionHandler(InvalidInputException.class)
    public ResponseEntity<ErrorResponse> handleInvalidInput(InvalidInputException e) {
        return ResponseEntity.badRequest()
                .body(new ErrorResponse("INVALID_INPUT", e.getMessage()));
    }

    /**
     * 되살리기 예외 타입 → 라우트. 라우트 문자열이 도메인 예외로 새지 않도록
     * 웹 계층인 여기가 매핑을 소유한다 (NFR-A1). common → 피처 의존이 생기지만
     * 전역 핸들러는 모든 컨트롤러를 감싸는 웹 진입점이라 허용한다.
     * 새 되살리기 도메인을 만들면 여기 한 줄을 추가해야 한다 — 빠뜨리면
     * 아래 핸들러가 IllegalStateException을 던져 테스트에서 바로 드러난다
     */
    private static final Map<Class<? extends RevivableException>, String> REVIVE_ROUTES = Map.of(
            RevivableEntryException.class, "/api/backlog/%d/revive",
            RevivableAccountException.class, "/api/me/platform-accounts/%d/revive");

    /** 409 — 되살리기 안내. ConflictException보다 먼저 잡힌다 */
    @ExceptionHandler(RevivableException.class)
    public ResponseEntity<RevivableErrorResponse> handleRevivable(RevivableException e) {
        String template = REVIVE_ROUTES.get(e.getClass());
        if (template == null) {
            throw new IllegalStateException(
                    "REVIVE_ROUTES에 등록되지 않은 되살리기 예외: " + e.getClass().getSimpleName());
        }

        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new RevivableErrorResponse(
                        "REVIVABLE", e.getMessage(), e.getTargetId(),
                        template.formatted(e.getTargetId())));
    }

    /** 409 — 중복·상태 충돌 */
    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(ConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse("CONFLICT", e.getMessage()));
    }

    /**
     * 409 — DB 유니크 제약 위반. 앱 검증은 최선 노력이고 진짜 방어선은 DB다.
     * 동시 요청이 앱 검증을 통과해도 여기서 걸린다
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrity(DataIntegrityViolationException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse("CONSTRAINT_VIOLATION", "이미 존재하는 값입니다"));
    }

    /** 400 — Bean Validation 실패 (H-6) */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));

        return ResponseEntity.badRequest()
                .body(new ErrorResponse("INVALID_INPUT", message));
    }

    /**
     * 400 — 본문을 아예 못 읽은 경우 (H-6).
     * 깨진 JSON, 없는 enum 값("status": "BOGUS"), 날짜 형식 오류가 여기로 온다.
     *
     * 이 핸들러가 없으면 스프링 기본 응답(timestamp/status/error/path)이 나가서
     * 우리 ErrorResponse와 형태가 달라진다 — 프론트가 두 가지 형식을 처리해야 한다.
     * 원인 메시지를 그대로 노출하지 않는 이유는 내부 타입명이 새기 때문이다
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest()
                .body(new ErrorResponse("INVALID_INPUT", "요청 본문을 읽을 수 없습니다"));
    }

    /** 400 — 경로 변수·쿼리 파라미터의 타입이 안 맞는다 (/api/backlog/abc) */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        return ResponseEntity.badRequest()
                .body(new ErrorResponse("INVALID_INPUT", e.getName() + " 값이 올바르지 않습니다"));
    }
}
