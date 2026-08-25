/**
 * 백엔드 호출 단일 창구.
 *
 * 세 가지를 항상 챙긴다 —
 *   1. credentials: 'include'  세션 쿠키가 크로스 도메인에서 실리려면 필수
 *   2. X-XSRF-TOKEN            쓰기 요청에 안 붙이면 전부 403 (쿠키-헤더 대조 방식)
 *   3. { code, message }       백엔드가 전 계층에서 통일해 주는 에러 형태
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

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

/** CSRF 쿠키는 httpOnly=false로 내려온다 — 그래서 JS가 읽어 헤더로 되돌려줄 수 있다 */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
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
    const token = readCookie("XSRF-TOKEN");
    if (token) headers["X-XSRF-TOKEN"] = token;
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
    credentials: "include",
    signal: options.signal,
  });

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
  FORBIDDEN: "FORBIDDEN",
  REVIVABLE: "REVIVABLE",
} as const;

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
