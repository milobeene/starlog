/**
 * 개발 서버 — `npm run dev`. 자바 시절 `./gradlew bootRun` 자리.
 *
 * - 8080에 뜬다 (프론트 개발 서버가 `/api`를 여기로 넘긴다 — `frontend/next.config.ts`)
 * - DB는 `server/.dev/db` (없으면 빈 DB로 시작 — 주인·기본 카탈로그가 저절로 생긴다).
 *   실데이터로 보고 싶으면 `npm run dev -- --fixture` → 실데이터 픽스처를 복사해서 연다
 * - `dev` 프로필이라 `X-Member-Id` 헤더를 읽는다 (계약 검사 `tools/contract-check.py`가 쓴다)
 * - 코드를 고치면 다시 뜬다 (`tsx watch`)
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const dev = path.join(root, ".dev");
const db = path.join(dev, "db");
if (process.argv.includes("--fixture")) {
  const fixture = path.join(dev, "fixture");
  if (!fs.existsSync(path.join(fixture, "PG_VERSION"))) {
    console.error("실데이터 픽스처가 없다 — 회귀 테스트를 한 번 돌리면 만들어진다 (npm run test:golden)");
    process.exit(1);
  }
  fs.rmSync(db, { recursive: true, force: true });
  fs.cpSync(fixture, db, { recursive: true });
  console.log("실데이터 픽스처를 복사했다 → .dev/db");
}
fs.mkdirSync(dev, { recursive: true });
spawnSync(path.join(root, "node_modules/.bin/tsx"), ["scripts/gen-migrations.ts"], { cwd: root, stdio: "inherit" });
spawn(path.join(root, "node_modules/.bin/tsx"), ["watch", "src/main.ts"], {
  cwd: root, stdio: "inherit",
  env: {
    STARLOG_PORT: "8080", STARLOG_PROFILE: "dev",
    STARLOG_DB_DIR: db, STARLOG_DATA_ROOT: path.join(dev, "data"),
    ...process.env,
  },
});
