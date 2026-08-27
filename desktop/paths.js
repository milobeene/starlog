/**
 * 경로를 정하는 단 한 곳 (v1.0 5단계, architecture §5).
 *
 * ## 두 층으로 나뉜다
 *
 *   앱데이터   settings.json · connections.json   ← 고정. 못 옮긴다
 *   데이터 루트 saves/ backups/ covers/ media/     ← 통째로 옮길 수 있다
 *
 * **자격증명을 앱데이터에 고정하는 게 요점이다.** 데이터 루트를 외장 디스크나
 * 공유 폴더로 옮겼을 때 DB 비번이 딸려가면 안 된다.
 *
 * ## 윈도우 대비 (10단계)
 *
 * 경로를 문자열로 붙이지 않고 전부 `path.join`을 쓴다. `app.getPath("userData")`가
 * OS별 위치를 알아서 고른다 — 맥은 `~/Library/Application Support/...`,
 * 윈도우는 `%APPDATA%\...`. 지금 지키면 10단계에서 고칠 게 없다.
 */
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

/**
 * 앱 이름이 곧 앱데이터 폴더 이름이다 (`package.json`의 `name`).
 * `starlog-desktop` → `starlog`로 바꿨다 (2026-08-28) — "desktop"이 붙을 이유가 없다.
 */
const APP_DATA = app.getPath("userData");

/**
 * 옛 폴더에서 이사한다.
 *
 * 이름을 바꾸면 일렉트론이 **빈 폴더를 새로 만들고** 기존 설정·세이브파일이 그대로
 * 옛 폴더에 남는다. 사용자 입장에서는 **앱을 켰더니 기록이 통째로 사라진 것**으로 보인다.
 *
 * 우리 것(settings·connections·data)만 옮긴다 — 크로미움 캐시는 다시 만들어지므로 둔다.
 * 새 폴더에 이미 있으면 건드리지 않는다: 두 번 이사하면 새로 만든 것을 덮어쓴다
 */
function migrateLegacyAppData() {
  const legacy = path.join(path.dirname(APP_DATA), "starlog-desktop");
  if (legacy === APP_DATA || !fs.existsSync(legacy)) {
    return;
  }

  for (const name of ["settings.json", "connections.json", "data", "backend.log"]) {
    const from = path.join(legacy, name);
    const to = path.join(APP_DATA, name);
    if (!fs.existsSync(from) || fs.existsSync(to)) {
      continue;
    }
    try {
      fs.mkdirSync(APP_DATA, { recursive: true });
      fs.renameSync(from, to);
    } catch {
      /*
       * 볼륨이 다르면 rename이 실패한다. 그때는 복사로 대신한다 —
       * 옛것을 지우지는 않는다. 못 지우는 것보다 두 벌이 남는 게 낫다
       */
      try {
        fs.cpSync(from, to, { recursive: true });
      } catch {
        // 그래도 안 되면 포기한다. 앱은 빈 폴더로 뜨고 사용자가 직접 옮기면 된다
      }
    }
  }

  /*
   * ⚠️ **파일만 옮기면 안 된다.** `settings.json`의 `dataRoot`가 옛 폴더를 가리키는
   * 절대 경로로 굳어 있을 수 있는데, 그러면 데이터는 새 자리에 있는데 앱은 옛 자리를 본다.
   * 옛 자리에는 `ensureDataRoot`가 **빈 폴더를 새로 만들어** 놓으므로,
   * 사용자 눈에는 **세이브파일이 통째로 사라진 것**으로 보인다. 실제로 그렇게 났다.
   *
   * 옛 앱데이터 안을 가리키고 있었다면 null로 되돌린다 — null은 "기본값을 쓴다"는 뜻이라
   * 새 앱데이터를 따라간다
   */
  repointDataRoot(legacy);
}

function repointDataRoot(legacy) {
  const file = path.join(APP_DATA, "settings.json");
  if (!fs.existsSync(file)) {
    return;
  }
  try {
    const settings = JSON.parse(fs.readFileSync(file, "utf8"));
    const root = settings?.dataRoot;
    if (typeof root !== "string" || !path.resolve(root).startsWith(path.resolve(legacy))) {
      return;
    }
    settings.dataRoot = null;
    fs.writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
  } catch {
    // 못 읽으면 둔다. settings.js가 깨진 파일을 기본값으로 새로 만든다
  }
}

const SETTINGS_FILE = path.join(APP_DATA, "settings.json");
/** ⚠️ 평문이다 (결정 13). 백업·세이브파일·JSON 내보내기 어디에도 안 들어간다 */
const CONNECTIONS_FILE = path.join(APP_DATA, "connections.json");
const LOG_FILE = path.join(APP_DATA, "backend.log");

/** 아무것도 안 정했을 때. 앱데이터 안이라 첫 실행에 질문이 없다 */
const DEFAULT_DATA_ROOT = path.join(APP_DATA, "data");

function subPaths(dataRoot) {
  return {
    root: dataRoot,
    saves: path.join(dataRoot, "saves"),
    backups: path.join(dataRoot, "backups"),
    covers: path.join(dataRoot, "covers"),
    media: path.join(dataRoot, "media"),
  };
}

/** 없으면 만든다. 있으면 아무 일도 안 한다 (`recursive`가 그렇게 동작한다) */
function ensureDataRoot(dataRoot) {
  const dirs = subPaths(dataRoot);
  for (const dir of Object.values(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dirs;
}

/**
 * 세이브파일 경로 → JDBC URL.
 *
 * H2는 `.mv.db`를 자기가 붙이므로 **확장자를 뺀 경로**를 준다.
 * `MODE=PostgreSQL`은 마이그레이션 SQL 한 벌로 H2와 PostgreSQL을 다 태우기 위한 것이고,
 * 이건 지금 dev에서 이미 쓰고 있는 설정 그대로다
 */
function saveFileUrl(dataRoot, saveName) {
  const base = path.join(subPaths(dataRoot).saves, saveName);
  return `jdbc:h2:file:${base};MODE=PostgreSQL`;
}

/** 윈도우에서만 이름이 다르다. 10단계에서 번들 JRE를 넣으면 여기만 바뀐다 */
function javaBin() {
  return process.platform === "win32" ? "java.exe" : "java";
}

module.exports = {
  APP_DATA,
  migrateLegacyAppData,
  SETTINGS_FILE,
  CONNECTIONS_FILE,
  LOG_FILE,
  DEFAULT_DATA_ROOT,
  subPaths,
  ensureDataRoot,
  saveFileUrl,
  javaBin,
};
