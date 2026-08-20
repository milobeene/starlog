package com.milobeene.gamebacklog.common.exception;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    /** 409 — 되살리기 안내. ConflictException보다 먼저 잡힌다 */
    @ExceptionHandler(RevivableException.class)
    public ResponseEntity<RevivableErrorResponse> handleRevivable(RevivableException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new RevivableErrorResponse(
                        "REVIVABLE", e.getMessage(), e.getTargetId(), e.reviveUrl()));
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

    /** 400 — Bean Validation 실패 (H-6에서 본격적으로 쓰인다) */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));

        return ResponseEntity.badRequest()
                .body(new ErrorResponse("INVALID_INPUT", message));
    }
}
