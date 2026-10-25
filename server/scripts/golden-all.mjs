/**
 * 녹화본 회귀 테스트 전부 — `npm run test:golden`.
 * 시나리오마다 서버를 새로 띄우므로 하나씩 돈다 (전부 합쳐 1분 안팎).
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "test/scenarios");
const only = process.argv[2];
const scenarios = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && (!only || f.includes(only))).sort();
// 하나도 없으면 "0 / 0 통과"로 초록불이 된다 — 경로가 틀렸거나 필터가 아무것도 못 잡은 것
if (scenarios.length === 0) { console.error(`시나리오가 없다${only ? ` (필터: ${only})` : ""}`); process.exit(1); }
let failed = 0;
for (const f of scenarios) {
  const r = spawnSync(path.join(root, "node_modules/.bin/tsx"), ["test/harness/run.ts", path.join("test/scenarios", f)],
    { cwd: root, encoding: "utf8", env: { ...process.env, HARNESS_QUIET: "1" } });
  const summary = (r.stdout ?? "").split("\n").filter((l) => l.startsWith("── ")).map((l) => l.slice(3)).join(" · ");
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${f.replace(/\.json$/, "").padEnd(14)} ${summary || (r.stderr ?? "").trim().split("\n").at(-1)}`);
  if (!ok) console.log((r.stdout ?? "").split("\n").filter((l) => l.startsWith("✗") || l.startsWith("    ")).slice(0, 12).join("\n"));
}
console.log(`\n${scenarios.length - failed} / ${scenarios.length} 통과`);
process.exit(failed ? 1 : 0);
