/**
 * `migrations/V*.sql` → `src/db/migrations.generated.ts`.
 * SQL을 코드에 박아 넣는다 — 번들 하나에 다 들어가서 앱에 SQL 파일을 따로 실을 필요가 없다.
 * SQL을 추가·수정하면 다시 돌린다 (`npm run gen`). typecheck·build가 먼저 돌린다.
 */
import fs from "fs";
import path from "path";
const dir = path.resolve(import.meta.dirname, "../migrations");
const files = fs.readdirSync(dir).filter(f => /^V\d+__.+\.sql$/.test(f))
  .sort((a, b) => +a.match(/^V(\d+)/)![1]! - +b.match(/^V(\d+)/)![1]!);
const items = files.map(f => {
  const [, v, desc] = f.match(/^V(\d+)__(.+)\.sql$/)!;
  return { version: v!, description: desc!.replace(/_/g, " "), script: f, sql: fs.readFileSync(path.join(dir, f), "utf8") };
});
const out = `// 생성 파일 — 손대지 말 것. scripts/gen-migrations.ts\nexport const MIGRATIONS = ${JSON.stringify(items, null, 1)} as const;\n`;
fs.writeFileSync(path.resolve(import.meta.dirname, "../src/db/migrations.generated.ts"), out);
console.log(`migrations: ${items.length} (V${items[0]!.version}..V${items.at(-1)!.version})`);
