import { apiToken, apiUrl } from "@/lib/apiBase";

/**
 * 백엔드 호출 단일 창구.
 *
 * v1.0에서 인증이 사라지면서 쿠키·CSRF가 통째로 빠졌다.
 * 남은 약속은 하나 — `{ code, message }` 에러 형태를 백엔드가 전 계층에서 통일해 준다.
 */

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
  /** 파일 업로드용. 있으면 Content-Type을 안 붙인다 (브라우저가 boundary와 함께 채운다) */
  multipart?: FormData;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  /*
   * 서버는 운영에서 모든 `/api/*`에 이 머리글을 요구한다 (서버 `http/guard.ts`).
   * 주소의 `t=`가 아니라 머리글인 이유 — 서버가 쿼리 토큰은 GET에서만 받는다
   */
  const token = apiToken();
  if (token) headers["X-Starlog-Token"] = token;

  let payload: BodyInit | undefined;
  if (options.multipart) {
    /*
     * **Content-Type을 직접 안 쓴다.** 손으로 쓰면 boundary가 빠져서 서버가 파싱을 못 한다 —
     * FormData를 body로 주면 브라우저가 boundary까지 붙여 알아서 채운다
     */
    payload = options.multipart;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(options.body);
  }

  /*
   * 주소를 **부를 때마다** 정한다. 모듈 상수로 두면 안 된다 — 데스크탑은 접속 대상을 바꿀 때
   * 포트가 바뀌는데, 상수는 처음 값에 굳어서 그 뒤 전부 옛 포트로 나간다
   */
  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: payload,
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
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", body, signal }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** 파일 업로드 (v1.0 6·7단계). 커버 로컬 저장과 스크린샷이 쓴다 */
  postMultipart: <T>(path: string, multipart: FormData) =>
    request<T>(path, { method: "POST", multipart }),
};

/** 화면이 분기해야 하는 에러 코드만 모아둔다 */
export const ERROR = {
  REVIVABLE: "REVIVABLE",
} as const;

/**
 * 429는 **오류가 아니라 "지금은 안 된다"**다. 두 뜻이 한 상태코드에 있다 —
 * `CATALOG_BUSY`(앱 전체가 외부 한도에 닿음, 1초 안에 풀림)와 `QUOTA_EXCEEDED`(내 하루치 소진, 자정에 풀림).
 *
 * 서버가 사람이 읽을 문구를 이미 담아 보내므로 그대로 쓴다 —
 * 여기서 문구를 또 쓰면 서버와 화면이 다른 말을 하게 된다
 */
export function busyMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null;
  return error.message || "지금은 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
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
