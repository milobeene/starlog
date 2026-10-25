/**
 * 스크린샷 썸네일 · 클립보드 · 내보내기 (P6 S2).
 *
 * ## 썸네일 — 서버가 부탁하고 여기서 만든다
 *
 * 서버(utilityProcess)는 `nativeImage`를 못 쓴다. 그래서 `{type: "thumbnail", id, source}`를 보내오면
 * 여기서 만들어 `<게임 폴더>/.thumbs/<원본 이름>.jpg`에 쓰고 `{type: "thumbnail:result", id, ok}`로 답한다
 * (짝은 `server/src/common/storage/thumbs.ts`). **썸네일 수정시각에 원본 시각을 심는다** — 서버가 그걸로 신선도를 본다.
 *
 * 실측 (2026-10-24, 맥):
 * - `createThumbnailFromPath`(QuickLook)는 결과 크기가 들쭉날쭉하다 — 같은 요청에 480×270이 오기도 960×540이 오기도
 *   (화면 배율을 따라 2배 표현을 고른다). 그래서 **받은 뒤 우리가 다시 맞춘다**
 * - 못 읽는 파일엔 **OS의 파일 종류 아이콘**을 준다 (깨진 PNG, webm). 아이콘은 **모서리가 투명**하고
 *   영상 장면은 불투명하다 → 모서리 알파로 거른다
 * - PNG·JPEG은 `createFromPath`로 직접 풀고 줄인다 (4K PNG 28ms) — QuickLook보다 빠르고 크기가 정확하다.
 *   **WebP는 `nativeImage`가 못 푼다** → QuickLook으로
 *
 * ## 경로는 믿지 않는다
 *
 * 서버가 준 경로든 화면이 고른 항목이든, **실제 경로(심볼릭 링크를 푼 것)가 데이터 루트의 `media/<게임>/<파일>`**
 * 한 칸 아래여야 한다. 썸네일 폴더 안·하위 폴더·다른 확장자는 거절한다
 */
const { clipboard, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFile } = require("child_process");

const THUMB_DIR = ".thumbs";
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);
const DEFAULT_BOX = 480;
const JPEG_QUALITY = 82;

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  return IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
}

/**
 * `<mediaRoot>/<게임 폴더>/<파일>`인 실제 이미지·영상 파일이면 그 실제 경로, 아니면 null.
 * `realpath`로 심볼릭 링크를 풀고 본다 — 폴더 안에 바깥을 가리키는 링크를 넣어도 못 나간다
 */
function mediaFileInside(mediaRoot, candidate) {
  if (typeof candidate !== "string" || candidate === "" || candidate.includes("\0") || !mediaRoot) return null;
  let real, root;
  try {
    root = fs.realpathSync(mediaRoot);
    real = fs.realpathSync(path.resolve(candidate));
  } catch {
    return null;
  }
  const rel = path.relative(root, real);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.length !== 2 || parts[0] === THUMB_DIR || parts[1].startsWith(".")) return null;
  if (kindOf(real) === null) return null;
  try {
    if (!fs.statSync(real).isFile()) return null;
  } catch {
    return null;
  }
  return real;
}

// ───────────── 썸네일 ─────────────

/** 박스 안에 비율대로. 키우지는 않는다 */
function fit(image, box) {
  const { width, height } = image.getSize();
  if (!width || !height) return null;
  const scale = Math.min(1, box / Math.max(width, height));
  if (scale === 1) return image;
  return image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: "good" });
}

/** QuickLook·윈도우 셸. 아이콘(모서리 투명)이 오면 null */
async function viaOs(file, box) {
  if (typeof nativeImage.createThumbnailFromPath !== "function") return null;   // 리눅스엔 없다
  const os = await nativeImage.createThumbnailFromPath(file, { width: box, height: box });
  // 표현이 여럿(1x·2x)이라 그대로는 크기를 못 믿는다 — PNG로 한 번 굳혀서 한 장으로 만든다
  const flat = nativeImage.createFromBuffer(os.toPNG());
  const { width, height } = flat.getSize();
  if (!width || !height) return null;
  const bitmap = flat.toBitmap();
  const alpha = (x, y) => bitmap[(y * width + x) * 4 + 3];
  if (alpha(0, 0) === 0 && alpha(width - 1, 0) === 0 && alpha(0, height - 1) === 0 && alpha(width - 1, height - 1) === 0) {
    return null;   // 파일 종류 아이콘
  }
  return flat;
}

/** @returns 성공 여부. 실패 사유는 로그로만 — 서버는 "못 만듦"만 알면 된다 */
async function makeThumbnail(request, mediaRoot) {
  const source = mediaFileInside(mediaRoot, request?.source);
  if (!source) return false;
  const box = Number.isInteger(request?.max) && request.max >= 64 && request.max <= 1024 ? request.max : DEFAULT_BOX;
  const kind = kindOf(source);   // 서버가 준 kind는 안 쓴다 — 확장자로 다시 정한다

  let image = null;
  if (kind === "image") {
    const decoded = nativeImage.createFromPath(source);
    image = decoded.isEmpty() ? await viaOs(source, box) : decoded;   // WebP·깨진 파일은 OS에게
  } else {
    image = await viaOs(source, box);
  }
  const small = image && fit(image, box);
  if (!small) return false;

  const target = path.join(path.dirname(source), THUMB_DIR, `${path.basename(source)}.jpg`);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const st = fs.statSync(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.writeFileSync(tmp, small.toJPEG(JPEG_QUALITY));
    fs.utimesSync(tmp, st.atime, st.mtime);   // 신선도 표시 — 서버가 원본 시각과 맞춰 본다
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return true;
}

/**
 * 메인 쪽 줄. 서버가 이미 2개로 묶지만 시험용 서버(연결 테스트·세이브 붓기)도 같은 메인에 부탁한다 —
 * 합쳐서 메인 스레드를 오래 잡지 않게
 */
const MAX_PARALLEL = 2;
let active = 0;
const waiting = [];

function enqueue(job) {
  return new Promise((resolve) => {
    const run = () => {
      active++;
      job().then(resolve, (e) => { console.warn("썸네일 실패", e?.message ?? e); resolve(false); })
        .finally(() => { active--; waiting.shift()?.(); });
    };
    if (active < MAX_PARALLEL) run(); else waiting.push(run);
  });
}

/** 서버 메시지 하나 처리. `reply`는 서버로 보내는 함수 */
function handleServerMessage(message, mediaRoot, reply) {
  if (message?.type !== "thumbnail" || typeof message.id !== "string") return false;
  enqueue(() => makeThumbnail(message, mediaRoot)).then((ok) => {
    try { reply({ type: "thumbnail:result", id: message.id, ok }); } catch { /* 서버가 그새 내려갔다 */ }
  });
  return true;
}

// ───────────── 클립보드 · 내보내기 ─────────────

/** 한 번에 클립보드에 올릴 수 있는 개수. 화면이 한 번에 고를 수 있는 것보다 넉넉하되 끝은 있게 */
const MAX_COPY = 500;

const plistEscape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 맥이 파인더·메신저에 파일 여러 개로 내미는 옛 형식 — 경로 배열 plist */
function filenamesPlist(files) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n`
    + `<plist version="1.0">\n<array>\n${files.map((f) => `\t<string>${plistEscape(f)}</string>`).join("\n")}\n</array>\n</plist>\n`;
}

/**
 * 윈도우는 `CF_HDROP`(탐색기가 붙이는 형식)이어야 하는데, 그건 **이름 없는 정수 형식(15)** 이라
 * `clipboard.writeBuffer`(이름으로 형식을 등록한다)로는 못 쓴다. PowerShell `Set-Clipboard -LiteralPath`가
 * 정확히 그걸 쓴다. 경로는 명령줄에 끼우지 않고 **환경변수(JSON)** 로 건넨다 — 인용·한글 문제가 없다
 */
function setClipboardFilesWindows(files) {
  return new Promise((resolve) => {
    const script = "Set-Clipboard -LiteralPath ([string[]](ConvertFrom-Json $env:STARLOG_CLIP_FILES))";
    // PATH에서 찾지 않는다 — 앞선 폴더에 놓인 다른 powershell.exe가 잡히지 않게 시스템 경로로
    const exe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    execFile(exe, ["-NoProfile", "-NonInteractive", "-Sta", "-Command", script],
      { env: { ...process.env, STARLOG_CLIP_FILES: JSON.stringify(files) }, timeout: 15000, windowsHide: true },
      (error) => resolve(!error));
  });
}

/**
 * 클립보드로. 인자는 `mediaFileInside`를 통과한 실제 경로의 배열이다.
 *
 * - **하나**: 사진은 **그림 자체**(채팅·편집기에 붙는다), 그림으로 못 푸는 것(WebP·영상)은 **파일 참조**
 * - **둘 이상**: 전부 **파일 참조** — 클립보드는 그림을 한 장밖에 못 든다
 *
 * 파일 참조는 OS마다 다르다 — 맥 `public.file-url`(하나)·`NSFilenamesPboardType`(여럿), 윈도우 `FileNameW`(하나)·
 * `CF_HDROP`(여럿). 맥은 확인했고 윈도우는 미확인. 그 밖의 OS는 못 한다고 답한다
 *
 * ⚠️ 맥에서 `NSFilenamesPboardType`만 쓴다. `public.file-url`을 같이 쓰면 OS가 첫 파일 하나짜리로 합쳐 버린다
 * (실측: 단독이면 항목 3개, 같이 쓰면 1개)
 */
async function copyToClipboard(files) {
  if (files.length === 1) {
    const file = files[0];
    if (kindOf(file) === "image") {
      const image = nativeImage.createFromPath(file);
      if (!image.isEmpty()) {
        clipboard.writeImage(image);
        return { ok: true, as: "image", count: 1 };
      }
    }
    if (process.platform === "darwin") {
      clipboard.writeBuffer("public.file-url", Buffer.from(pathToFileURL(file).href, "utf8"));
      return { ok: true, as: "file", count: 1 };
    }
    if (process.platform === "win32") {
      clipboard.writeBuffer("FileNameW", Buffer.from(`${file}\0`, "ucs2"));
      return { ok: true, as: "file", count: 1 };
    }
    return { ok: false, reason: "UNSUPPORTED" };
  }
  if (process.platform === "darwin") {
    clipboard.clear();   // 앞에 있던 그림·글이 같이 붙지 않게
    clipboard.writeBuffer("NSFilenamesPboardType", Buffer.from(filenamesPlist(files), "utf8"));
    return { ok: true, as: "file", count: files.length };
  }
  if (process.platform === "win32") {
    return (await setClipboardFilesWindows(files))
      ? { ok: true, as: "file", count: files.length }
      : { ok: false, reason: "UNSUPPORTED" };
  }
  return { ok: false, reason: "UNSUPPORTED" };
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

module.exports = { THUMB_DIR, MAX_COPY, kindOf, mediaFileInside, makeThumbnail, handleServerMessage, copyToClipboard, saveFiles, freeName };
