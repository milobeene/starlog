/**
 * 주인 + 기본 카탈로그만 있는 픽스처 — "클라우드 → 로컬 세이브파일" 직후(빈 세이브)의 모습.
 *
 * 자바를 정답지로 쓰려면 주인이 이미 있어야 한다 — 자바는 빈 Postgres에서 주인을 못 만든다
 * (`v2-plan.md` 버그 2). member-fresh 시나리오가 이걸 쓴다:
 *   npx tsx scripts/build-fresh-fixture.ts <출력폴더>
 *   HARNESS_FIXTURE=<출력폴더> npx tsx test/harness/run.ts test/scenarios/member-fresh.json
 */
import fs from "fs";
import { openDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { member } from "../src/db/schema";
import { nowKst } from "../src/common/clock";
import { seedDefaultCatalog } from "../src/domains/platform/seed";
const dir = process.argv[2]!;
fs.rmSync(dir, { recursive: true, force: true });
const o = await openDb({ kind: "pglite", dir });
await migrate(o);
await o.db.transaction(async (tx) => {
  const now = nowKst();
  const [row] = await tx.insert(member).values({ email: "owner@starlog.local", password: "(no-login)", nickname: "Scribe",
    role: "USER", emailVerified: false, createdAt: now, updatedAt: now }).returning({ id: member.id });
  await seedDefaultCatalog(tx, row!.id);
});
await o.close();
console.log("ok", dir);
