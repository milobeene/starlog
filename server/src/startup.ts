/**
 * 기동 직후 할 일.
 * **실패가 기동을 막으면 안 된다.** 정리 없이도 서비스는 멀쩡히 돈다.
 */
import { lt, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { one } from "./db/raw";
import { db } from "./db/client";
import { apiCallLog } from "./db/schema";
import { nowKst } from "./common/clock";
import { syncAllPlayTimes } from "./domains/backlog/playtime";
import { RETENTION_DAYS } from "./domains/system/service";

/** homeops 연계 계정. 콘솔에서 만든다 — 이름만 약속이다 */
export const HOMEOPS_ROLE = "homeops_writer";

/**
 * homeops 계정이 있으면 권한을 맞춘다. 여러 번 줘도 같아서 매 기동 돈다 —
 * 계정을 나중에 만들어도 STARLOG를 한 번 열면 붙는다. 없으면(로컬 세이브·연계 전) 아무것도 안 한다.
 * 쓰기는 `homeops_play_log` 하나, 읽기는 뷰 하나, 일반 기록으로 넘기기 함수 하나 — 나머지 표는 계속 못 본다
 */
export async function grantHomeops(d: Db): Promise<boolean> {
  const { schema, has_role } = (await one<{ schema: string; has_role: boolean }>(d,
    sql`select current_schema() as schema, exists (select 1 from pg_roles where rolname = ${HOMEOPS_ROLE}) as has_role`))!;
  if (!has_role) return false;
  const role_ = sql.identifier(HOMEOPS_ROLE);
  await d.execute(sql`grant usage on schema ${sql.identifier(schema)} to ${role_}`);
  await d.execute(sql`grant select on homeops_game_choice to ${role_}`);
  await d.execute(sql`grant select, insert, update, delete on homeops_play_log to ${role_}`);
  await d.execute(sql`grant execute on function homeops_release(text[]) to ${role_}`);
  return true;
}

export async function runStartupTasks() {
  try {
    const threshold = nowKst(new Date(Date.now() - RETENTION_DAYS * 86_400_000));
    const removed = await db().delete(apiCallLog).where(lt(apiCallLog.calledAt, threshold)).returning({ id: apiCallLog.id });
    if (removed.length > 0) console.log(`API 호출 기록 ${removed.length}건 정리 (보존 ${RETENTION_DAYS}일)`);
  } catch (e) {
    console.warn("API 호출 기록 정리 실패 — 서비스는 계속 뜬다", e);
  }

  // 합계 캐시 — 앱이 꺼진 동안 homeops가 일정을 썼거나, 잡혀 있던 일정이 끝났을 수 있다
  try {
    const changed = await db().transaction((tx) => syncAllPlayTimes(tx));
    if (changed > 0) console.log(`플레이타임 합계 ${changed}건 다시 맞춤`);
  } catch (e) {
    console.warn("플레이타임 합계 재계산 실패 — 서비스는 계속 뜬다 (기록을 고치면 그 항목은 다시 맞춰진다)", e);
  }

  try {
    if (await grantHomeops(db())) console.log(`homeops 계정(${HOMEOPS_ROLE}) 권한 맞춤`);
  } catch (e) {
    console.warn("homeops 계정 권한 맞추기 실패 — 서비스는 계속 뜬다 (연계만 막힌다)", e);
  }
}
