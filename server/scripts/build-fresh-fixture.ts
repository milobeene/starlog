/**
 * 프로필 + 기본 카탈로그만 있는 픽스처 — "클라우드 → 로컬 세이브파일" 직후(빈 세이브)의 모습.
 * 빈 DB의 첫 기동과 같은 길(`ensureProfile`)로 만든다. member-fresh·screenshots 시나리오가 쓴다:
 *   npx tsx scripts/build-fresh-fixture.ts <출력폴더>
 *   HARNESS_FIXTURE=<출력폴더> npx tsx test/harness/run.ts test/scenarios/member-fresh.json
 */
import fs from "fs";
import { openDb, setDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { ensureProfile } from "../src/domains/member/profile";
const dir = process.argv[2]!;
fs.rmSync(dir, { recursive: true, force: true });
const o = await openDb({ kind: "pglite", dir });
await migrate(o);
setDb(o);
await ensureProfile();
await o.close();
console.log("ok", dir);
