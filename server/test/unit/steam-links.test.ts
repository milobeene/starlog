/**
 * 스팀 연결 (V21) — appid 검증, MANUAL 우선, 음성 캐시 만료(앱 시계), 항목 삭제 시 null/다시 맞추기.
 * IGDB는 갈아 끼운 `lookup`으로 — 호출 횟수를 센다
 */
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { openDb } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";
import { backlogEntry, game, member, steamAppLink } from "../../src/db/schema";
import {
  checkAppids, isSteamRange, isValidAppid, manualAppidsByEntry, removeLink, resolveLinks, setManualLink, NONE_RECHECK_MS,
  type ResolveDeps,
} from "../../src/domains/steam/service";
import { igdbSteamGames } from "../../src/domains/game/igdb";

// PGlite 기동(마이그레이션 21개)이 부하에 따라 5초를 넘는다
vi.setConfig({ testTimeout: 30_000 });

const T0 = new Date("2026-10-31T03:00:00Z");

async function setup(name: string) {
  const o = await openDb({ kind: "pglite", dir: `memory://steam-${name}` });
  await migrate(o);
  const d = o.db;
  const t = "2026-10-01 09:00:00";
  const mk = async (ext: string, title: string) => {
    const [g] = await d.insert(game).values({ source: "IGDB", externalId: ext, name: title, createdAt: t, updatedAt: t }).returning();
    const [e] = await d.insert(backlogEntry).values({ gameId: g!.id, status: "WISHLIST", displayName: title, createdAt: t, updatedAt: t }).returning();
    return e!.id;
  };
  return { d, mk };
}

function deps(map: Record<string, string>, clock: { t: Date }, opts: { fail?: boolean; available?: boolean } = {}) {
  const calls: string[][] = [];
  const dep: ResolveDeps = {
    lookup: async (u) => { calls.push(u); if (opts.fail) throw new Error("igdb down"); return new Map(u.filter((x) => x in map).map((x) => [x, map[x]!])); },
    available: async () => opts.available ?? true,
    now: () => clock.t,
  };
  return { dep, calls };
}

describe("appid 검증", () => {
  it("숫자만, 앞 0 없음, 20자리까지", () => {
    expect(isValidAppid("570")).toBe(true);
    for (const bad of ["", "0", "012", "12a", "-1", " 5", "1".repeat(21), "5.0"]) expect(isValidAppid(bad)).toBe(false);
    expect(isSteamRange("4294967295")).toBe(true);
    expect(isSteamRange("4294967296")).toBe(false);
    expect(isSteamRange("12345678901234567890")).toBe(false);
  });
  it("200개 초과·잘못된 값은 400, 중복은 접는다", () => {
    expect(checkAppids(["1", "2", "1"])).toEqual(["1", "2"]);
    expect(() => checkAppids(["x"])).toThrow();
    expect(() => checkAppids(Array.from({ length: 201 }, (_, i) => String(i + 1)))).toThrow();
    expect(checkAppids(Array.from({ length: 200 }, (_, i) => String(i + 1)))).toHaveLength(200);
  });
});

describe("resolve", () => {
  it("IGDB 맞춤 → AUTO, 없으면 NONE, 비스팀 번호는 묻지 않는다, 한 번에 한 묶음", async () => {
    const { d, mk } = await setup("auto");
    const e = await mk("111", "Alpha");
    await mk("222", "Beta-not-matched");
    const clock = { t: T0 };
    const { dep, calls } = deps({ "10": "111", "20": "999" }, clock);
    const r = await resolveLinks(d, ["10", "20", "30", "5000000000"], dep);
    expect(calls).toEqual([["10", "20", "30"]]);
    expect(r).toEqual([
      { appid: "10", entryId: e, entryName: "Alpha", source: "AUTO" },
      { appid: "20", entryId: null, entryName: null, source: "NONE" },      // IGDB는 알지만 내 항목엔 없음
      { appid: "30", entryId: null, entryName: null, source: "NONE" },      // IGDB에 없음
      { appid: "5000000000", entryId: null, entryName: null, source: null },
    ]);
    // 두 번째 호출은 캐시만 — IGDB 안 부른다
    await resolveLinks(d, ["10", "20", "30"], dep);
    expect(calls).toHaveLength(1);
  });

  it("MANUAL이 이기고 AUTO가 못 덮는다 (IGDB가 다른 답을 줘도)", async () => {
    const { d, mk } = await setup("manual");
    const a = await mk("111", "Alpha");
    const b = await mk("222", "Beta");
    const clock = { t: T0 };
    const { dep, calls } = deps({ "10": "111" }, clock);
    await setManualLink(d, "10", b, T0);
    const r = await resolveLinks(d, ["10"], dep);
    expect(r[0]).toEqual({ appid: "10", entryId: b, entryName: "Beta", source: "MANUAL" });
    expect(calls).toHaveLength(0);
    // 늦게 온 자동 결과가 MANUAL을 밟지 않는다 — 경쟁 상황을 흉내: AUTO가 있다가 MANUAL로 바뀐 뒤 자동 결과가 도착
    await removeLink(d, "10");
    const slow: ResolveDeps = {
      ...dep,
      lookup: async (u) => { await setManualLink(d, "10", b, T0); return new Map(u.map((x) => [x, "111"])); },
    };
    const r2 = await resolveLinks(d, ["10"], slow);
    expect(r2[0]).toEqual({ appid: "10", entryId: b, entryName: "Beta", source: "MANUAL" });
    expect(a).not.toBe(b);
  });

  it("PUT은 없는/휴지통 항목이면 404, DELETE 뒤엔 다시 자동 맞춤", async () => {
    const { d, mk } = await setup("put");
    const a = await mk("111", "Alpha");
    const b = await mk("222", "Beta");
    await expect(setManualLink(d, "10", 99999)).rejects.toMatchObject({ status: 404 });
    await d.update(backlogEntry).set({ deletedAt: "2026-10-02 00:00:00" }).where(eq(backlogEntry.id, b));
    await expect(setManualLink(d, "10", b)).rejects.toMatchObject({ status: 404 });
    await setManualLink(d, "10", a, T0);
    await removeLink(d, "10");
    await removeLink(d, "10");   // 두 번째는 조용히
    const { dep } = deps({ "10": "111" }, { t: T0 });
    expect((await resolveLinks(d, ["10"], dep))[0]).toMatchObject({ entryId: a, source: "AUTO" });
  });

  it("음성 캐시는 7일 뒤(앱 시계)에 다시 묻는다", async () => {
    const { d } = await setup("neg");
    const clock = { t: T0 };
    const { dep, calls } = deps({}, clock);
    await resolveLinks(d, ["10"], dep);
    expect(calls).toHaveLength(1);
    clock.t = new Date(T0.getTime() + NONE_RECHECK_MS - 60_000);
    await resolveLinks(d, ["10"], dep);
    expect(calls).toHaveLength(1);                       // 7일 안: 캐시
    clock.t = new Date(T0.getTime() + NONE_RECHECK_MS + 60_000);
    await resolveLinks(d, ["10"], dep);
    expect(calls).toHaveLength(2);                       // 7일 뒤: 재조회
  });

  it("IGDB가 없거나 실패하면 캐시만 — 행도 안 쓴다", async () => {
    const { d, mk } = await setup("down");
    const e = await mk("111", "Alpha");
    const clock = { t: T0 };
    const off = deps({ "10": "111" }, clock, { available: false });
    expect((await resolveLinks(d, ["10"], off.dep))[0]!.source).toBeNull();
    expect(off.calls).toHaveLength(0);
    const bad = deps({ "10": "111" }, clock, { fail: true });
    expect((await resolveLinks(d, ["10"], bad.dep))[0]!.source).toBeNull();
    expect(await d.select().from(steamAppLink)).toHaveLength(0);
    const ok = deps({ "10": "111" }, clock);
    expect((await resolveLinks(d, ["10"], ok.dep))[0]!.entryId).toBe(e);
  });

  it("항목이 지워지면 — 하드 삭제는 FK가 null로, AUTO는 다시 맞추고, 휴지통도 같다", async () => {
    const { d, mk } = await setup("del");
    const e = await mk("111", "Alpha");
    const clock = { t: T0 };
    const { dep, calls } = deps({ "10": "111", "11": "111" }, clock);
    await resolveLinks(d, ["10", "11"], dep);
    // 휴지통 → 연결 없음(NONE 아님: 게임은 알고 있다)
    await d.update(backlogEntry).set({ deletedAt: "2026-10-02 00:00:00" }).where(eq(backlogEntry.id, e));
    expect((await resolveLinks(d, ["10"], dep))[0]).toMatchObject({ entryId: null, source: "NONE" });
    // 되살리면 IGDB 재호출 없이 로컬에서 붙는다
    await d.update(backlogEntry).set({ deletedAt: null }).where(eq(backlogEntry.id, e));
    expect((await resolveLinks(d, ["10"], dep))[0]).toMatchObject({ entryId: e, source: "AUTO" });
    expect(calls).toHaveLength(1);
    // 하드 삭제 → set null
    await d.delete(backlogEntry).where(eq(backlogEntry.id, e));
    const [row] = await d.select().from(steamAppLink).where(eq(steamAppLink.appid, "11"));
    expect(row!.backlogEntryId).toBeNull();
    // 같은 게임을 다시 담으면 AUTO가 새 항목으로 붙는다 (행의 igdb_game_id로 로컬에서)
    const [g] = await d.select().from(game);
    const [e2] = await d.insert(backlogEntry).values({ gameId: g!.id, status: "WISHLIST", displayName: "Alpha", createdAt: "2026-10-03 00:00:00", updatedAt: "2026-10-03 00:00:00" }).returning();
    expect((await resolveLinks(d, ["11"], dep))[0]).toMatchObject({ entryId: e2!.id, source: "AUTO" });
    expect(calls).toHaveLength(1);
  });

  it("MANUAL은 항목이 지워지면 연결 없음으로 답하되 행은 남고, 백업 대상은 살아 있는 항목의 MANUAL뿐", async () => {
    const { d, mk } = await setup("dump");
    const a = await mk("111", "Alpha");
    const b = await mk("222", "Beta");
    await setManualLink(d, "30", a, T0);
    await setManualLink(d, "20", a, T0);
    await setManualLink(d, "40", b, T0);
    const { dep } = deps({ "10": "111" }, { t: T0 });
    await resolveLinks(d, ["10"], dep);   // AUTO 행 하나 — 백업에 안 실려야 한다
    const m = await manualAppidsByEntry(d);
    expect(m.get(a)).toEqual(["20", "30"]);
    expect(m.get(b)).toEqual(["40"]);
    expect([...m.keys()]).toHaveLength(2);
    await d.update(backlogEntry).set({ deletedAt: "2026-10-02 00:00:00" }).where(eq(backlogEntry.id, b));
    expect((await resolveLinks(d, ["40"], dep))[0]).toEqual({ appid: "40", entryId: null, entryName: null, source: null });
  });
});

describe("IGDB 질의", () => {
  it("숫자 아닌 uid는 질의에 끼우지 않는다 (네트워크 없이 빈 결과)", async () => {
    expect(await igdbSteamGames(["abc", "1; drop"])).toEqual(new Map());
  });
});

describe("백업 형식 7", () => {
  it("MANUAL만 실리고, 덮어쓰기 가져오기가 새 항목에 다시 붙인다(6 이하 파일은 무시)", async () => {
    const { exportData } = await import("../../src/domains/member/export");
    const { replace } = await import("../../src/domains/member/import");
    const { MemberDump } = await import("../../src/domains/member/dump");
    const { d, mk } = await setup("dump7");
    await d.insert(member).values({ nickname: "T", createdAt: "2026-10-01 00:00:00", updatedAt: "2026-10-01 00:00:00" });
    const a = await mk("111", "Alpha");
    await mk("222", "Beta");
    await setManualLink(d, "30", a, T0);
    await setManualLink(d, "20", a, T0);
    await d.insert(steamAppLink).values({ appid: "99", backlogEntryId: a, igdbGameId: 1, source: "AUTO", createdAt: "2026-10-01 00:00:00", updatedAt: "2026-10-01 00:00:00" });
    const dump = JSON.parse(JSON.stringify(await exportData(d)));
    expect(dump.formatVersion).toBe(7);
    expect(dump.entries.find((e: { steamAppIds: string[] }) => e.steamAppIds.length)?.steamAppIds).toEqual(["20", "30"]);

    await d.transaction((tx) => replace(tx, MemberDump.parse(dump)));
    const rows = await d.select().from(steamAppLink).orderBy(steamAppLink.appid);
    expect(rows.map((r) => [r.appid, r.source])).toEqual([["20", "MANUAL"], ["30", "MANUAL"]]);   // AUTO 99는 캐시라 사라졌다
    expect(rows.every((r) => r.backlogEntryId !== null)).toBe(true);

    // 형식 6 파일은 steamAppIds가 있어도 안 읽는다
    dump.formatVersion = 6;
    await d.transaction((tx) => replace(tx, MemberDump.parse(dump)));
    expect(await d.select().from(steamAppLink)).toHaveLength(0);
  });
});
