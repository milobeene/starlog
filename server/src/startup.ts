/**
 * 기동 직후 할 일 — 자바 `StartupCleanup`.
 * **실패가 기동을 막으면 안 된다.** 정리 없이도 서비스는 멀쩡히 돈다.
 */
import { lt } from "drizzle-orm";
import { db } from "./db/client";
import { apiCallLog } from "./db/schema";
import { nowKst } from "./common/clock";

/** API 호출 기록 보존 기간 (자바 `SystemStatusService.RETENTION_DAYS`) */
export const API_CALL_RETENTION_DAYS = 30;

export async function runStartupTasks() {
  try {
    const threshold = nowKst(new Date(Date.now() - API_CALL_RETENTION_DAYS * 86_400_000));
    const removed = await db().delete(apiCallLog).where(lt(apiCallLog.calledAt, threshold)).returning({ id: apiCallLog.id });
    if (removed.length > 0) console.log(`API 호출 기록 ${removed.length}건 정리 (보존 ${API_CALL_RETENTION_DAYS}일)`);
  } catch (e) {
    console.warn("API 호출 기록 정리 실패 — 서비스는 계속 뜬다", e);
  }
}
