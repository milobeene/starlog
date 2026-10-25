import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { loadConfig, setConfig } from "../../src/config";
import { cspForHtml, inlineScriptHashes, originOf } from "../../src/http/csp";

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
