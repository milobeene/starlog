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

/**
 * 서버가 응답 헤더로 알려준 최신 CSRF 토큰.
 *
 * **쿠키만으로는 배포에서 안 된다.** `document.cookie`는 그 문서의 도메인이 심은 쿠키만 읽는다 —
 * vercel.app에서 도는 이 코드는 onrender.com이 내려준 XSRF-TOKEN을 볼 수 없다.
 * 로컬에서 멀쩡했던 건 쿠키가 포트를 구분하지 않아 :3000과 :8080이 같은 저장소를 쓰기 때문이다.
 *
 * 그래서 서버가 같은 값을 `X-XSRF-TOKEN` 응답 헤더로도 내려주고(CORS로 노출), 여기 담아둔다.
 * 대조는 여전히 서버가 쿠키 ↔ 헤더로 한다 — 쿠키는 브라우저가 자동으로 싣고,
 * 이 값은 헤더에 실어 보낼 용도다
 */
let csrfToken: string | null = null;

/** 같은 도메인 배포(로컬)에서의 폴백. 헤더를 아직 못 받은 첫 요청을 위해 남겨둔다 */
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
    const token = csrfToken ?? readCookie("XSRF-TOKEN");
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

  // 서버는 매 응답에 현재 토큰을 실어준다. 로그인·로그아웃 때 회전하므로 항상 최신으로 덮는다
  const rotated = res.headers.get("X-XSRF-TOKEN");
  if (rotated) csrfToken = rotated;

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
