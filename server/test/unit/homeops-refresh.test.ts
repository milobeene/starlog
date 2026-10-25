/**
 * homeops 일정이 앱이 도는 중에 끝나면 합계 캐시가 낡는다 (R1-M1) — 조회 앞에서 다시 맞춘다.
 * 앱 시계로 "끝났다"를 가르므로 실제 DB(메모리 PGlite)로 본다
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";
import { backlogEntry, game, homeopsPlayLog, playRecord } from "../../src/db/schema";
import { nowKst } from "../../src/common/clock";
import { refreshHomeopsTotals } from "../../src/domains/backlog/playtime";

describe("homeops 합계 캐시 다시 맞추기", () => {
  it("끝난 일정은 더하고, 안 끝난 일정은 안 더하고, 맞는 캐시는 안 건드린다", async () => {
    const o = await openDb({ kind: "pglite", dir: "memory://homeops" });
    await migrate(o);
    const d = o.db;
    const now = nowKst();
    const [g] = await d.insert(game).values({ source: "MANUAL", name: "ZZ", createdAt: now, updatedAt: now }).returning();
    const entry = async (hours: string | null) => (await d.insert(backlogEntry).values({
      gameId: g!.id, status: "BACKLOG", displayName: "ZZ", playTimeHours: hours, createdAt: "2020-01-01 00:00:00", updatedAt: "2020-01-01 00:00:00",
    }).returning())[0]!;
    // 다른 게임 하나를 더 만들어 항목 둘 (게임당 항목 하나)
    const [g2] = await d.insert(game).values({ source: "MANUAL", name: "ZZ2", createdAt: now, updatedAt: now }).returning();
    const stale = await entry("1.00");     // 기록 60분 + 끝난 일정 30분인데 캐시는 1시간 (실행 중에 끝남)
    const [fresh] = await d.insert(backlogEntry).values({
      gameId: g2!.id, status: "BACKLOG", displayName: "ZZ2", playTimeHours: "1.00", createdAt: "2020-01-01 00:00:00", updatedAt: "2020-01-01 00:00:00",
    }).returning();
    for (const id of [stale.id, fresh!.id]) {
      await d.insert(playRecord).values({ backlogEntryId: id, kind: "BASELINE", minutes: "60.0", playedOn: "2020-01-01", createdAt: now, updatedAt: now });
    }
    await d.insert(homeopsPlayLog).values([
      { backlogEntryId: stale.id, externalId: "a", startedAt: "2020-01-02 10:00:00", endedAt: "2020-01-02 10:30:00", minutes: 30 },
      { backlogEntryId: fresh!.id, externalId: "b", startedAt: "2999-01-01 10:00:00", endedAt: "2999-01-01 11:00:00", minutes: 60 },
    ]);

    expect(await refreshHomeopsTotals(d)).toBe(1);
    const [a] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, stale.id));
    const [b] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, fresh!.id));
    expect(a!.playTimeHours).toBe("1.50");
    expect(a!.updatedAt).not.toBe("2020-01-01 00:00:00");
    expect(b!.playTimeHours).toBe("1.00");
    expect(b!.updatedAt).toBe("2020-01-01 00:00:00");
    expect(await refreshHomeopsTotals(d)).toBe(0);
    await o.close();
  }, 30_000);
});
