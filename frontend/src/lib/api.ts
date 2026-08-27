import { API_BASE } from "@/lib/apiBase";

/**
 * 백엔드 호출 단일 창구.
 *
 * v1.0에서 인증이 사라지면서 쿠키·CSRF가 통째로 빠졌다.
 * 남은 약속은 하나 — `{ code, message }` 에러 형태를 백엔드가 전 계층에서 통일해 준다.
 *
 * `X-Member-Id`는 인증이 아니라 **개발용 스위치**다 (백엔드 LoginMemberArgumentResolver 참고)
 */

const BASE = API_BASE;

/** dev 편의 — 백엔드 dev 프로필의 X-Member-Id 헤더 인증. prod엔 이 빈이 없다 */
const DEV_MEMBER_ID = process.env.NEXT_PUBLIC_DEV_MEMBER_ID;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = {
  method?: string;
  body?: unknown;
  /** 로그인만 form 형식이다 (JSON이 아니다) */
  form?: Record<string, string>;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  if (DEV_MEMBER_ID) headers["X-Member-Id"] = DEV_MEMBER_ID;

  // GET은 CSRF 대상이 아니다
  if (method !== "GET") {
  }

  let payload: BodyInit | undefined;
  if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(options.form).toString();
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload,
    signal: options.signal,
  });

  // 서버는 매 응답에 현재 토큰을 실어준다. 로그인·로그아웃 때 회전하므로 항상 최신으로 덮는다

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string };
    throw new ApiError(
      res.status,
      err.code ?? `HTTP_${res.status}`,
      err.message ?? res.statusText,
      data,
    );
  }

  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, form: Record<string, string>) =>
    request<T>(path, { method: "POST", form }),
};

/** 화면이 분기해야 하는 에러 코드만 모아둔다 */
export const ERROR = {
  UNAUTHORIZED: "UNAUTHORIZED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  APPROVAL_PENDING: "APPROVAL_PENDING",
  FORBIDDEN: "FORBIDDEN",
  REVIVABLE: "REVIVABLE",
  /** 429 — 앱 전체가 외부 DB 한도에 닿았다. **1초 안에 풀린다** */
  CATALOG_BUSY: "CATALOG_BUSY",
  /** 429 — 내 하루치를 다 썼다. 자정에 풀린다 */
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
} as const;

/**
 * 429는 **오류가 아니라 "지금은 안 된다"**다. 두 뜻이 한 상태코드에 있어 code로 가른다.
 *
 * 서버가 사람이 읽을 문구를 이미 담아 보내므로 그대로 쓴다 —
 * 여기서 문구를 또 쓰면 서버와 화면이 다른 말을 하게 된다
 */
export function busyMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null;
  return error.message || "지금은 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
}

export function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.code === ERROR.SESSION_EXPIRED)
  );
}

/**
 * 화면에 띄울 에러 문구.
 *
 * `ApiError`만 메시지를 쓰면 **클라이언트 검증 문구가 통째로 사라진다** —
 * "새 비밀번호가 서로 다릅니다" 같은 걸 던져도 "저장하지 못했습니다"로 뭉개졌다.
 * 사람이 읽으라고 쓴 message가 있으면 그걸 그대로 보여준다
 */
export function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}

/** 쿼리스트링 조립 — null/undefined/빈 배열은 빼고, 배열은 같은 키를 반복한다 */
export function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, String(v)));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
