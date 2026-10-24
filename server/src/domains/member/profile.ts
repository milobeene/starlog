/**
 * 프로필 — `member` 테이블의 **한 행**. 로그인이 없고 주인은 하나다 (V14가 두 번째 행을 막는다).
 *
 * 기동 때 없으면 만든다(`ensureProfile`, 빈 DB의 첫 기동). 요청은 `findProfile`로 읽기만 한다 —
 * 요청 중에 만들면 PGlite에서 바깥 트랜잭션이 안쪽 트랜잭션을 기다리며 선다.
 */
import { db, type Db } from "../../db/client";
import { member } from "../../db/schema";
import { isUniqueViolation } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { seedDefaultCatalog } from "../platform/seed";

export type ProfileRow = typeof member.$inferSelect;

export async function findProfile(d: Db): Promise<ProfileRow> {
  const [row] = await d.select().from(member).limit(1);
  if (!row) throw new Error("프로필 행이 없습니다 — 기동 때 ensureProfile()이 만들어야 한다");
  return row;
}

/** 빈 DB면 프로필 + 기본 선택지(플랫폼·입력방식)를 만든다 */
export async function ensureProfile(): Promise<void> {
  const [found] = await db().select({ id: member.id }).from(member).limit(1);
  if (found) return;
  try {
    await db().transaction(async (tx) => {
      const now = nowKst();
      await tx.insert(member).values({ nickname: "Scribe", createdAt: now, updatedAt: now });
      await seedDefaultCatalog(tx);
    });
    console.log("프로필을 새로 만들었습니다");
  } catch (e) {
    // 다른 PC가 같은 클라우드 DB에서 같은 순간 만들었다 (uk_member_single) — 그쪽 것을 쓴다
    if (!isUniqueViolation(e)) throw e;
  }
}
