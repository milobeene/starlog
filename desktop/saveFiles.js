/**
 * 세이브파일 — **폴더 하나**다 (v2, PGlite 데이터 디렉터리). `<데이터루트>/saves/<이름>/`
 *
 * 세이브파일이 "무엇인가"를 이 모듈 하나만 안다.
 *
 * 폴더 옆의 `<이름>.lock`은 서버가 쥐는 잠금이다 (두 프로세스가 같은 폴더를 열면 망가진다).
 * 폴더 옆의 `<이름>.partial`은 **만드는 중** 표시다 — 클라우드를 뽑거나 안전망을 붓는 동안
 * 앱이 꺼지면 반쯤 부은 폴더가 남는데, 폴더 안엔 이미 `PG_VERSION`이 있어 멀쩡한 세이브로 보였다.
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

function partialOf(dirs, name) {
  return `${dirOf(dirs, name)}.partial`;
}

function exists(dirs, name) {
  return fs.existsSync(path.join(dirOf(dirs, name), MARKER)) && !fs.existsSync(partialOf(dirs, name));
}

/** 이름이 이미 쓰였는가 — 만들다 만 폴더도 쓰인 것으로 본다 */
function taken(dirs, name) {
  return fs.existsSync(dirOf(dirs, name)) || fs.existsSync(partialOf(dirs, name));
}

function list(dirs) {
  if (!fs.existsSync(dirs.saves)) return [];
  return fs.readdirSync(dirs.saves, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dirs.saves, e.name, MARKER))
      && !fs.existsSync(path.join(dirs.saves, `${e.name}.partial`)))
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

/** 만드는 중 표시. 폴더보다 **먼저** 둔다 — 서버가 폴더를 만드는 순간부터 가려져 있어야 한다 */
function markPartial(dirs, name) {
  fs.mkdirSync(dirs.saves, { recursive: true });
  fs.writeFileSync(partialOf(dirs, name), String(process.pid));
}

function clearPartial(dirs, name) {
  fs.rmSync(partialOf(dirs, name), { force: true });
}

/**
 * 지난 실행이 만들다 만 세이브를 치운다 (기동 때). 표시가 남아 있다는 건 붓기가 끝나지 않았다는 뜻이다.
 * `skip` — 지금 붓고 있는 이름(같은 실행)은 건드리지 않는다
 */
function cleanPartials(dirs, skip = new Set()) {
  if (!fs.existsSync(dirs.saves)) return [];
  const removed = [];
  for (const file of fs.readdirSync(dirs.saves)) {
    if (!file.endsWith(".partial")) continue;
    const name = file.slice(0, -".partial".length);
    if (skip.has(name)) continue;
    try {
      remove(dirs, name);
      removed.push(name);
    } catch { /* 이름이 규칙 밖이면 사람이 지운다 */ }
  }
  return removed;
}

/*
 * 윈도우는 방금 닫은 폴더를 백신·인덱서가 잠깐 쥐고 있으면 첫 시도에 EBUSY/EPERM이 난다.
 * 몇 번 쉬었다 다시 해 본다 — 맥에서는 첫 번에 끝나서 비용이 없다
 */
const RETRY_CODES = new Set(["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"]);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from, to, attempts = 6) {
  for (let i = 1; ; i += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (i >= attempts || !RETRY_CODES.has(e?.code)) throw e;
      sleepSync(150 * i);
    }
  }
}

function rename(dirs, from, to) {
  renameWithRetry(dirOf(dirs, from), dirOf(dirs, to));
  const lock = `${dirOf(dirs, from)}.lock`;
  if (fs.existsSync(lock)) fs.rmSync(lock, { force: true });
}

function remove(dirs, name) {
  fs.rmSync(dirOf(dirs, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.rmSync(`${dirOf(dirs, name)}.lock`, { force: true });
  clearPartial(dirs, name);
}

module.exports = {
  dirOf, exists, taken, list, rename, remove, markPartial, clearPartial, cleanPartials, renameWithRetry,
};
