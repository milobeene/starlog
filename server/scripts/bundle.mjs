/**
 * 서버 → 일렉트론용 번들 하나 (`desktop/server/main.mjs`).
 *
 * PGlite만 **번들하지 않는다** — wasm·확장 파일 수십 개를 `import.meta.url` 기준으로 찾아서,
 * 번들에 섞으면 경로가 깨진다. 일렉트론 쪽 `node_modules`에 패키지째 실린다 (desktop/package.json).
 * `pg-native`는 `pg`의 선택 의존성이라 없어도 된다.
 */
import { build } from "esbuild";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
await build({
  entryPoints: [path.join(root, "src/main.ts")],
  outfile: path.resolve(root, "../desktop/server/main.mjs"),
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
});
console.log("bundle → desktop/server/main.mjs");
