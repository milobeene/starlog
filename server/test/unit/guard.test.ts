import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createApp } from "../../src/app";
import { loadConfig, setConfig } from "../../src/config";
import { contentTypeGuard, crossSiteGuard, setListenPort, sizeGuard } from "../../src/http/guard";
import { maskSecret } from "../../src/domains/system/routes";

/*
 * 문지기(`http/guard.ts`·`http/cors.ts`)만 본다 — DB를 안 연다.
 * 없는 경로(`/api/nope`)가 404면 "문지기를 다 통과했다"는 뜻이다
 */
const PORT = 5555;
const TOKEN = "a".repeat(64);
const HOST = `127.0.0.1:${PORT}`;

function setup(env: Record<string, string>) {
  setConfig(loadConfig({ STARLOG_DB_DIR: "memory://guard", STARLOG_PORT: String(PORT), ...env }));
  setListenPort(PORT);
  return createApp({ staticDir: null });
}

const req = (app: Hono, path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  app.request(`http://${HOST}${path}`, { ...init, headers: { Host: HOST, ...(init.headers ?? {}) } });

describe("운영 프로필 (토큰 있음)", () => {
  let app: Hono;
  beforeEach(() => { app = setup({ STARLOG_API_TOKEN: TOKEN }); });
  const auth = { "X-Starlog-Token": TOKEN };

  it("허용된 Host + 토큰이면 통과", async () => {
    expect((await req(app, "/api/nope", { headers: auth })).status).toBe(404);
    expect((await req(app, "/api/nope", { headers: { ...auth, Host: `localhost:${PORT}` } })).status).toBe(404);
  });

  it("DNS 리바인딩 — 남의 Host는 토큰이 있어도 403", async () => {
    const r = await req(app, "/api/nope", { headers: { ...auth, Host: `evil.example:${PORT}`, Origin: `http://evil.example:${PORT}` } });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ code: "FORBIDDEN_HOST", message: "허용되지 않은 호스트입니다" });
  });

  it("Host는 정적 화면에도 건다, 포트가 달라도 거절", async () => {
    expect((await req(app, "/dashboard", { headers: { Host: "evil.example" } })).status).toBe(403);
    expect((await req(app, "/api/nope", { headers: { ...auth, Host: "127.0.0.1:1" } })).status).toBe(403);
  });

  it("남의 출처는 403 — Host에서 같은 출처를 끌어내지 않는다", async () => {
    expect((await req(app, "/api/nope", { headers: { ...auth, Origin: "http://evil.example" } })).status).toBe(403);
    expect((await req(app, "/api/nope", { headers: { ...auth, Origin: "http://localhost:3000" } })).status).toBe(403);   // 개발 출처는 운영에서 닫힌다
    expect((await req(app, "/api/nope", { headers: { ...auth, Origin: "null" } })).status).toBe(403);
  });

  it("app://starlog 사전 요청은 토큰 없이 열리고 토큰 머리글을 허용한다", async () => {
    const r = await req(app, "/api/me", {
      method: "OPTIONS",
      headers: { Origin: "app://starlog", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,x-starlog-token" },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("app://starlog");
    expect(r.headers.get("Access-Control-Allow-Headers")).toContain("x-starlog-token");
  });

  it("토큰 없음·틀림 → 401 앱 모양", async () => {
    const none = await req(app, "/api/nope");
    expect(none.status).toBe(401);
    expect(await none.json()).toEqual({ code: "UNAUTHORIZED", message: "인증 토큰이 없거나 올바르지 않습니다" });
    expect((await req(app, "/api/nope", { headers: { "X-Starlog-Token": "b".repeat(64) } })).status).toBe(401);
    expect((await req(app, "/api/nope", { headers: { "X-Starlog-Token": "short" } })).status).toBe(401);
  });

  it("t= 쿼리는 GET·HEAD만", async () => {
    expect((await req(app, `/api/backlog/1/cover/file/nope?t=${TOKEN}`)).status).toBe(404);
    expect((await req(app, `/api/nope?t=${TOKEN}`, { method: "HEAD" })).status).toBe(404);
    expect((await req(app, `/api/nope?t=${TOKEN}`, { method: "POST" })).status).toBe(401);
    expect((await req(app, `/api/nope?t=${TOKEN}`, { method: "DELETE" })).status).toBe(401);
  });

  it("cross-site라도 토큰이 맞으면 통과 — 창(app://)→127.0.0.1은 늘 cross-site다", async () => {
    expect((await req(app, `/api/nope?t=${TOKEN}`, { headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(404);
  });

  it("text/plain·폼 POST/PUT → 415", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const r = await req(app, "/api/nope", { method: "PUT", body: "{}", headers: { ...auth, "Content-Type": type } });
      expect(r.status).toBe(415);
      expect(((await r.json()) as { code: string }).code).toBe("UNSUPPORTED_MEDIA_TYPE");
    }
    expect((await req(app, "/api/nope", { method: "POST", body: "{}", headers: { ...auth, "Content-Type": "text/plain;charset=UTF-8" } })).status).toBe(415);
    expect((await req(app, "/api/nope", { method: "POST", body: "{}", headers: { ...auth, "Content-Type": "application/json; charset=utf-8" } })).status).toBe(404);
    expect((await req(app, "/api/nope", { method: "POST", headers: auth })).status).toBe(404);   // 본문 없는 POST
  });

  it("보안 머리글은 모든 응답에", async () => {
    for (const r of [await req(app, "/api/nope", { headers: auth }), await req(app, "/api/nope"), await req(app, "/x", { headers: { Host: "evil" } })]) {
      expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });
});

describe("dev 프로필 (토큰 없음)", () => {
  let app: Hono;
  beforeEach(() => { app = setup({ STARLOG_PROFILE: "dev" }); });

  it("토큰 없이 돈다, 개발 화면 출처는 열린다", async () => {
    expect((await req(app, "/api/nope")).status).toBe(404);
    const r = await req(app, "/api/nope", { headers: { Origin: "http://localhost:3000" } });
    expect(r.status).toBe(404);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("CORS를 끄지 않는다 — 남의 출처 403, Host 확인도 그대로", async () => {
    expect((await req(app, "/api/nope", { headers: { Origin: "http://evil.example" } })).status).toBe(403);
    expect((await req(app, "/api/nope", { headers: { Host: "evil.example:5555" } })).status).toBe(403);
  });

  it("Sec-Fetch-Site: cross-site → 403 (img·form으로 부르는 남의 페이지)", async () => {
    const r = await req(app, "/api/nope", { headers: { "Sec-Fetch-Site": "cross-site" } });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { code: string }).code).toBe("CROSS_SITE");
    expect((await req(app, "/api/nope", { headers: { "Sec-Fetch-Site": "same-origin" } })).status).toBe(404);
  });

  it("text/plain PUT → 415 (dev에서도)", async () => {
    expect((await req(app, "/api/me/profile", { method: "PUT", body: "{}", headers: { "Content-Type": "text/plain" } })).status).toBe(415);
  });
});

describe("업로드·크기 자리", () => {
  // DB 없이 문지기만 — 라우트 대신 200을 돌려주는 끝단
  const mini = () => {
    setConfig(loadConfig({ STARLOG_DB_DIR: "memory://guard", STARLOG_PROFILE: "test" }));
    const a = new Hono();
    a.onError((e, c) => c.json({ code: (e as { code?: string }).code }, (e as { status?: 413 }).status ?? 500));
    a.use("*", crossSiteGuard, contentTypeGuard, sizeGuard);
    a.all("*", async (c) => { await c.req.arrayBuffer(); return c.text("ok"); });
    return a;
  };

  it("멀티파트는 업로드 자리의 POST만", async () => {
    const a = mini();
    const mp = () => { const f = new FormData(); f.append("file", new Blob(["x"]), "a.png"); return f; };
    expect((await a.request("/api/backlog/3/cover/file", { method: "POST", body: mp() })).status).toBe(200);
    expect((await a.request("/api/backlog/3/screenshots", { method: "POST", body: mp() })).status).toBe(200);
    expect((await a.request("/api/backlog/3/cover", { method: "PUT", body: mp() })).status).toBe(415);
    expect((await a.request("/api/me/import", { method: "POST", body: mp() })).status).toBe(415);
  });

  it("JSON 자리는 5MB, 기록 통째는 256MB", async () => {
    const a = mini();
    const big = "x".repeat(6 * 1024 * 1024);
    const json = { "Content-Type": "application/json" };
    expect((await a.request("/api/me/profile", { method: "PUT", body: big, headers: json })).status).toBe(413);
    expect((await a.request("/api/me/import", { method: "POST", body: big, headers: json })).status).toBe(200);
  });
});

describe("설정 가리기", () => {
  it("끝 4자리만, 짧으면 통째로, 빈 값·null은 그대로", () => {
    expect(maskSecret("abcdefghijkl1234")).toBe("••••1234");
    expect(maskSecret("short")).toBe("••••");
    expect(maskSecret("12345678")).toBe("••••");
    expect(maskSecret("")).toBe("");
    expect(maskSecret(null)).toBe(null);
  });
});
