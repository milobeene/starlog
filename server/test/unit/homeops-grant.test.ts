/**
 * homeops 계정 권한 (V18 + 기동) — 계정이 있으면 뷰 읽기·일정 표 쓰기만 열리고, 나머지 표는 계속 막힌다.
 * 권한은 실제 DB에서만 확인된다 (메모리 PGlite에서 계정으로 갈아타 본다)
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { openDb } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";
import { backlogEntry, game } from "../../src/db/schema";
import { grantHomeops } from "../../src/startup";

/** drizzle이 원래 오류를 cause로 감싼다 — SQLSTATE로 본다 */
async function denied(q: Promise<unknown>) {
  const e = await q.then(() => null, (err: { cause?: { code?: string } }) => err);
  expect(e?.cause?.code).toBe("42501");
}

describe("homeops 계정 권한", () => {
  it("계정이 없으면 아무것도 안 하고, 있으면 뷰·일정 표만 연다", async () => {
    const o = await openDb({ kind: "pglite", dir: "memory://grant" });
    await migrate(o);
    const d = o.db;
    expect(await grantHomeops(d)).toBe(false);

    const now = "2026-10-25 12:00:00";
    const [g] = await d.insert(game).values({ source: "IGDB", externalId: "1", name: "ZZ", coverImageId: "abc", createdAt: now, updatedAt: now }).returning();
    const [e] = await d.insert(backlogEntry).values({ gameId: g!.id, status: "PLAYING", displayName: "ZZ 이름", createdAt: now, updatedAt: now }).returning();
    const [g2] = await d.insert(game).values({ source: "MANUAL", name: "ZZ2", createdAt: now, updatedAt: now }).returning();
    await d.insert(backlogEntry).values({ gameId: g2!.id, status: "BACKLOG", displayName: "지운 것", deletedAt: now, createdAt: now, updatedAt: now });

    await d.execute(sql`create role homeops_writer`);
    expect(await grantHomeops(d)).toBe(true);
    expect(await grantHomeops(d)).toBe(true); // 매 기동 다시 돌아도 같다

    await d.execute(sql`set role homeops_writer`);
    try {
      const view = (await d.execute(sql`select entry_id, name, status, cover_image_id from homeops_game_choice`)) as unknown as { rows: unknown[] };
      expect(view.rows).toEqual([{ entry_id: e!.id, name: "ZZ 이름", status: "PLAYING", cover_image_id: "abc" }]);
      await d.execute(sql`insert into homeops_play_log (backlog_entry_id, external_id, started_at, ended_at, minutes, label)
                          values (${e!.id}, 'homeops:test:1', '2026-10-25 20:00:00', '2026-10-25 21:00:00', 60, 'ZZ')`);
      await d.execute(sql`update homeops_play_log set minutes = 50 where external_id = 'homeops:test:1'`);
      await d.execute(sql`delete from homeops_play_log where external_id = 'homeops:test:1'`);
      await denied(d.execute(sql`select memo from backlog_entry`));
      await denied(d.execute(sql`insert into play_record (backlog_entry_id, kind, minutes, played_on) values (${e!.id}, 'ADD', 1, '2026-10-25')`));
    } finally {
      await d.execute(sql`reset role`);
    }
    await o.close();
  });
});
