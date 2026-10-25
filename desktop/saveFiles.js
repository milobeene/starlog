/**
 * 세이브파일 — **폴더 하나**다 (v2, PGlite 데이터 디렉터리). `<데이터루트>/saves/<이름>/`
 *
 * 자바 시절엔 `<이름>.mv.db` 파일 하나였고 확장자를 여기저기서 직접 만졌다. 이제 모양이
 * 바뀌므로 세이브파일이 "무엇인가"를 이 모듈 하나만 안다.
 *
 * 폴더 옆의 `<이름>.lock`은 서버가 쥐는 잠금이다 (두 프로세스가 같은 폴더를 열면 망가진다).
 */
const fs = require("fs");
const path = require("path");
const tarball = require("./tarball");

/** 이게 있으면 PGlite가 한 번이라도 연 폴더다 */
const MARKER = "PG_VERSION";

function dirOf(dirs, name) {
  // 이름은 위(main.js)에서 걸러 오지만 여기가 `rm -r`의 마지막 문이다 — `..`나 구분자가 낀 이름이 saves/ 밖을 가리키지 않게 한 번 더
  if (typeof name !== "string" || name === "" || name.startsWith(".") || /[\\/\0]/.test(name)) {
    throw new Error(`잘못된 세이브파일 이름입니다: ${String(name).slice(0, 60)}`);
  }
  return path.join(dirs.saves, name);
}

function exists(dirs, name) {
  return fs.existsSync(path.join(dirOf(dirs, name), MARKER));
}

/** 이름이 이미 쓰였는가 — 만들다 만 폴더도 쓰인 것으로 본다 */
function taken(dirs, name) {
  return fs.existsSync(dirOf(dirs, name));
}

function list(dirs) {
  if (!fs.existsSync(dirs.saves)) return [];
  return fs.readdirSync(dirs.saves, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dirs.saves, e.name, MARKER)))
    .map((e) => {
      const dir = path.join(dirs.saves, e.name);
      return {
        name: e.name,
        sizeBytes: tarball.sizeOf(dir),
        modifiedAt: new Date(tarball.latestMtime(dir)).toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function rename(dirs, from, to) {
  fs.renameSync(dirOf(dirs, from), dirOf(dirs, to));
  const lock = `${dirOf(dirs, from)}.lock`;
  if (fs.existsSync(lock)) fs.rmSync(lock, { force: true });
}

function remove(dirs, name) {
  fs.rmSync(dirOf(dirs, name), { recursive: true, force: true });
  fs.rmSync(`${dirOf(dirs, name)}.lock`, { force: true });
}

module.exports = { dirOf, exists, taken, list, rename, remove };
