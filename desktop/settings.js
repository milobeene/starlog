/**
 * 설정 파일 두 개를 읽고 쓴다 (architecture §5·§7).
 *
 * ## 왜 파일이 둘인가
 *
 *   settings.json     데이터 루트 · 창 크기 · 마지막 모드   → 남에게 보여도 된다
 *   connections.json  DB·스토리지 자격증명                 → **절대 안 된다**
 *
 * 한 파일이면 "이건 복사하지 마"가 규칙으로 성립하지 않는다 — 매번 안을 들여다보고
 * 골라내야 한다. **파일이 갈려 있어야 규칙이 선다.**
 *
 * ## 깨졌으면 그냥 새로 만든다 (결정 39)
 *
 * 없음·형식 불일치·손상을 전부 같게 다룬다. 사용자가 고칠 수 있는 물건이 아니고,
 * 복구를 시도하다 반쯤 살아난 설정으로 뜨는 게 더 나쁘다.
 * **잃는 건 설정 몇 줄이고 데이터는 데이터 루트에 그대로 있다.**
 */
const fs = require("fs");
const path = require("path");
const { SETTINGS_FILE, CONNECTIONS_FILE, DEFAULT_DATA_ROOT } = require("./paths");

const SETTINGS_DEFAULT = {
  version: 1,
  dataRoot: null,              // null = DEFAULT_DATA_ROOT
  window: { width: 1600, height: 1000, maximized: true },
  lastMode: null,              // "local" | "cloud"
};

const CONNECTIONS_DEFAULT = { version: 1, profiles: [] };

function readJson(file, fallback, mode) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    // 배열이나 문자열이 들어 있으면 형식 불일치다. 그것도 "깨짐"으로 친다
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("형식 불일치");
    }
    return { ...fallback, ...parsed };
  } catch {
    writeJson(file, fallback, mode);
    return { ...fallback };
  }
}

/**
 * @param mode 파일 권한. 자격증명 파일에는 `0o600`을 준다.
 *
 * ⚠️ **평문으로 두는 건 결정 13이지만, 그게 "아무나 읽어도 된다"는 뜻은 아니다.**
 * 기본값(0644)이면 **같은 컴퓨터의 다른 계정이 그냥 읽는다.** 암호화를 안 하기로 한
 * 이상 파일 권한이 남은 유일한 울타리다 — 한 줄이고 잃을 게 없다
 */
function writeJson(file, value, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  /*
   * 임시 파일에 쓰고 이름을 바꾼다. 그냥 덮어쓰면 쓰는 중에 앱이 죽었을 때
   * **반쯤 쓰인 JSON**이 남고, 다음 실행에 파싱이 깨져 설정이 통째로 초기화된다.
   * rename은 같은 볼륨 안에서 원자적이라 "옛것 아니면 새것"만 존재한다
   */
  const tmp = `${file}.tmp`;
  // 권한은 **만들 때** 준다. 쓰고 나서 바꾸면 그 사이에 열려 있는 순간이 생긴다
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode });
  fs.renameSync(tmp, file);
  // 이미 있던 파일을 물려받은 경우까지 맞춘다 — 첫 저장 전에 만들어진 것이 있다
  try { fs.chmodSync(file, mode); } catch { /* 윈도우는 의미가 없다. 무시한다 */ }
}

/** 자격증명 파일은 주인만 읽는다 */
const SECRET_MODE = 0o600;

/** 저장된 그대로. `dataRoot: null`은 "정한 적 없음"이라는 뜻이 살아 있다 */
function readSettings() {
  return readJson(SETTINGS_FILE, SETTINGS_DEFAULT);
}

/** 쓰는 쪽이 아니라 **읽는 쪽**에서 기본값을 채운다 */
function getSettings() {
  const s = readSettings();
  return { ...s, dataRoot: s.dataRoot || DEFAULT_DATA_ROOT };
}

/**
 * ⚠️ **`getSettings()`가 아니라 `readSettings()` 위에 얹는다.**
 *
 * 앞엣것으로 하면 `lastMode` 하나 바꿀 때마다 **기본 데이터 루트가 절대 경로로 굳어버린다.**
 * 그러면 "정한 적 없음"이 "이 경로로 정함"이 되고, 나중에 앱데이터 위치가 바뀌어도
 * 옛 경로를 계속 가리킨다. 실제로 첫 실행 한 번에 그렇게 됐다
 */
function patchSettings(patch) {
  const next = { ...readSettings(), ...patch };
  writeJson(SETTINGS_FILE, next);
  return { ...next, dataRoot: next.dataRoot || DEFAULT_DATA_ROOT };
}

function getConnections() {
  const c = readJson(CONNECTIONS_FILE, CONNECTIONS_DEFAULT, SECRET_MODE);
  return Array.isArray(c.profiles) ? c.profiles : [];
}

/**
 * 이름이 같으면 덮어쓰고 없으면 추가한다.
 *
 * 이름을 키로 쓰는 이유 — 사람이 "내 Neon", "실험용"처럼 부르는 게 목록의 전부고,
 * id를 따로 두면 화면이 그걸 들고 다녀야 한다. 하나뿐인 사용자가 이름을 겹치게
 * 지을 일이 없고, 겹치면 덮어쓰는 게 기대하는 동작이다
 */
function saveConnection(profile) {
  const profiles = getConnections();
  const at = profiles.findIndex((p) => p.name === profile.name);
  if (at >= 0) profiles[at] = profile;
  else profiles.push(profile);
  writeJson(CONNECTIONS_FILE, { version: 1, profiles }, SECRET_MODE);
  return profiles;
}

function removeConnection(name) {
  const profiles = getConnections().filter((p) => p.name !== name);
  writeJson(CONNECTIONS_FILE, { version: 1, profiles }, SECRET_MODE);
  return profiles;
}

module.exports = {
  getSettings,
  patchSettings,
  getConnections,
  saveConnection,
  removeConnection,
};
