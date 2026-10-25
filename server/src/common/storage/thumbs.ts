/**
 * 스크린샷 썸네일 — `<게임 폴더>/.thumbs/<원본 이름>.jpg`.
 *
 * **만드는 건 일렉트론 메인 프로세스다** (`nativeImage.createThumbnailFromPath`가 메인 전용).
 * 서버(utilityProcess)는 `parentPort`로 부탁하고 답을 기다린다 — 짝은 `desktop/thumbnails.js`.
 * 일렉트론 없이 도는 개발 서버·녹화본 장치는 만들 수 없다 → 목록의 `thumbUrl`이 null이고 화면이 원본을 쓴다.
 *
 * 신선한지는 **썸네일 수정시각 = 원본 수정시각**으로 본다. 만드는 쪽이 원본 시각을 심는다.
 * 파일명이 다시 쓰이거나(지운 끝번호에 새로 올림) 사람이 탐색기로 갈아끼워도 어긋나면 다시 만든다
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../../config";

export const THUMB_DIR = ".thumbs";
/** 긴 변 기준. 그리드 칸(~240px)의 2배 밀도 */
export const THUMB_MAX = 480;

const TIMEOUT_MS = 20_000;
/** 한 번에 메인에 맡기는 수. 그리드가 수백 장을 한꺼번에 불러도 QuickLook을 줄 세운다 */
const CONCURRENCY = 2;

export function thumbPathOf(folder: string, fileName: string): string {
  return path.join(folder, THUMB_DIR, `${fileName}.jpg`);
}

/** 클라이언트가 준 이름이 썸네일 폴더를 가리키나 — 스크린샷처럼 읽히거나 지워지면 안 된다 */
export function pointsIntoThumbs(fileName: string): boolean {
  const first = path.normalize(fileName).split(/[\\/]/).find((s) => s !== "" && s !== ".");
  return first === THUMB_DIR;
}

/** 원본 수정시각(ms, 정수). 썸네일 쪽에 심고 비교하는 값 */
export const mtimeMsOf = (st: fs.BigIntStats) => st.mtimeNs / 1_000_000n;

/** `.thumbs`가 진짜 폴더인가 — 링크면 캐시 쓰기·지우기가 폴더 밖으로 샌다 (사람이 탐색기로 만지는 곳) */
function thumbDirOk(dir: string): boolean {
  try { return fs.lstatSync(dir).isDirectory(); } catch { return false; }
}

export function isFresh(thumb: string, sourceMtimeMs: bigint): boolean {
  try {
    if (!thumbDirOk(path.dirname(thumb))) return false;
    const st = fs.lstatSync(thumb, { bigint: true });   // 링크는 따라가지 않는다 — 서빙 경로로 쓰이므로
    // 1ms까지 봐준다 — 시각을 초 단위 부동소수로 심는 길(`utimes`)에서 끝자리가 하나 밀릴 수 있다
    const diff = mtimeMsOf(st) - sourceMtimeMs;
    return st.isFile() && st.size > 0n && diff >= -1n && diff <= 1n;
  } catch {
    return false;
  }
}

/**
 * 실패해도 던지지 않는다 — 썸네일은 캐시다.
 * ⚠️ 이름이 클라이언트에서 온다(삭제 목록) — 조각이 하나가 아니면 손대지 않는다.
 * `../../covers/x.png`를 이어 붙이면 `.thumbs/../..`가 풀려 폴더 밖 파일을 가리킨다
 */
export function dropThumb(folder: string, fileName: string): void {
  if (/[\\/]/.test(fileName) || fileName === "." || fileName === "..") return;
  if (!thumbDirOk(path.join(folder, THUMB_DIR))) return;
  try { fs.rmSync(thumbPathOf(folder, fileName), { force: true }); } catch { /* 캐시라 남아도 다음에 다시 만든다 */ }
}

/** 원본이 사라진 썸네일 (탐색기로 지운 것). 목록을 읽는 김에 치운다 */
export function pruneOrphans(folder: string, names: Set<string>): void {
  const dir = path.join(folder, THUMB_DIR);
  if (!thumbDirOk(dir)) return;
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const n of entries) {
    if (!n.endsWith(".jpg")) continue;
    if (!names.has(n.slice(0, -4))) { try { fs.rmSync(path.join(dir, n), { force: true }); } catch { /* 다음 기회에 */ } }
  }
}

// ───────────── 만드는 쪽 ─────────────

type ParentPort = { on(ev: "message", fn: (e: { data: unknown }) => void): void; postMessage(m: unknown): void };
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;

/** true 만듦 · false 못 만듦(깨진 파일 등) · null 답이 없었음(시간 초과 — 실패로 기억하지 않는다) */
type Maker = (source: string, kind: "image" | "video") => Promise<boolean | null>;

const pending = new Map<string, (ok: boolean | null) => void>();
parentPort?.on("message", (e) => {
  const m = e.data as { type?: string; id?: string; ok?: boolean };
  if (m?.type !== "thumbnail:result" || typeof m.id !== "string") return;
  pending.get(m.id)?.(m.ok === true);
  pending.delete(m.id);
});

/** 일렉트론 메인에 부탁한다. 메인이 경로를 다시 검증하고, 원본 시각을 심어 `.thumbs/`에 쓴다 */
const viaParent: Maker = (source, kind) => new Promise((resolve) => {
  const id = crypto.randomUUID();
  const timer = setTimeout(() => { pending.delete(id); resolve(null); }, TIMEOUT_MS);
  pending.set(id, (ok) => { clearTimeout(timer); resolve(ok); });
  parentPort!.postMessage({ type: "thumbnail", id, source, kind, max: THUMB_MAX });
});

/**
 * 녹화본 장치용 — 원본을 그대로 복사한다 (줄이지 않는다). 영상은 못 만든다.
 * dev·test 프로필에서 `STARLOG_THUMBNAILER=copy`일 때만. 흐름(지연 생성·삭제·목록)을 일렉트론 없이 시험하려고 둔다
 */
const viaCopy: Maker = async (source, kind) => {
  if (kind !== "image") return false;
  const target = thumbPathOf(path.dirname(source), path.basename(source));
  const st = fs.statSync(source);
  // 이미 있는 `.thumbs`가 링크면 쓰지 않는다 (없으면 만든다)
  if (fs.lstatSync(path.dirname(target), { throwIfNoEntry: false }) && !thumbDirOk(path.dirname(target))) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target + ".tmp");
  fs.utimesSync(target + ".tmp", st.atime, st.mtime);
  fs.renameSync(target + ".tmp", target);
  return true;
};

function maker(): Maker | null {
  if (config().devProfile && process.env.STARLOG_THUMBNAILER === "copy") return viaCopy;
  return parentPort ? viaParent : null;
}

/** 지금 썸네일을 만들 수 있나. 못 만들면 목록이 이미 있는 썸네일만 알린다 */
export const canMakeThumbs = () => maker() !== null;

/**
 * 못 만든 원본 (깨진 파일, QuickLook이 모르는 webm). 같은 판(시각·크기)이면 다시 묻지 않는다 —
 * 그리드를 열 때마다 메인을 두드리지 않게. 원본이 바뀌면 열쇠가 바뀐다
 */
const failed = new Set<string>();
const failKey = (source: string, mtimeMs: bigint, size: bigint) => `${source}\0${mtimeMs}\0${size}`;

export function knownFailure(source: string, mtimeMs: bigint, size: bigint): boolean {
  return failed.has(failKey(source, mtimeMs, size));
}

const inflight = new Map<string, Promise<boolean | null>>();
const queue: (() => void)[] = [];
let running = 0;

function slot<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      job().then(resolve, reject).finally(() => { running--; queue.shift()?.(); });
    };
    if (running < CONCURRENCY) run(); else queue.push(run);
  });
}

/**
 * 썸네일을 보장한다. 신선한 게 있으면 바로, 없으면 줄 서서 만든다.
 * 같은 원본을 동시에 여러 번 부르면 한 번만 만든다 (그리드 + 업로드 직후 생성이 겹칠 때)
 * @returns 썸네일 경로. 못 만들면 null
 */
export async function ensureThumb(source: string, kind: "image" | "video"): Promise<string | null> {
  const thumb = thumbPathOf(path.dirname(source), path.basename(source));
  let st: fs.BigIntStats;
  try { st = fs.statSync(source, { bigint: true }); } catch { return null; }
  const mtimeMs = mtimeMsOf(st);
  if (isFresh(thumb, mtimeMs)) return thumb;
  const make = maker();
  if (make === null || knownFailure(source, mtimeMs, st.size)) return null;

  let job = inflight.get(source);
  if (!job) {
    job = slot(() => make(source, kind).catch((e) => { console.warn(`썸네일 실패 — ${source}`, e); return false; }))
      .finally(() => inflight.delete(source));
    inflight.set(source, job);
  }
  const ok = await job;
  if (ok && isFresh(thumb, mtimeMs)) return thumb;
  if (ok === null) return null;
  if (failed.size > 10_000) failed.clear();
  failed.add(failKey(source, mtimeMs, st.size));
  return null;
}

/** 올린 직후 — 응답을 기다리게 하지 않는다 */
export function warmThumb(source: string, kind: "image" | "video"): void {
  if (!canMakeThumbs()) return;
  void ensureThumb(source, kind);
}
