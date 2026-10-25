/**
 * 연결 시험(`STARLOG_CHECK_ONLY`) — 진단까지만 하고 내려가야 한다. 마이그레이션을 돌면 시험 버튼이 대상 DB에 테이블을 만든다 (R5-M7)
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("연결 시험 모드", () => {
  it("열고 진단만 — 테이블을 안 만들고, 잠금을 풀고, STARLOG_CHECKED로 끝난다", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-check-"));
    const dir = path.join(work, "db");
    try {
      const r = spawnSync(path.join(ROOT, "node_modules/.bin/tsx"), [path.join(ROOT, "src/main.ts")], {
        encoding: "utf8", timeout: 60_000,
        env: { ...process.env, STARLOG_DB_DIR: dir, STARLOG_PORT: "0", STARLOG_PROFILE: "test", STARLOG_API_TOKEN: "", STARLOG_CHECK_ONLY: "true" },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("STARLOG_CHECKED");
      expect(r.stdout).not.toContain("STARLOG_READY");
      expect(fs.existsSync(dir + ".lock")).toBe(false);
      const db = await PGlite.create(dir);
      const t = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
      await db.close();
      expect(t.rows[0]!.n).toBe(0);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }, 90_000);
});
