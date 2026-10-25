/**
 * `migrations/V*.sql` → `src/db/migrations.generated.ts`.
 * SQL을 코드에 박아 넣는다 — 번들 하나에 다 들어가서 앱에 SQL 파일을 따로 실을 필요가 없다.
 * SQL을 추가·수정하면 다시 돌린다 (`npm run gen`). typecheck·build가 먼저 돌린다.
 */
import fs from "fs";
import zlib from "zlib";
import path from "path";
const dir = path.resolve(import.meta.dirname, "../migrations");
const all = fs.readdirSync(dir).filter(f => f.endsWith(".sql"));
// 이름 규칙에 안 맞는 SQL은 조용히 빠지면 안 된다 (`v17__x.sql`·`V17_x.sql` — 적용 안 된 채 넘어간다)
const odd = all.filter(f => !/^V\d+__.+\.sql$/.test(f));
if (odd.length) { console.error(`마이그레이션 이름이 규칙(V<번호>__<설명>.sql)에 안 맞는다: ${odd.join(", ")}`); process.exit(1); }
const files = all.sort((a, b) => +a.match(/^V(\d+)/)![1]! - +b.match(/^V(\d+)/)![1]!);
const versions = files.map(f => String(+f.match(/^V(\d+)/)![1]!));
const dup = versions.filter((v, i) => versions.indexOf(v) !== i);
if (dup.length) { console.error(`같은 번호의 마이그레이션이 둘 이상이다: V${[...new Set(dup)].join(", V")}`); process.exit(1); }
const items = files.map(f => {
  const [, v, desc] = f.match(/^V(\d+)__(.+)\.sql$/)!;
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  return { version: v!, description: desc!.replace(/_/g, " "), script: f, checksum: flywayChecksum(sql), sql };
});
const out = `// 생성 파일 — 손대지 말 것. scripts/gen-migrations.ts\nexport const MIGRATIONS = ${JSON.stringify(items, null, 1)} as const;\n`;
fs.writeFileSync(path.resolve(import.meta.dirname, "../src/db/migrations.generated.ts"), out);
console.log(`migrations: ${items.length} (V${items[0]!.version}..V${items.at(-1)!.version})`);

/**
 * Flyway 체크섬 (`ChecksumCalculator`) — 줄마다 줄바꿈을 뗀 UTF-8 바이트로 CRC32를 이어 굴리고
 * 부호 있는 32비트로 자른다. 첫 줄의 BOM은 뗀다.
 * 맞춰 두는 이유: 이력 행을 자바 Flyway가 그대로 받아들여야 비교 장치가 같은 DB를 쓸 수 있다
 */
function flywayChecksum(text: string): number {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();     // readLine()은 마지막 줄바꿈 뒤 빈 줄을 주지 않는다
  let crc = 0;
  for (const l of lines) crc = zlib.crc32(Buffer.from(l, "utf8"), crc);
  return crc | 0;
}
