/**
 * homeops에서 **연결이 끊긴** 일정(`detached_at`이 찬 행, V20) 정리 — 일반 기록으로 넘기기·지우기.
 *
 * ⚠️ `homeops_play_log`는 STARLOG가 쓰지 않는 표인데, **여기만 예외다.** homeops가 연결을 끊은 뒤로는
 * 그 행을 다시 안 건드리기로 했으므로(인수인계 V20) 남은 행의 주인이 STARLOG로 넘어온다.
 * 그래서 끊긴 행만 건드린다 — 다른 번호는 조용히 무시한다. 지운 행은 묘비(`homeops_released`)에 남겨
 * homeops가 같은 일정을 다시 올리면 DB가 막는다(두 번 세기 방지).
 */
import { inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "../../db/client";
import { backlogEntry } from "../../db/schema";
import { rows } from "../../db/raw";
import { nowKst } from "../../common/clock";
import { ldt } from "../../common/json";
import { syncPlayTime } from "./playtime";

export interface DetachedPlay {
  id: number; entryId: number; entryName: string; startedAt: string; endedAt: string;
  minutes: number; label: string | null; detachedAt: string; counted: boolean;
}

export interface DetachedList {
  items: DetachedPlay[];
  /** 아직 연결된 행 — [전부 끊기]가 건드릴 것. 끝남·예정으로 나눠 화면이 미리 보여 준다 */
  attachedCount: number; attachedEnded: number; attachedFuture: number;
}

/** 최신 일정이 위 — 끊기는 게임 단위로 한꺼번에 일어나서 끊은 시각은 대개 같다 */
export async function listDetached(d: Db): Promise<DetachedList> {
  const now = nowKst();
  const list = await rows<{
    id: number; entryId: number; entryName: string; startedAt: string; endedAt: string;
    minutes: number; label: string | null; detachedAt: string; counted: boolean;
  }>(d, sql`select h.id, h.backlog_entry_id as "entryId", b.display_name as "entryName",
         h.started_at as "startedAt", h.ended_at as "endedAt", h.minutes, h.label, h.detached_at as "detachedAt",
         h.ended_at <= ${now}::timestamp as counted
    from homeops_play_log h join backlog_entry b on b.id = h.backlog_entry_id
   where h.detached_at is not null
   order by h.started_at desc, h.id desc`);
  const att = (await rows<{ n: number; e: number }>(d, sql`select count(*)::int as n,
      (count(*) filter (where ended_at <= ${now}::timestamp))::int as e
    from homeops_play_log where detached_at is null`))[0]!;
  return {
    items: list.map((r) => ({
      id: r.id, entryId: r.entryId, entryName: r.entryName, startedAt: ldt(r.startedAt)!, endedAt: ldt(r.endedAt)!,
      minutes: r.minutes, label: r.label, detachedAt: ldt(r.detachedAt)!, counted: r.counted,
    })),
    attachedCount: att.n, attachedEnded: att.e, attachedFuture: att.n - att.e,
  };
}

const idArray = (ids: readonly number[]) => sql`array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::bigint[]`;

/** 지운 행의 묘비를 남기고, 지운 행 목록을 돌려준다. `extra`는 지울 조건(넘기기는 "끝난 것만") */
async function deleteWithTombstone(d: Db, ids: readonly number[], now: string, extra: SQL, alsoAdd: boolean) {
  // 넘기기의 ADD 칸은 V19 `homeops_release`와 같게 — 시작 날짜, `<label> · 일정에서 넘김` 100자
  return rows<{ entryId: number; minutes: number }>(d, sql`with gone as (
      delete from homeops_play_log
       where id = any(${idArray(ids)}) and detached_at is not null ${extra}
      returning backlog_entry_id, external_id, started_at, minutes, label
    ), tomb as (
      insert into homeops_released (external_id, released_at)
      select external_id, ${now}::timestamp from gone
      on conflict do nothing
    ), added as (
      insert into play_record (backlog_entry_id, kind, minutes, played_on, note, created_at, updated_at)
      select backlog_entry_id, 'ADD', minutes, started_at::date,
             left(coalesce(label || ' · ', '') || '일정에서 넘김', 100), ${now}::timestamp, ${now}::timestamp
        from gone
       where ${alsoAdd ? sql`true` : sql`false`} and minutes > 0
    )
    select backlog_entry_id as "entryId", minutes from gone`);
}

/** 지운 일정의 항목들 합계를 다시 — 일정 몫이 빠지고(넘기기면 ADD로 같은 몫이 들어온다) 삭제된 항목도 캐시는 있다 */
async function resync(d: Db, entryIds: readonly number[]) {
  const ids = [...new Set(entryIds)];
  if (ids.length === 0) return;
  const entries = await d.select().from(backlogEntry).where(inArray(backlogEntry.id, ids)).orderBy(backlogEntry.id).for("update");
  for (const e of entries) await syncPlayTime(d, e);
}

/** 끝난 것만 — 앞으로 잡힌 일정은 아직 시간이 아니라 넘길 게 없다(어느 쪽 수에도 안 든다) */
export async function releaseDetached(d: Db, ids: readonly number[]): Promise<{ released: number; removed: number }> {
  if (ids.length === 0) return { released: 0, removed: 0 };
  const now = nowKst();
  const gone = await deleteWithTombstone(d, ids, now, sql`and ended_at <= ${now}::timestamp`, true);
  await resync(d, gone.map((g) => g.entryId));
  const released = gone.filter((g) => g.minutes > 0).length;
  return { released, removed: gone.length - released };
}

export async function deleteDetached(d: Db, ids: readonly number[]): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const gone = await deleteWithTombstone(d, ids, nowKst(), sql``, false);
  await resync(d, gone.map((g) => g.entryId));
  return { deleted: gone.length };
}

/**
 * [전부 끊기] — homeops를 더는 안 쓸 때. 끊는 건 원래 homeops가 하는 일인데, 그쪽이 없어졌으면 남은 행을
 * 정리할 길이 없다 → STARLOG가 대신 끊는다. **이 표에 STARLOG가 쓰는 두 번째 예외**다(첫째는 위 넘기기·지우기).
 * 합계는 안 변한다(끊김은 세는 방식에 안 든다). `updated_at`도 바꾼다 — 도장이 바뀌어 화면이 다시 읽게
 */
export async function detachAll(d: Db): Promise<{ detached: number }> {
  const now = nowKst();
  const r = await rows<{ id: number }>(d, sql`update homeops_play_log
      set detached_at = ${now}::timestamp, updated_at = ${now}::timestamp
    where detached_at is null returning id`);
  return { detached: r.length };
}
