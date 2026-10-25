import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { loadConfig, setConfig } from "../../src/config";
import { buildCsp, cspForHtml, inlineScriptHashes, originOf } from "../../src/http/csp";

const sha = (s: string) => `'sha256-${crypto.createHash("sha256").update(s, "utf8").digest("base64")}'`;
const directive = (p: string, name: string) => p.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

describe("CSP", () => {
  it("인라인 스크립트만 해시한다 — src 있는 것·빈 것은 빼고, 같은 내용은 한 번", () => {
    const html = `<script src="/a.js" async=""></script><script>(self.__next_f=self.__next_f||[]).push([0])</script>`
      + `<script id="x">a()</script><script></script><script>a()</script>`;
    expect(inlineScriptHashes(html)).toEqual([sha("(self.__next_f=self.__next_f||[]).push([0])"), sha("a()")]);
  });

  it("스토리지 공개 주소는 img-src, 엔드포인트는 connect-src에 출처만 (EXTERNAL 커버 — 가짜 주소)", () => {
    setConfig(loadConfig({
      STARLOG_DB_DIR: "memory://csp",
      APP_STORAGE_ENDPOINT: "https://acct.fake-r2.example/",
      APP_STORAGE_PUBLIC_BASE_URL: "https://covers.fake.example/starlog/",
    }));
    const p = cspForHtml("<script>x()</script>");
    expect(directive(p, "img-src")).toContain("https://covers.fake.example");
    expect(directive(p, "img-src")).not.toContain("/starlog");
    expect(directive(p, "connect-src")).toContain("https://acct.fake-r2.example");
    expect(directive(p, "connect-src")).not.toContain("covers.fake.example");
    expect(directive(p, "script-src")).toBe(`script-src 'self' ${sha("x()")}`);
    expect(p).not.toMatch(/unsafe-(inline|eval)/);
    for (const d of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"]) expect(p).toContain(d);
  });

  it("스토리지가 없으면 바깥 출처는 IGDB 이미지뿐", () => {
    setConfig(loadConfig({ STARLOG_DB_DIR: "memory://csp" }));
    const p = cspForHtml("");
    expect(directive(p, "connect-src")).toBe("connect-src 'self' http://127.0.0.1:*");
    expect(directive(p, "img-src")).toBe("img-src 'self' data: blob: https://images.igdb.com http://127.0.0.1:*");
  });

  it("이상한 주소는 정책에 못 끼어든다", () => {
    expect(originOf("https://a.example/x; script-src *")).toBe("https://a.example");
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("not a url")).toBeNull();
    expect(originOf("")).toBeNull();
  });
});

/**
 * 같은 정책이 두 벌이다 — `app://` 문서는 일렉트론(`desktop/csp.js`)이, http 사본은 서버가 붙인다.
 * 한쪽만 고치면 한쪽 창에서만 커버·영상이 막힌다. 같은 입력이면 같은 글자여야 한다 (데스크탑 파일은 읽기만)
 */
describe("CSP 두 벌 대조", async () => {
  const { createRequire } = await import("module");
  const desktop = createRequire(import.meta.url)("../../../desktop/csp.js") as {
    buildCsp: typeof buildCsp; inlineScriptHashes: typeof inlineScriptHashes; originOf: typeof originOf;
  };
  const inputs = [
    { scriptHashes: [], imgOrigins: [], connectOrigins: [] },
    { scriptHashes: [sha("a()"), sha("b()")], imgOrigins: ["https://covers.fake.example"], connectOrigins: ["https://acct.fake-r2.example"] },
    { scriptHashes: [sha("a()"), sha("a()")], imgOrigins: ["https://x.example", "https://x.example"], connectOrigins: [] },
  ];
  it("buildCsp가 같은 글자를 낸다", () => {
    for (const i of inputs) expect(desktop.buildCsp(i)).toBe(buildCsp(i));
  });
  it("인라인 해시·출처 거르기도 같다", () => {
    const html = `<script src="/a.js"></script><script>x()</script><script id="y">y()</script><script></script>`;
    expect(desktop.inlineScriptHashes(html)).toEqual(inlineScriptHashes(html));
    for (const raw of ["https://a.example/b/c", " http://127.0.0.1:9000/x ", "ftp://a.example", "not a url", "https://a.example; script-src *", ""]) {
      expect(desktop.originOf(raw)).toBe(originOf(raw));
    }
  });
});
