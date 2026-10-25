/**
 * P6 S1에서 고친 버그 — 녹화본(골든)으로는 못 닿는 자리(외부 호출·순수 함수).
 * 번호는 `docs/v2-plan.md`의 "자바에서 발견한 버그" 표
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const creds = { clientId: "id-a", clientSecret: "secret-a" };
vi.mock("../../src/domains/system/service", async (orig) => ({
  ...(await orig<typeof import("../../src/domains/system/service")>()),
  igdbCredentials: async () => ({ ...creds }),
  recordApiCall: async () => {},
}));

import { belongsTo } from "../../src/domains/backlog/refs";
import { canonicalExternalId, resyncedName } from "../../src/domains/game/service";
import { token } from "../../src/domains/game/igdb";
import { toKorean } from "../../src/domains/system/service";
import { __test } from "../../src/common/storage";
import { ExternalApi } from "../../src/common/errors";
import type { PlatformAccountRow } from "../../src/domains/platform/service";
import { sendFile } from "../../src/http/files";
import { Hono } from "hono";
import fs from "fs";
import os from "os";
import path from "path";

afterEach(() => vi.unstubAllGlobals());

const account = (platformId: number | null, emulatorId: number | null) => ({ platformId, emulatorId }) as PlatformAccountRow;

describe("14 — 계정 소속은 종류까지 본다", () => {
  it("플랫폼 3의 계정은 에뮬레이터 3의 것이 아니다", () => {
    expect(belongsTo(account(3, null), null, 3)).toBe(false);
    expect(belongsTo(account(null, 3), 3, null)).toBe(false);
  });
  it("같은 종류·같은 id면 맞다", () => {
    expect(belongsTo(account(3, null), 3, null)).toBe(true);
    expect(belongsTo(account(null, 3), null, 3)).toBe(true);
  });
});

describe("11 — 재동기화 이름은 정규화한 뒤 비교", () => {
  it("끝 공백만 다르면 안 바뀐 것", () => {
    expect(resyncedName("Hollow Knight ", "Hollow Knight")).toEqual({ nameChanged: false, name: "Hollow Knight" });
  });
  it("진짜로 바뀌면 정규화한 이름", () => {
    expect(resyncedName(" Hollow Knight: Silksong ", "Hollow Knight")).toEqual({ nameChanged: true, name: "Hollow Knight: Silksong" });
  });
  it("이름이 없거나 공백뿐이면 지금 이름을 지킨다", () => {
    expect(resyncedName(null, "A")).toEqual({ nameChanged: false, name: "A" });
    expect(resyncedName("   ", "A")).toEqual({ nameChanged: false, name: "A" });
  });
});

describe("12 — externalId는 IGDB가 쓰는 모양으로 찾는다", () => {
  it("앞의 0·+ 제거", () => {
    expect(canonicalExternalId("040477")).toBe("40477");
    expect(canonicalExternalId("+40477")).toBe("40477");
    expect(canonicalExternalId("40477")).toBe("40477");
  });
  it("정수가 아니면 그대로", () => {
    expect(canonicalExternalId("abc")).toBe("abc");
  });
});

describe("13 — IGDB 토큰은 자격증명별", () => {
  it("키를 바꾸면 옛 토큰을 버리고 새로 받는다", async () => {
    const issuedFor: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      // 시크릿은 쿼리가 아니라 폼 본문으로 나간다 (URL이 에러·로그에 남아도 안 샌다)
      expect(url).toBe("https://id.twitch.tv/oauth2/token");
      const form = new URLSearchParams(init.body as string);
      expect(form.get("client_secret")).toBe(creds.clientSecret);
      const id = form.get("client_id")!;
      issuedFor.push(id);
      return new Response(JSON.stringify({ access_token: `tok-${id}`, expires_in: 5_000_000 }), { status: 200 });
    });
    expect(await token()).toBe("tok-id-a");
    expect(await token()).toBe("tok-id-a");          // 같은 키 — 캐시
    creds.clientId = "id-b";
    expect(await token()).toBe("tok-id-b");          // 바뀐 키 — 새로 받음
    expect(issuedFor).toEqual(["id-a", "id-b"]);
  });
});

describe("8 — 번역 실패는 전부 502", () => {
  const expect502 = async () => {
    const e = await toKorean("k", ["hello"]).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ExternalApi);
    expect((e as ExternalApi).status).toBe(502);
  };
  it("5xx", async () => {
    vi.stubGlobal("fetch", async () => new Response("oops", { status: 503 }));
    await expect502();
  });
  it("연결 실패", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    await expect502();
  });
  it("응답 해석 실패", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 200 }));
    await expect502();
  });
  it("4xx는 그대로 502 (상태별 문구는 로그에)", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));
    await expect502();
  });
});

describe("9 — 스토리지 연결 실패도 502", () => {
  const s3 = () => new __test.S3Storage({ endpoint: "http://127.0.0.1:9", bucket: "b", accessKey: "a", secretKey: "s", publicBaseUrl: null });
  it("head", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    await expect(s3().head("covers/entry-1/0f8e9a1c-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png")).rejects.toBeInstanceOf(ExternalApi);
  });
  it("readHead", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    await expect(s3().readHead("covers/entry-1/0f8e9a1c-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png", 12)).rejects.toBeInstanceOf(ExternalApi);
  });
  it("HEAD 404는 여전히 '없음'", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    expect(await s3().head("covers/entry-1/0f8e9a1c-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png")).toBeNull();
  });
});

describe("17 — 잘못된 Range는 416, 본문 없음", () => {
  it("전체 크기만 알린다", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "starlog-range-")), "clip.mp4");
    fs.writeFileSync(file, Buffer.alloc(212, 1));
    const app = new Hono().get("/f", (c) => sendFile(c, file, "video/mp4"));
    const res = await app.request("/f", { headers: { Range: "bytes=5000-" } });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */212");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
    const ok = await app.request("/f", { headers: { Range: "bytes=0-9" } });
    expect(ok.status).toBe(206);
    expect((await ok.arrayBuffer()).byteLength).toBe(10);
  });
});
