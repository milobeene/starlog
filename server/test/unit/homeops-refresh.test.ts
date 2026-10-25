/**
 * homeops 일정이 앱이 도는 중에 끝나거나 바뀌면 합계 캐시가 낡는다 (R1-M1) — 조회 앞에서 도장을 보고 다시 맞춘다.
 * 앱 시계로 "끝났다"를 가르므로 실제 DB(메모리 PGlite)로 본다
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { openDb } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";
import { backlogEntry, game, homeopsPlayLog, playRecord } from "../../src/db/schema";
import { nowKst } from "../../src/common/clock";
import { forgetPlayTimeStamp, playTimeStamp, refreshPlayTimes, syncAllPlayTimes } from "../../src/domains/backlog/playtime";

const OLD = "2020-01-01 00:00:00";

async function setup(name: string) {
  const o = await openDb({ kind: "pglite", dir: `memory://${name}` });
  await migrate(o);
  const d = o.db;
  const now = nowKst();
  const entry = async (n: string, hours: string | null = null) => {
    const [g] = await d.insert(game).values({ source: "MANUAL", name: n, createdAt: now, updatedAt: now }).returning();
    return (await d.insert(backlogEntry).values({
      gameId: g!.id, status: "BACKLOG", displayName: n, playTimeHours: hours, createdAt: OLD, updatedAt: OLD,
    }).returning())[0]!;
  };
  const hours = async (id: number) => (await d.select().from(backlogEntry).where(eq(backlogEntry.id, id)))[0]!;
  return { o, d, now, entry, hours };
}

describe("homeops 합계 캐시 다시 맞추기 (도장)", () => {
  beforeEach(() => forgetPlayTimeStamp());

  it("첫 조회는 늘 센다 — 끝난 일정은 더하고, 안 끝난 일정은 안 더하고, 맞는 캐시는 안 건드린다", async () => {
    const { o, d, now, entry, hours } = await setup("refresh-first");
    const stale = await entry("ZZ", "1.00");   // 기록 60분 + 끝난 일정 30분인데 캐시는 1시간 (실행 중에 끝남)
    const fresh = await entry("ZZ2", "1.00");
    for (const id of [stale.id, fresh.id]) {
      await d.insert(playRecord).values({ backlogEntryId: id, kind: "BASELINE", minutes: "60.0", playedOn: "2020-01-01", createdAt: now, updatedAt: now });
    }
    await d.insert(homeopsPlayLog).values([
      { backlogEntryId: stale.id, externalId: "a", startedAt: "2020-01-02 10:00:00", endedAt: "2020-01-02 10:30:00", minutes: 30 },
      { backlogEntryId: fresh.id, externalId: "b", startedAt: "2999-01-01 10:00:00", endedAt: "2999-01-01 11:00:00", minutes: 60 },
    ]);

    expect(await refreshPlayTimes(d)).toBe(1);
    expect((await hours(stale.id)).playTimeHours).toBe("1.50");
    expect((await hours(stale.id)).updatedAt).not.toBe(OLD);
    expect((await hours(fresh.id)).playTimeHours).toBe("1.00");
    expect((await hours(fresh.id)).updatedAt).toBe(OLD);
    // 도장이 그대로면 세지 않는다
    expect(await refreshPlayTimes(d)).toBeNull();
    await o.close();
  }, 30_000);

  it("기동 직후 마지막 일정이 지워져도 잡는다 — 기억이 비어 있어도 첫 조회가 전체를 센다", async () => {
    const { o, d, entry, hours } = await setup("refresh-last");
    const e = await entry("ZZ");
    await d.insert(homeopsPlayLog).values({ backlogEntryId: e.id, externalId: "only", startedAt: "2020-01-02 10:00:00", endedAt: "2020-01-02 10:30:00", minutes: 30 });
    await syncAllPlayTimes(d);                 // 기동 정리
    expect((await hours(e.id)).playTimeHours).toBe("0.50");

    await d.delete(homeopsPlayLog).where(eq(homeopsPlayLog.externalId, "only"));   // 기동과 첫 조회 사이
    expect(await refreshPlayTimes(d)).toBe(1);
    expect((await hours(e.id)).playTimeHours).toBeNull();
    expect(await refreshPlayTimes(d)).toBeNull();

    // 도는 중에 다시 하나 넣었다 지워도 — 두 번 다 도장이 바뀐다
    await d.insert(homeopsPlayLog).values({ backlogEntryId: e.id, externalId: "again", startedAt: "2020-01-03 10:00:00", endedAt: "2020-01-03 11:00:00", minutes: 60 });
    expect(await refreshPlayTimes(d)).toBe(1);
    expect((await hours(e.id)).playTimeHours).toBe("1.00");
    await d.delete(homeopsPlayLog).where(eq(homeopsPlayLog.externalId, "again"));
    expect(await refreshPlayTimes(d)).toBe(1);
    expect((await hours(e.id)).playTimeHours).toBeNull();
    await o.close();
  }, 30_000);

  it("도장 — 읽기만 하고, 분·끝남·끊김·updated_at이 바뀌면 달라지고, 항목별로도 뜬다", async () => {
    const { o, d, entry } = await setup("stamp");
    const a = await entry("ZZ"), b = await entry("ZZ2");
    const empty = await playTimeStamp(d);
    expect(await playTimeStamp(d)).toBe(empty);
    await d.insert(homeopsPlayLog).values({ backlogEntryId: a.id, externalId: "x", startedAt: "2020-01-02 10:00:00", endedAt: "2020-01-02 10:30:00", minutes: 30, createdAt: OLD, updatedAt: OLD });
    const one = await playTimeStamp(d);
    expect(one).not.toBe(empty);
    expect(await playTimeStamp(d, b.id)).toBe(empty);
    expect(await playTimeStamp(d, a.id)).toBe(one);

    await d.update(homeopsPlayLog).set({ updatedAt: "2020-01-02 00:00:00" }).where(eq(homeopsPlayLog.externalId, "x"));
    const touched = await playTimeStamp(d);
    expect(touched).not.toBe(one);
    await d.update(homeopsPlayLog).set({ detachedAt: "2020-01-03 00:00:00" }).where(eq(homeopsPlayLog.externalId, "x"));
    expect(await playTimeStamp(d)).not.toBe(touched);

    // 아무도 안 써도 일정이 끝나는 순간 바뀐다 (끝난 행 수)
    const soon = (await d.execute(sql`select (${nowKst()}::timestamp + interval '1500 milliseconds')::text as t`)) as unknown as { rows: { t: string }[] };
    await d.insert(homeopsPlayLog).values({ backlogEntryId: b.id, externalId: "soon", startedAt: OLD, endedAt: soon.rows[0]!.t, minutes: 10 });
    const before = await playTimeStamp(d);
    await new Promise((r) => setTimeout(r, 2000));
    expect(await playTimeStamp(d)).not.toBe(before);
    await o.close();
  }, 30_000);
});
