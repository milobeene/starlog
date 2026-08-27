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

const APP_DATA = app.getPath("userData");

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
  SETTINGS_FILE,
  CONNECTIONS_FILE,
  LOG_FILE,
  DEFAULT_DATA_ROOT,
  subPaths,
  ensureDataRoot,
  saveFileUrl,
  javaBin,
};
