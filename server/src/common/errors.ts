/**
 * 실패 응답 — 자바 `GlobalExceptionHandler`와 **같은 상태코드·같은 JSON**을 낸다.
 *
 * 화면은 `{code, message}`만 알아본다. 형태가 다르면 코드도 메시지도 못 꺼내고 기본 문구를 띄운다
 * (자바 시절 "올리지 못했습니다"만 뜨던 사고가 정확히 그것이었다).
 */

export class AppError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
  body(): Record<string, unknown> {
    return { code: this.code, message: this.message };
  }
}

/** 404 — 없거나, 있어도 내 것이 아님 */
export class NotFound extends AppError {
  constructor(message: string) { super(404, "NOT_FOUND", message); }
}

/** 400 — 입력값 규칙 위반 */
export class InvalidInput extends AppError {
  constructor(message: string) { super(400, "INVALID_INPUT", message); }
}

/** 400 — 본문을 아예 못 읽음 (깨진 JSON, 없는 enum 값, 날짜 형식 오류) */
export class Unreadable extends InvalidInput {
  constructor() { super("요청 본문을 읽을 수 없습니다"); }
}

/** 409 — 중복·상태 충돌 */
export class Conflict extends AppError {
  constructor(message: string) { super(409, "CONFLICT", message); }
}

/**
 * 409 — 삭제된 행이 이미 있어 되살리기가 가능한 상태 (§7.4).
 * 자바는 예외 타입 → 라우트 매핑을 전역 핸들러가 쥐었는데, 여기선 던지는 쪽이 라우트를 같이 준다.
 * 되살리기 라우트는 둘뿐이다: `/api/backlog/{id}/revive`, `/api/me/platform-accounts/{id}/revive`
 */
export class Revivable extends AppError {
  constructor(message: string, readonly targetId: number, readonly reviveUrl: string) {
    super(409, "REVIVABLE", message);
  }
  override body() {
    return { code: this.code, message: this.message, targetId: this.targetId, reviveUrl: this.reviveUrl };
  }
}

/** 429 — 우리가 스스로 막은 것 (외부 고장 아님). 코드는 부르는 쪽이 정한다 */
export class TooManyRequests extends AppError {
  constructor(code: string, message: string) { super(429, code, message); }
}

/** 외부 서비스 이름 — 자바 `ExternalApiException.Service` */
export const EXTERNAL_SERVICE = {
  GAME_CATALOG: "게임 정보 서비스",
  FILE_STORAGE: "이미지 저장소",
  MAIL: "메일 발송 서비스",
  TRANSLATE: "번역 서비스",
} as const;
export type ExternalService = keyof typeof EXTERNAL_SERVICE;

/**
 * 502 — 외부 API 장애. 메시지는 사용자용 한 문장으로 고정이고, 원인(detail)은 로그에만 남긴다
 */
export class ExternalApi extends AppError {
  constructor(readonly service: ExternalService, readonly detail: string) {
    super(502, "EXTERNAL_API_ERROR",
      `${EXTERNAL_SERVICE[service]}에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요`);
  }
}

/** 413 — 업로드가 전송 한도를 넘었다 (우리 검증 규칙이 아니라 본문 크기 상한) */
export class FileTooLarge extends AppError {
  constructor() { super(413, "FILE_TOO_LARGE", "파일이 너무 큽니다"); }
}

/** 500 — 파일을 읽거나 쓰지 못했다. 원인 메시지는 절대 경로가 새므로 내보내지 않는다 */
export class FileIo extends AppError {
  constructor(override readonly cause?: unknown) {
    super(500, "FILE_IO_ERROR", "파일을 읽거나 저장하지 못했습니다. 데이터 폴더를 쓸 수 있는지 확인해 주세요");
  }
}

/** 409 — DB 제약 위반. 앱 검증은 최선 노력이고 진짜 방어선은 DB다 */
export class ConstraintViolation extends AppError {
  constructor() { super(409, "CONSTRAINT_VIOLATION", "이미 존재하는 값입니다"); }
}

/**
 * 드라이버 오류에서 SQLSTATE를 꺼낸다. Drizzle은 원인을 `cause`로 감싸서 던진다.
 * 23xxx(무결성 제약 — 유니크·FK·NOT NULL·CHECK)면 자바 `DataIntegrityViolationException`과 같은 자리
 */
export function sqlState(e: unknown): string | null {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; cur = (cur as { cause?: unknown }).cause, depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

export const isIntegrityViolation = (e: unknown) => sqlState(e)?.startsWith("23") ?? false;
export const isUniqueViolation = (e: unknown) => sqlState(e) === "23505";
