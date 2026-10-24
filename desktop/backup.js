/**
 * 세이브파일 백업 (v1.0 9단계, architecture §5).
 *
 * ## `BACKUP TO`를 안 쓴다
 *
 * 문서는 "쓰는 중인 `.mv.db`를 `cp`로 복사하면 손상되니 H2의 `BACKUP TO`를 쓰라"고 했다.
 * 맞는 말이지만 **그건 DB가 열려 있을 때 이야기다.** 우리 구조에는 닫혀 있는 순간이
 * 분명히 있다 — 백엔드를 띄우기 **전**, 즉 입구 화면이다.
 *
 * 거기서 복사하면 그냥 파일 복사로 충분하고, 백업이 **세이브파일과 똑같은 `.mv.db`**로 남는다.
 * `BACKUP TO`는 zip을 뱉어서 되돌릴 때 압축을 풀어야 하는데, 그 복잡도가 통째로 사라진다.
 * → 그래서 백업은 전부 일렉트론이 한다. 백엔드는 이 일에 손을 안 댄다.
 *
 * ## 클라우드 모드에는 백업이 없다
 *
 * 복사할 파일이 아예 없다 — 데이터가 남의 서버에 있다.
 * 클라우드 쪽 대응물은 "로컬 세이브파일로 뽑기"(§6)이고, 그건 백업이 아니라 **생성**이다.
 *
 * ## v2 (PGlite)
 *
 * 세이브파일이 파일이 아니라 **폴더**가 됐다. 백업은 그 폴더를 `.tar.gz` 한 장으로 묶는다
 * (`tarball.js`). 실데이터 기준 폴더 41MB → 묶음 5MB. 원칙은 그대로 —
 * **DB가 닫혀 있는 순간(입구 화면)에 일렉트론이 한다.** 백엔드는 백업 폴더에 손을 안 댄다.
 * 자바 시절의 `.mv.db` 백업은 목록에 안 나온다 (H2 파일은 새 앱이 열 수 없다).
 */
const fs = require("fs");
const path = require("path");
const names = require("./saveName");
const saveFiles = require("./saveFiles");
const tarball = require("./tarball");

const KEEP_COUNT = 30;
const KEEP_BYTES = 100 * 1024 * 1024;   // 100MB
const EXT = ".tar.gz";

function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function folderOf(dirs, saveName) {
  return path.join(dirs.backups, saveName);
}

function list(dirs, saveName) {
  const folder = folderOf(dirs, saveName);
  if (!fs.existsSync(folder)) {
    return [];
  }
  return fs.readdirSync(folder)
    .filter((f) => f.endsWith(EXT))
    .map((f) => {
      const stat = fs.statSync(path.join(folder, f));
      return {
        fileName: f,
        label: f.slice(0, -EXT.length),
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function usage(dirs, saveName) {
  const items = list(dirs, saveName);
  return {
    items,
    count: items.length,
    totalBytes: items.reduce((sum, b) => sum + b.sizeBytes, 0),
    keepCount: KEEP_COUNT,
    keepBytes: KEEP_BYTES,
  };
}

function create(dirs, saveName, at = new Date()) {
  if (!saveFiles.exists(dirs, saveName)) {
    throw new Error(`세이브파일이 없습니다: ${saveName}`);
  }
  const source = saveFiles.dirOf(dirs, saveName);
  const folder = folderOf(dirs, saveName);
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, `${stamp(at)}${EXT}`);
  /*
   * 묶는 사이에 누가 썼으면 찢어진 백업이다 — 앞뒤로 가장 늦은 수정 시각을 비교한다.
   * 자바 시절의 "복사 전후 크기·mtime 비교"와 같은 자리다
   */
  const before = tarball.latestMtime(source);
  tarball.pack(source, target);
  if (tarball.latestMtime(source) !== before) {
    fs.rmSync(target, { force: true });
    throw new Error(
      "백업하지 못했습니다 — 이 세이브파일을 다른 곳에서 쓰고 있습니다. "
      + "STARLOG가 두 번 떠 있지 않은지 확인해 주세요.");
  }
  fs.utimesSync(target, at, at);
  // **만든 직후에 정리한다.** 개수가 늘어나는 순간이 여기뿐이라 다른 곳에서 볼 이유가 없다
  const removed = prune(dirs, saveName);
  return { fileName: path.basename(target), removed };
}

/** 열 때 자동 백업 — **마지막 백업 뒤로 바뀐 게 있을 때만** */
function autoBackup(dirs, saveName) {
  if (!saveFiles.exists(dirs, saveName)) {
    return null;   // 새로 만드는 세이브파일이다. 백업할 내용이 아직 없다
  }
  const latest = list(dirs, saveName)[0];
  if (latest) {
    const changedAt = tarball.latestMtime(saveFiles.dirOf(dirs, saveName));
    const backedUpAt = fs.statSync(path.join(folderOf(dirs, saveName), latest.fileName)).mtimeMs;
    if (changedAt <= backedUpAt) {
      return null;
    }
  }
  return create(dirs, saveName);
}

function prune(dirs, saveName) {
  const folder = folderOf(dirs, saveName);
  const items = list(dirs, saveName);   // 최신이 앞
  const removed = [];
  let bytes = 0;
  items.forEach((item, index) => {
    bytes += item.sizeBytes;
    const overCount = index + 1 > KEEP_COUNT;
    const overBytes = bytes > KEEP_BYTES;
    if (index > 0 && (overCount || overBytes)) {
      fs.rmSync(path.join(folder, item.fileName), { force: true });
      removed.push(item.fileName);
    }
  });
  return removed;
}

/** 백업을 **새 세이브파일로** 되살린다. 원본을 덮지 않는다 */
function restore(dirs, saveName, fileName) {
  const source = path.join(folderOf(dirs, saveName), path.basename(fileName));
  if (!fs.existsSync(source)) {
    throw new Error("백업 파일을 찾을 수 없습니다");
  }
  const base = `${saveName} ${path.basename(fileName, EXT)}`;
  let name = names.fit(base);
  for (let i = 2; saveFiles.taken(dirs, name); i += 1) {
    name = names.fit(base, `-${i}`);
  }
  tarball.unpack(source, saveFiles.dirOf(dirs, name));
  return name;
}

function remove(dirs, saveName, fileName) {
  fs.rmSync(path.join(folderOf(dirs, saveName), path.basename(fileName)), { force: true });
}

function removeAll(dirs, saveName) {
  fs.rmSync(folderOf(dirs, saveName), { recursive: true, force: true });
}

module.exports = { list, usage, create, autoBackup, restore, remove, removeAll, KEEP_COUNT, KEEP_BYTES };
