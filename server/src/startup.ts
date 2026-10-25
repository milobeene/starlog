/**
 * 기동 직후 할 일.
 * **실패가 기동을 막으면 안 된다.** 정리 없이도 서비스는 멀쩡히 돈다.
 */
import { lt } from "drizzle-orm";
import { db } from "./db/client";
import { apiCallLog } from "./db/schema";
import { nowKst } from "./common/clock";
import { syncAllPlayTimes } from "./domains/backlog/playtime";
import { RETENTION_DAYS } from "./domains/system/service";

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
}
