/**
 * 스크린샷 경로 규칙 · 클립보드 · 내보내기 (P6 S2).
 *
 * 썸네일 만들기는 `thumbs.js`, 화면에 파일을 내주는 `starlog-media://`는 `mediaProtocol.js`가 한다 —
 * 셋 다 **이 파일의 경로 규칙**(`mediaFileInside`)을 지난다.
 *
 * ## 경로는 믿지 않는다
 *
 * 서버가 준 경로든 화면이 고른 항목이든 주소창의 조각이든, **실제 경로(심볼릭 링크를 푼 것)가 데이터 루트의
 * `media/<게임>/<파일>`** 한 칸 아래여야 한다. 썸네일 폴더 안·하위 폴더·다른 확장자는 거절한다.
 * 윈도우는 대소문자를 안 가린다 — `.THUMBS`도 썸네일 폴더다
 */
const { clipboard, ClipboardItem, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const THUMB_DIR = ".thumbs";
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);
/** 서버(`domains/backlog/media.ts`)와 같은 표 — 확장자로만 정한다 (내용 냄새 맡기 없음) */
const CONTENT_TYPE = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
};
const WIN = process.platform === "win32";

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  return IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
}

const contentTypeOf = (file) => CONTENT_TYPE[path.extname(file).toLowerCase()] ?? null;

/** 윈도우는 `.Thumbs`·`.THUMBS`도 같은 폴더다 */
const isThumbDirName = (name) => (WIN ? name.toLowerCase() : name) === THUMB_DIR;

/**
 * 실제 경로. 윈도우는 `.native`(GetFinalPathNameByHandle) — 8.3 짧은 이름·정션·대소문자를 한 모양으로 편다.
 * JS판은 짧은 이름을 안 펴서 같은 폴더가 "밖"으로 보일 수 있다 (거절 쪽으로 틀리지만 그래도)
 */
const realpath = (p) => (WIN ? fs.realpathSync.native(p) : fs.realpathSync(p));

/** `<root>` 아래 상대 조각들. 밖이면 null. 윈도우의 `path.relative`는 대소문자를 안 가린다 */
function partsInside(root, real) {
  const rel = path.relative(root, real);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep);
}

/**
 * `<mediaRoot>/<게임 폴더>/<파일>`인 실제 이미지·영상 파일이면 그 실제 경로, 아니면 null.
 * `realpath`로 심볼릭 링크를 풀고 본다 — 폴더 안에 바깥을 가리키는 링크를 넣어도 못 나간다
 */
function mediaFileInside(mediaRoot, candidate) {
  if (typeof candidate !== "string" || candidate === "" || candidate.includes("\0") || !mediaRoot) return null;
  let real, root;
  try {
    root = realpath(mediaRoot);
    real = realpath(path.resolve(candidate));
  } catch {
    return null;
  }
  const parts = partsInside(root, real);
  if (!parts || parts.length !== 2 || isThumbDirName(parts[0]) || parts[0].startsWith(".") || parts[1].startsWith(".")) return null;
  if (kindOf(real) === null) return null;
  try {
    if (!fs.statSync(real).isFile()) return null;
  } catch {
    return null;
  }
  return real;
}

/**
 * 주소의 조각 하나로 쓸 수 있는 이름. 구분자·NUL·제어문자·`:`(윈도우 대체 데이터 스트림 `a.jpg:x`)·
 * 끝의 점·공백(윈도우가 조용히 떼어 **다른 이름이 같은 파일**이 된다)·점으로 시작하는 이름은 안 된다
 */
function isPlainSegment(name) {
  return typeof name === "string" && name !== "" && name.length <= 255 && !name.startsWith(".")
    && !/[\\/\0:\x00-\x1f]/.test(name) && !/[. ]$/.test(name);
}

/** 이 게임 폴더의 썸네일 폴더 — 진짜 폴더면 경로, 링크·파일이면 null, 없으면 `missing` */
function thumbDirOf(folder) {
  const dir = path.join(folder, THUMB_DIR);
  try {
    const st = fs.lstatSync(dir);
    return st.isDirectory() ? { dir, exists: true } : null;
  } catch (e) {
    return e.code === "ENOENT" ? { dir, exists: false } : null;
  }
}

const thumbPathOf = (source) => path.join(path.dirname(source), THUMB_DIR, `${path.basename(source)}.jpg`);

// ───────────── 클립보드 · 내보내기 ─────────────

/** 한 번에 클립보드에 올릴 수 있는 개수. 화면이 한 번에 고를 수 있는 것보다 넉넉하되 끝은 있게 */
const MAX_COPY = 500;

/**
 * 클립보드로. 인자는 `mediaFileInside`를 통과한 실제 경로의 배열이다.
 *
 * - **하나**: 사진은 **그림 자체**(채팅·편집기에 붙는다), 그림으로 못 푸는 것(WebP·영상)은 **파일 참조**
 * - **둘 이상**: 전부 **파일 참조** — 클립보드는 그림을 한 장밖에 못 든다
 *
 * 파일 참조는 `text/uri-list` 하나로 쓴다 (일렉트론 44). 일렉트론이 이걸 OS의 "복사한 파일" 형식으로 바꿔 준다 —
 * 맥 `NSFilenamesPboardType`, 윈도우 `CF_HDROP`, 리눅스 `text/uri-list`. 예전엔 OS마다 형식을 손으로 골랐고
 * 윈도우 여럿(`CF_HDROP`)은 이름 없는 형식이라 PowerShell을 띄웠다. 맥은 확인했고 윈도우는 미확인
 *
 * `write`는 클립보드를 **통째로 바꾼다** — 앞에 있던 그림·글이 같이 붙지 않는다
 */
async function copyToClipboard(files) {
  if (files.length === 1 && kindOf(files[0]) === "image") {
    const image = nativeImage.createFromPath(files[0]);
    if (!image.isEmpty()) {
      await clipboard.write([new ClipboardItem({ "image/png": new Blob([image.toPNG()], { type: "image/png" }) })]);
      return { ok: true, as: "image", count: 1 };
    }
  }
  try {
    await clipboard.write([new ClipboardItem({ "text/uri-list": files.map((f) => pathToFileURL(f).href).join("\r\n") })]);
  } catch (e) {
    console.warn("클립보드 파일 참조 실패", e?.message ?? e);
    return { ok: false, reason: "UNSUPPORTED" };
  }
  return { ok: true, as: "file", count: files.length };
}

/** `001.png`가 있으면 `001 (1).png`, `001 (2).png` … */
function freeName(folder, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? name : `${base} (${n})${ext}`;
    if (!fs.existsSync(path.join(folder, candidate))) return candidate;
  }
}

/**
 * 고른 폴더로 복사. **덮어쓰지 않는다** — 이름이 겹치면 번호를 붙이고, 그 사이에 누가 같은 이름을 만들면
 * (`COPYFILE_EXCL`이 실패) 다음 번호로 다시 한다. 찍은 시각(수정시각)도 옮긴다
 */
function saveFiles(files, folder) {
  const saved = [], failed = [];
  for (const { file, label } of files) {
    try {
      let name = freeName(folder, path.basename(file));
      for (let attempt = 0; ; attempt++) {
        try {
          fs.copyFileSync(file, path.join(folder, name), fs.constants.COPYFILE_EXCL);
          break;
        } catch (e) {
          if (e.code !== "EEXIST" || attempt > 50) throw e;
          name = freeName(folder, path.basename(file));
        }
      }
      const st = fs.statSync(file);
      try { fs.utimesSync(path.join(folder, name), st.atime, st.mtime); } catch { /* 시각을 못 옮겨도 파일은 멀쩡하다 */ }
      saved.push({ ...label, savedAs: name });
    } catch (e) {
      failed.push({ ...label, reason: e.code ?? String(e.message ?? e) });
    }
  }
  return { saved, failed };
}

module.exports = {
  THUMB_DIR, MAX_COPY, kindOf, contentTypeOf, isThumbDirName, realpath, partsInside, mediaFileInside, isPlainSegment,
  thumbDirOf, thumbPathOf, copyToClipboard, saveFiles, freeName,
};
