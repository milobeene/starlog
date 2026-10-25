/**
 * homeops_release (V19) — homeops 계정이 끝난 일정을 STARLOG 일반 기록(ADD)으로 넘긴다.
 * 소유자 권한으로 도는 함수라 실제 DB에서 계정을 갈아타 본다
 */
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { openDb } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";
import { backlogEntry, game, homeopsPlayLog, playRecord } from "../../src/db/schema";
import { grantHomeops } from "../../src/startup";
import { syncAllPlayTimes } from "../../src/domains/backlog/playtime";

async function release(d: Parameters<typeof grantHomeops>[0], keys: string[]): Promise<number> {
  // drizzle은 배열 값을 ($1, $2…)로 펼친다 — homeops는 배열 파라미터 하나로 부르지만 여기선 array[...]로 같은 값을 만든다
  const arr = sql`array[${sql.join(keys.map((k) => sql`${k}`), sql`, `)}]::text[]`;
  const r = (await d.execute(sql`select homeops_release(${arr}) as n`)) as unknown as { rows: { n: number }[] };
  return r.rows[0]!.n;
}

describe("homeops_release", () => {
  it("끝난 일정만 ADD로 옮기고, 미래·없는 키는 그대로, 두 번째 호출은 0, 합계는 안 변한다", async () => {
    const o = await openDb({ kind: "pglite", dir: "memory://release" });
    await migrate(o);
    const d = o.db;
    const now = "2026-10-25 12:00:00";
    const [g] = await d.insert(game).values({ source: "MANUAL", name: "ZZ", createdAt: now, updatedAt: now }).returning();
    const [e] = await d.insert(backlogEntry).values({ gameId: g!.id, status: "PLAYING", displayName: "ZZ", createdAt: now, updatedAt: now }).returning();
    await d.insert(homeopsPlayLog).values([
      { backlogEntryId: e!.id, externalId: "homeops:test:done", startedAt: "2026-10-20 23:30:00", endedAt: "2026-10-21 01:00:00", minutes: 90, label: "23:30-01:00 ZZ" },
      { backlogEntryId: e!.id, externalId: "homeops:test:zero", startedAt: "2026-10-21 10:00:00", endedAt: "2026-10-21 10:00:00", minutes: 0 },
      { backlogEntryId: e!.id, externalId: "homeops:test:future", startedAt: "2999-01-01 10:00:00", endedAt: "2999-01-01 11:00:00", minutes: 60 },
    ]);
    await syncAllPlayTimes(d);
    const before = (await d.select().from(backlogEntry).where(eq(backlogEntry.id, e!.id)))[0]!.playTimeHours;
    expect(before).toBe("1.50");

    // homeops 계정으로 — 이 함수 말고는 play_record에 손을 못 댄다
    await d.execute(sql`create role homeops_writer`);
    await grantHomeops(d);
    await d.execute(sql`set role homeops_writer`);
    try {
      expect(await release(d, ["homeops:test:done", "homeops:test:zero", "homeops:test:future", "homeops:test:none"])).toBe(1);
      expect(await release(d, ["homeops:test:done"])).toBe(0);
      expect(await release(d, [])).toBe(0);
    } finally {
      await d.execute(sql`reset role`);
    }

    const logs = await d.select().from(homeopsPlayLog);
    expect(logs.map((l) => l.externalId)).toEqual(["homeops:test:future"]);
    const recs = await d.select().from(playRecord).where(eq(playRecord.backlogEntryId, e!.id));
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ kind: "ADD", minutes: "90.0", playedOn: "2026-10-20", note: "23:30-01:00 ZZ · 일정에서 넘김" });
    expect(recs[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

    await syncAllPlayTimes(d);
    expect((await d.select().from(backlogEntry).where(eq(backlogEntry.id, e!.id)))[0]!.playTimeHours).toBe(before);
    await o.close();
  }, 30_000);

  it("계정이 없는 DB(로컬 세이브)에서도 마이그레이션·기동이 된다", async () => {
    const o = await openDb({ kind: "pglite", dir: "memory://release-norole" });
    await migrate(o);
    expect(await grantHomeops(o.db)).toBe(false);
    await o.close();
  }, 30_000);
});
