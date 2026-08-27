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
 */
const fs = require("fs");
const path = require("path");
const names = require("./saveName");

/**
 * 보존 한도 (사용자 결정 2026-08-28).
 *
 * **디스크가 아니라 목록이 문제다.** 세이브파일이 100KB 남짓이라 300개를 둬도 30MB지만,
 * 되돌리려고 목록을 열었을 때 300줄이 뜨면 무엇을 골라야 할지 알 수가 없다.
 * 용량 한도는 지금은 절대 안 걸린다 — DB가 커졌을 때의 안전판이다.
 */
const KEEP_COUNT = 30;
const KEEP_BYTES = 100 * 1024 * 1024;   // 100MB

/** `2026-08-28_0130` — 파일명으로 쓰이므로 콜론이 없어야 한다 (윈도우가 거부한다) */
function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function folderOf(dirs, saveName) {
  return path.join(dirs.backups, saveName);
}

function saveFile(dirs, saveName) {
  return path.join(dirs.saves, `${saveName}.mv.db`);
}

/** 오래된 것이 뒤로 간다 — 목록도 정리도 같은 순서를 쓴다 */
function list(dirs, saveName) {
  const folder = folderOf(dirs, saveName);
  if (!fs.existsSync(folder)) {
    return [];
  }
  return fs.readdirSync(folder)
    .filter((f) => f.endsWith(".mv.db"))
    .map((f) => {
      const stat = fs.statSync(path.join(folder, f));
      return {
        fileName: f,
        label: f.replace(/\.mv\.db$/, ""),
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 화면이 "지금 몇 개 · 얼마" 를 한도와 나란히 보여준다 — 안 그러면 "왜 지워졌지"가 생긴다 */
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

/**
 * 백업 하나 만들기. **DB가 닫혀 있을 때만 불러야 한다.**
 *
 * `.trace.db`는 안 담는다 — H2가 오류를 남기는 곁다리 파일이라 데이터가 아니고,
 * 담으면 되돌릴 때 **옛 오류 로그가 새 세이브파일에 붙어 다닌다**
 */
function create(dirs, saveName, at = new Date()) {
  const source = saveFile(dirs, saveName);
  if (!fs.existsSync(source)) {
    throw new Error(`세이브파일이 없습니다: ${saveName}`);
  }

  const folder = folderOf(dirs, saveName);
  fs.mkdirSync(folder, { recursive: true });

  const target = path.join(folder, `${stamp(at)}.mv.db`);
  fs.copyFileSync(source, target);

  // **만든 직후에 정리한다.** 개수가 늘어나는 순간이 여기뿐이라 다른 곳에서 볼 이유가 없다
  const removed = prune(dirs, saveName);
  return { fileName: path.basename(target), removed };
}

/**
 * 앱을 열 때마다 부른다. **내용이 안 바뀌었으면 안 만든다.**
 *
 * 열고 아무것도 안 하고 닫는 일이 흔한데 그때마다 똑같은 파일이 쌓이면
 * 30개가 전부 같은 내용이 되어 보존 한도가 **되돌릴 지점을 지우는** 꼴이 된다.
 * 크기와 수정시각으로 비교한다 — 해시를 뜨는 건 이 목적에 과하다
 */
function autoBackup(dirs, saveName) {
  const source = saveFile(dirs, saveName);
  if (!fs.existsSync(source)) {
    return null;   // 새로 만드는 세이브파일이다. 백업할 내용이 아직 없다
  }

  const latest = list(dirs, saveName)[0];
  if (latest) {
    const src = fs.statSync(source);
    const dst = fs.statSync(path.join(folderOf(dirs, saveName), latest.fileName));
    if (src.size === dst.size && src.mtimeMs <= dst.mtimeMs) {
      return null;
    }
  }
  return create(dirs, saveName);
}

/**
 * 한도를 넘으면 오래된 것부터 지운다.
 *
 * **가장 최신 하나는 어떤 경우에도 남긴다.** 용량 한도가 아무리 빡빡해도, 혹은 파일 하나가
 * 한도보다 커도 마찬가지다 — 백업이 하나도 없는 상태를 규칙이 만들어내면 안 된다
 */
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

/**
 * 되돌리기 — 백업을 **새 세이브파일로** 복사한다.
 *
 * ⚠️ **원본을 덮어쓰지 않는다.** "되돌렸는데 그게 잘못이었다"는 실제로 일어나는데,
 * 덮어쓰면 그 순간 돌아갈 곳이 사라진다. 이름이 겹치면 뒤에 번호를 붙인다.
 *
 * ⚠️ **만든 이름이 `assertSaveName`을 통과해야 한다** (2026-08-28). 예전엔 ` (2)`를
 * 붙였는데 괄호가 허용 문자에 없어서, 같은 백업을 두 번 되돌리면 **열 수도 지울 수도 없는**
 * 세이브파일이 생겼다. 이름이 50자를 넘어도 같았다. 이제 `saveName.js`의 `fit`이 다듬는다
 */
function restore(dirs, saveName, fileName) {
  const source = path.join(folderOf(dirs, saveName), path.basename(fileName));
  if (!fs.existsSync(source)) {
    throw new Error("백업 파일을 찾을 수 없습니다");
  }

  const base = `${saveName} ${path.basename(fileName, ".mv.db")}`;
  let name = names.fit(base);
  for (let i = 2; fs.existsSync(saveFile(dirs, name)); i += 1) {
    name = names.fit(base, `-${i}`);
  }

  fs.copyFileSync(source, saveFile(dirs, name));
  return name;
}

function remove(dirs, saveName, fileName) {
  fs.rmSync(path.join(folderOf(dirs, saveName), path.basename(fileName)), { force: true });
}

/** 세이브파일을 지우면 그 백업 폴더도 함께 간다 — 남겨두면 주인 없는 폴더가 쌓인다 */
function removeAll(dirs, saveName) {
  fs.rmSync(folderOf(dirs, saveName), { recursive: true, force: true });
}

module.exports = { list, usage, create, autoBackup, restore, remove, removeAll, KEEP_COUNT, KEEP_BYTES };
