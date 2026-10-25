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
 * ## 깨진 파일은 옆으로 비켜두고 새로 만든다 (2026-10-25, 결정 39를 고침)
 *
 * 예전엔 **어떤 읽기 오류든** 기본값으로 덮어썼다 — 권한 오류 한 번에 자격증명이 통째로 지워졌다.
 * 이제 없을 때(ENOENT)만 새로 만들고, 못 읽는 JSON은 `.corrupt-<시각>`으로 옮겨 둔 뒤 새로 만든다.
 * 그 밖의 오류는 던진다 — 고칠 수 있는 문제일 수 있는데 지우고 나면 되돌릴 길이 없다.
 *
 * ## 자격증명은 OS 키체인으로 잠근다 (2026-10-25)
 *
 * `connections.json`의 비밀 칸은 `safeStorage`(맥 키체인 · 윈도우 DPAPI)로 묶어 `sealed`에 둔다.
 * 파일만 들고 가서는 못 연다. 평문으로 남아 있던 옛 파일은 처음 읽을 때 조용히 바꿔 쓴다.
 * 화면(렌더러)에는 **가린 값만** 간다 — 진짜 값은 눈 버튼을 누를 때 하나씩(`revealSecret`).
 */
const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");
const { SETTINGS_FILE, CONNECTIONS_FILE, DEFAULT_DATA_ROOT } = require("./paths");

const SETTINGS_DEFAULT = {
  version: 1,
  dataRoot: null,              // null = DEFAULT_DATA_ROOT
  window: { width: 1600, height: 1000, maximized: true },
  lastMode: null,              // "local" | "cloud"
};

const CONNECTIONS_DEFAULT = { version: 2, profiles: [] };

/** 못 읽는 파일을 지우지 않고 옆으로 비켜둔다 — 사람이 열어 살릴 수 있어야 한다 */
function quarantine(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const aside = `${file}.corrupt-${stamp}`;
  fs.renameSync(file, aside);
  console.error(`[settings] 읽을 수 없는 파일을 옮겨 뒀습니다: ${aside}`);
  return aside;
}

function readJson(file, fallback, mode) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") {
      writeJson(file, fallback, mode);
      return { ...fallback };
    }
    throw e;
  }
  /*
   * ⚠️ **읽을 때도 권한을 맞춘다.** 쓸 때만 맞추면 **이미 0644로 만들어져 있던 파일은
   * 다음 저장 전까지 그대로 열려 있다** — 자격증명 파일에는 그 유예가 없어야 한다
   */
  if (mode !== undefined) {
    try { fs.chmodSync(file, mode); } catch { /* 윈도우는 의미가 없다 */ }
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  // 배열이나 문자열이 들어 있으면 형식 불일치다. 그것도 "깨짐"으로 친다
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    quarantine(file);
    writeJson(file, fallback, mode);
    return { ...fallback };
  }
  return { ...fallback, ...parsed };
}

/**
 * @param mode 파일 권한. 자격증명 파일에는 `0o600`을 준다.
 *
 * 비밀 칸은 키체인으로 잠그지만 권한도 그대로 0600 — 키체인을 못 쓰는 환경(리눅스 basic)에서는
 * 이게 남은 울타리이고, 이름·주소 같은 나머지 칸도 남이 볼 이유가 없다
 */
function writeJson(file, value, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  /*
   * 임시 파일에 쓰고 이름을 바꾼다. 그냥 덮어쓰면 쓰는 중에 앱이 죽었을 때
   * **반쯤 쓰인 JSON**이 남는다. rename은 같은 볼륨 안에서 원자적이라 "옛것 아니면 새것"만 존재한다.
   * ⚠️ rename 전에 fsync — 안 하면 정전 뒤 rename만 디스크에 남고 내용은 빈 파일일 수 있다
   */
  const tmp = `${file}.tmp`;
  // 권한은 **만들 때** 준다. 쓰고 나서 바꾸면 그 사이에 열려 있는 순간이 생긴다
  const fd = fs.openSync(tmp, "w", mode);
  try {
    fs.writeSync(fd, JSON.stringify(value, null, 2), null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
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

/**
 * 쓰는 쪽이 아니라 **읽는 쪽**에서 기본값을 채운다.
 *
 * ⚠️ `window`를 따로 합치는 이유 — 위의 병합은 **한 겹뿐이다.** 파일에 `"window": null`
 * 이나 `{"width": 900}`만 들어 있으면 기본값 객체가 통째로 밀려나고, `createWindow`가
 * `saved.width`를 읽다가 죽는다. **창이 안 뜨는데 오류도 안 보이는** 상태가 된다.
 * 사람이 파일을 열어볼 수 있는 이상(그러라고 폴더 열기를 준다) 일어날 수 있는 일이다
 */
function getSettings() {
  const s = readSettings();
  return {
    ...s,
    dataRoot: s.dataRoot || DEFAULT_DATA_ROOT,
    window: { ...SETTINGS_DEFAULT.window, ...(s.window ?? {}) },
  };
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

// ───────────── 연결 설정 (자격증명) ─────────────

/** 비밀 칸. 화면에는 가려서, 디스크에는 잠가서 둔다 */
const SECRET_FIELDS = ["db.password", "storage.accessKey", "storage.secretKey", "igdb.clientSecret", "translate.apiKey"];
/** 화면이 보낼 수 있는 칸 전부 — 그 밖의 키는 버린다 (렌더러를 믿지 않는다) */
const PROFILE_SHAPE = {
  db: ["url", "user", "password", "schema"],
  storage: ["endpoint", "bucket", "accessKey", "secretKey", "publicBaseUrl"],
  igdb: ["clientId", "clientSecret"],
  translate: ["apiKey"],
};

function getField(profile, field) {
  const [group, key] = field.split(".");
  const v = profile?.[group]?.[key];
  return typeof v === "string" ? v : "";
}

function setField(profile, field, value) {
  const [group, key] = field.split(".");
  profile[group] = { ...(profile[group] ?? {}), [key]: value };
}

/**
 * 가린 값. 끝 네 글자만 남긴다 — 어느 키인지 알아볼 만큼만.
 * 짧은 값은 네 글자가 곧 대부분이라 하나도 안 남긴다
 */
function maskOf(value) {
  if (!value) return "";
  return value.length >= 12 ? `••••${value.slice(-4)}` : "••••••••";
}

/** 화면이 보낸 것을 알려진 모양으로만 다시 짓는다 */
function cleanProfile(input) {
  if (!input || typeof input !== "object") throw new Error("잘못된 연결 설정입니다");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) throw new Error("연결 이름을 확인해 주세요");
  const out = { name };
  for (const [group, keys] of Object.entries(PROFILE_SHAPE)) {
    const src = input[group];
    if (!src || typeof src !== "object") continue;
    out[group] = {};
    for (const key of keys) {
      const v = src[key];
      if (typeof v === "string" && v.length <= 4096) out[group][key] = v;
    }
  }
  const t = input.mediaTargets;
  out.mediaTargets = { covers: Boolean(t?.covers), screenshots: Boolean(t?.screenshots) };
  return out;
}

let encryptionAvailable = null;
async function canEncrypt() {
  if (encryptionAvailable === null) {
    try {
      encryptionAvailable = await safeStorage.isAsyncEncryptionAvailable();
    } catch {
      encryptionAvailable = false;
    }
    if (!encryptionAvailable) {
      console.error("[settings] OS 키체인을 쓸 수 없어 자격증명을 파일 권한(0600)으로만 지킵니다");
    }
  }
  return encryptionAvailable;
}

/**
 * 디스크 → 메모리. 프로필마다 따로 푼다 — 하나가 안 풀려도(키체인 항목이 사라졌다 등)
 * 나머지는 쓸 수 있어야 하고, **안 풀린 것도 지우지 않는다**(`locked` + 원래 봉투 보존)
 */
async function decodeProfile(stored) {
  const profile = { ...stored };
  delete profile.sealed;
  let migrate = false;
  if (typeof stored.sealed === "string") {
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(stored.sealed, "base64"));
      const secrets = JSON.parse(result);
      for (const field of SECRET_FIELDS) {
        if (typeof secrets[field] === "string") setField(profile, field, secrets[field]);
      }
      migrate = Boolean(shouldReEncrypt);
    } catch (e) {
      console.error(`[settings] 연결 "${stored.name}"의 자격증명을 풀지 못했습니다 — 다시 입력해야 합니다`, e?.message ?? e);
      for (const field of SECRET_FIELDS) setField(profile, field, "");
      Object.defineProperty(profile, "sealedKeep", { value: stored.sealed, enumerable: false });
      profile.locked = true;
    }
  } else if (SECRET_FIELDS.some((f) => getField(stored, f))) {
    // 옛 평문 파일 — 잠글 수 있으면 지금 바꿔 쓴다
    migrate = true;
  }
  return { profile, migrate };
}

async function encodeProfile(profile, encrypt) {
  const out = JSON.parse(JSON.stringify(profile));
  delete out.locked;
  const secrets = {};
  for (const field of SECRET_FIELDS) {
    const v = getField(profile, field);
    if (v) secrets[field] = v;
    const [group, key] = field.split(".");
    if (out[group]) delete out[group][key];
  }
  if (profile.locked && profile.sealedKeep && Object.keys(secrets).length === 0) {
    out.sealed = profile.sealedKeep;
    return out;
  }
  if (Object.keys(secrets).length === 0) return out;
  if (encrypt) {
    out.sealed = (await safeStorage.encryptStringAsync(JSON.stringify(secrets))).toString("base64");
  } else {
    for (const [field, v] of Object.entries(secrets)) setField(out, field, v);
  }
  return out;
}

/**
 * 읽고-고치고-쓰기를 한 줄로 세운다. 키체인 호출이 비동기라 두 저장이 엇갈리면
 * 늦게 끝난 쪽이 먼저 것을 지운다
 */
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function readProfiles() {
  const c = readJson(CONNECTIONS_FILE, CONNECTIONS_DEFAULT, SECRET_MODE);
  const raw = Array.isArray(c.profiles) ? c.profiles.filter((p) => p && typeof p === "object") : [];
  const decoded = await Promise.all(raw.map(decodeProfile));
  const profiles = decoded.map((d) => d.profile);
  if (decoded.some((d) => d.migrate) && (await canEncrypt())) {
    await writeProfiles(profiles);
  }
  return profiles;
}

async function writeProfiles(profiles) {
  const encrypt = await canEncrypt();
  const encoded = [];
  for (const p of profiles) encoded.push(await encodeProfile(p, encrypt));
  writeJson(CONNECTIONS_FILE, { version: 2, profiles: encoded }, SECRET_MODE);
}

/** 메인 안에서만 쓴다 — 진짜 값이 들어 있다. 화면에는 `listMasked`를 준다 */
function getConnections() {
  return serial(readProfiles);
}

function maskProfile(profile) {
  const out = JSON.parse(JSON.stringify(profile));
  out.hasSecret = {};
  for (const field of SECRET_FIELDS) {
    const v = getField(profile, field);
    out.hasSecret[field] = Boolean(v);
    if (v) setField(out, field, maskOf(v));
  }
  out.locked = Boolean(profile.locked);
  return out;
}

async function listMasked() {
  return (await getConnections()).map(maskProfile);
}

/**
 * 화면이 보낸 프로필의 가린 값을 저장된 진짜 값으로 되돌린다.
 * 가린 값과 **똑같으면** 안 고친 것이다 — 가린 모양(••••)은 사람이 칠 일이 없다
 */
function unmask(incoming, stored) {
  const out = JSON.parse(JSON.stringify(incoming));
  for (const field of SECRET_FIELDS) {
    const real = stored ? getField(stored, field) : "";
    if (real && getField(incoming, field) === maskOf(real)) setField(out, field, real);
  }
  return out;
}

/** `previousName` — 이름을 고치는 중이면 저장된 쪽은 옛 이름이다 */
function findStored(profiles, name, previousName) {
  return profiles.find((p) => p.name === name) ?? profiles.find((p) => p.name === previousName) ?? null;
}

/** 연결 테스트·기동에 쓸 진짜 값. 화면이 안 고친 칸은 저장된 값으로 */
async function resolveProfile(input, previousName) {
  const clean = cleanProfile(input);
  const stored = findStored(await getConnections(), clean.name, previousName);
  return unmask(clean, stored);
}

/**
 * 이름이 같으면 덮어쓰고 없으면 추가한다.
 *
 * 이름을 키로 쓰는 이유 — 사람이 "내 Neon", "실험용"처럼 부르는 게 목록의 전부고,
 * id를 따로 두면 화면이 그걸 들고 다녀야 한다. 겹치면 덮어쓰는 게 기대하는 동작이다
 */
function saveConnection(input, previousName) {
  return serial(async () => {
    const profiles = await readProfiles();
    const clean = cleanProfile(input);
    const stored = findStored(profiles, clean.name, previousName);
    const next = unmask(clean, stored);
    // 안 풀렸던 프로필에서 비밀 칸을 그대로 두고 저장하면 봉투를 지키고 잠금도 유지한다
    if (stored?.locked && SECRET_FIELDS.every((f) => !getField(next, f))) {
      next.locked = true;
      Object.defineProperty(next, "sealedKeep", { value: stored.sealedKeep, enumerable: false });
    }
    const at = profiles.findIndex((p) => p.name === next.name);
    if (at >= 0) profiles[at] = next;
    else profiles.push(next);
    await writeProfiles(profiles);
    return profiles.map(maskProfile);
  });
}

function removeConnection(name) {
  return serial(async () => {
    const profiles = (await readProfiles()).filter((p) => p.name !== name);
    await writeProfiles(profiles);
    return profiles.map(maskProfile);
  });
}

/** 눈 버튼. 칸 하나씩만 내준다 */
async function revealSecret(name, field) {
  if (!SECRET_FIELDS.includes(field)) throw new Error("알 수 없는 칸입니다");
  const found = (await getConnections()).find((p) => p.name === name);
  if (!found) throw new Error("연결 설정을 찾을 수 없습니다");
  return getField(found, field);
}

module.exports = {
  getSettings,
  patchSettings,
  getConnections,
  listMasked,
  resolveProfile,
  saveConnection,
  removeConnection,
  revealSecret,
  SECRET_FIELDS,
};
