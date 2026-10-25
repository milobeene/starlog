/**
 * 패키지에 들어갈 파일 점검 — "패키지에서만 Cannot find module로 기동하자마자 죽는" 사고를 막는다.
 *
 *   node tools/check-package.js                       # 소스 기준: electron-builder.yml `files`가 require 그래프를 다 덮나
 *   node tools/check-package.js --asar <app.asar>     # 패키징 뒤: asar 안에 그래프가 다 있고, 풀어 둔 서버·화면이 있나
 *
 * e2e는 소스에서만 돈다 — 패키징된 앱은 실행해 보지 않으므로 최소한 파일이 다 실렸는지는 여기서 본다.
 * 실패하면 종료 코드 1
 */
const fs = require("fs");
const path = require("path");

const DESKTOP = path.resolve(__dirname, "..", "desktop");
const ENTRIES = ["main.js", "preload.js"];
const problems = [];

/** `require("./x")`만 따라간다 — 패키지 모듈(electron·node 내장)은 electron-builder 몫이다 */
function localRequires(source) {
  const out = [];
  for (const m of source.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

function resolveIn(has, from, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  return [base, `${base}.js`, `${base}/index.js`].find((c) => has(c)) ?? null;
}

/** 진입점에서 닿는 앱 모듈 전부 */
function graph(has, read) {
  const seen = new Set();
  const stack = [...ENTRIES];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    if (!has(file)) {
      problems.push(`없음: ${file}`);
      continue;
    }
    seen.add(file);
    for (const spec of localRequires(read(file))) {
      const found = resolveIn(has, file, spec);
      if (found) stack.push(found);
      else problems.push(`${file} → ${spec}: 패키지에 없다`);
    }
  }
  return seen;
}

/** yml의 `files:` 목록 (들여쓴 `- 패턴` 줄) */
function filePatterns() {
  const yml = fs.readFileSync(path.join(DESKTOP, "electron-builder.yml"), "utf8");
  const block = /^files:\n((?:[ \t]+-[^\n]*\n|[ \t]*#[^\n]*\n)+)/m.exec(yml);
  if (!block) throw new Error("electron-builder.yml에 files: 목록이 없다");
  return block[1].split("\n").map((l) => /^\s+-\s+"?([^"#\s]+)"?/.exec(l)?.[1]).filter(Boolean);
}

/** electron-builder 패턴 중 우리가 쓰는 모양만 — `*.js`, `dir/**\/*`, 그대로 이름 */
function matcher(patterns) {
  const res = patterns.map((p) => new RegExp(`^${p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")}$`));
  return (file) => res.some((r) => r.test(file));
}

function checkSource() {
  const included = matcher(filePatterns());
  const exists = (f) => fs.existsSync(path.join(DESKTOP, f)) && fs.statSync(path.join(DESKTOP, f)).isFile();
  const has = (f) => exists(f) && included(f);
  graph(has, (f) => fs.readFileSync(path.join(DESKTOP, f), "utf8"));
  for (const f of ["server/main.mjs", "web/index.html", "package.json"]) {
    if (!included(f)) problems.push(`files 목록이 ${f}를 안 싣는다`);
  }
  // 소스 그래프 밖의 맨 위 .js가 있으면 실릴 뿐 해는 없다 — 반대(그래프 안인데 빠짐)만 잡는다
}

function checkAsar(asarPath) {
  // electron-builder가 깔아 둔 것을 쓴다 — 이 점검을 위해 의존성을 새로 들이지 않는다
  const asar = require(require.resolve("@electron/asar", { paths: [path.join(DESKTOP, "node_modules")] }));
  const list = new Set(asar.listPackage(asarPath).map((f) => f.replace(/\\/g, "/").replace(/^\//, "")));
  const unpacked = `${asarPath}.unpacked`;
  const has = (f) => list.has(f);
  graph(has, (f) => asar.extractFile(asarPath, f).toString("utf8"));
  for (const f of ["server/main.mjs", "web/index.html"]) {
    if (!fs.existsSync(path.join(unpacked, f))) problems.push(`asar 밖(unpacked)에 ${f}가 없다 — utilityProcess·PGlite가 실제 파일을 읽는다`);
  }
  if (!fs.existsSync(path.join(unpacked, "node_modules/@electric-sql/pglite"))) problems.push("asar 밖에 PGlite가 없다");
}

const at = process.argv.indexOf("--asar");
if (at >= 0) checkAsar(path.resolve(process.argv[at + 1]));
else checkSource();

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log("✓ 패키지 파일 점검 통과");
