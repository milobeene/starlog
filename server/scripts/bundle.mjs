/**
 * 서버 → 일렉트론용 번들 하나 (`desktop/server/main.mjs`).
 *
 * PGlite만 **번들하지 않는다** — wasm·확장 파일 수십 개를 `import.meta.url` 기준으로 찾아서,
 * 번들에 섞으면 경로가 깨진다. 일렉트론 쪽 `node_modules`에 패키지째 실린다 (desktop/package.json).
 * `pg-native`는 `pg`의 선택 의존성이라 없어도 된다.
 */
import { build } from "esbuild";
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const outfile = path.resolve(root, "../desktop/server/main.mjs");
const result = await build({
  entryPoints: [path.join(root, "src/main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",          // 일렉트론 33의 Node
  external: ["@electric-sql/pglite", "pg-native"],
  // CJS 의존성(pg)이 require를 부른다 — ESM 번들 안에서도 쓸 수 있게
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  sourcemap: "linked",
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
});

/*
 * 번들에 섞여 들어간 패키지의 라이선스를 한 파일로 — Apache-2.0(drizzle-orm)은 사본을 같이 배포해야 한다.
 * 번들은 법적 주석을 지우므로(`legalComments: "none"`) 여기서 따로 모은다.
 * PGlite는 번들하지 않고 패키지째 실리므로 자기 LICENSE가 그대로 따라간다
 */
/** 패키지에 라이선스 파일이 없을 때 (drizzle-orm·pg-types·pgpass) — 라이선스 이름으로 표준 전문을 붙인다 */
const APACHE = fs.readFileSync(path.join(root, "node_modules/@electric-sql/pglite/LICENSE"), "utf8");
function fallback(meta) {
  const author = typeof meta.author === "string" ? meta.author : meta.author?.name ?? "the authors";
  if (meta.license === "Apache-2.0") return APACHE;
  if (meta.license === "MIT") return `MIT License\n\nCopyright (c) ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
  throw new Error(`라이선스 파일이 없고 표준 전문도 모르는 패키지: ${meta.name} (${meta.license})`);
}
const pkgs = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (!m || pkgs.has(m[1])) continue;
  const dir = path.join(root, "node_modules", m[1]);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  pkgs.set(m[1], { version: meta.version, license: meta.license ?? "?", text: file ? fs.readFileSync(path.join(dir, file), "utf8") : fallback(meta) });
}
const notices = [...pkgs.entries()].sort().map(([name, p]) => `${"=".repeat(72)}\n${name}@${p.version} — ${p.license}\n${"=".repeat(72)}\n${p.text.trim()}\n`);
fs.writeFileSync(path.join(path.dirname(outfile), "THIRD_PARTY_LICENSES.txt"),
  `STARLOG 서버 번들(main.mjs)에 포함된 소프트웨어\n\n${notices.join("\n")}`);
console.log(`bundle → desktop/server/main.mjs  (+ 라이선스 ${pkgs.size}개: ${[...pkgs.keys()].sort().join(", ")})`);
