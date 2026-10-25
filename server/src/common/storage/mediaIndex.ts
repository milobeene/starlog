/**
 * 게임 폴더 색인 `<게임>/.thumbs/index.json` — **읽기만 한다.** 쓰는 건 일렉트론 메인이다 (`desktop/mediaIndex.js`, 모양도 거기).
 *
 * 메인이 썸네일을 만들며 자리표시(LQIP)·원본 크기·"못 만듦"을 적어 두고, 폴더를 훑을 때 **도장**(폴더 mtime + 항목 수)을 찍는다.
 * 도장이 지금 폴더와 같으면 목록이 파일마다 stat하지 않는다. 다르면 예전처럼 stat하되, 판(mtime·크기)이 같은 항목의 값은 쓴다.
 * 캐시라 없거나 깨졌으면 없는 것으로 친다. 일렉트론 없이 도는 서버(개발·녹화본)에는 아예 없다
 */
import fs from "fs";
import path from "path";
import { THUMB_DIR } from "./thumbs";

export interface IndexEntry {
  /** 원본 mtimeNs (문자열) */
  m: string;
  s: number;
  w: number | null;
  h: number | null;
  /** `"<w>x<h>:<RGB base64>"` — 화면이 흐린 자리표시로 키운다 */
  p: string | null;
  /** 1 썸네일 있음 · 0 이 판은 못 만듦 · 없음 = 모름 */
  t?: 0 | 1;
}

export interface FolderIndex {
  files: Record<string, IndexEntry>;
  /** 도장이 지금 폴더와 맞나 — 맞으면 `files`가 폴더의 미디어 전부다 */
  trusted: boolean;
}

const PLACEHOLDER = /^[1-9][0-9]?x[1-9][0-9]?:[A-Za-z0-9+/=]{4,400}$/;

function cleanEntry(e: unknown): IndexEntry | null {
  if (!e || typeof e !== "object") return null;
  const x = e as Record<string, unknown>;
  if (typeof x.m !== "string" || !/^[0-9]{1,24}$/.test(x.m) || !Number.isSafeInteger(x.s)) return null;
  const dim = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) <= 65535 ? (v as number) : null);
  // 자리표시는 화면이 data: 주소로 바꾼다 — 모양이 틀린 글자는 안 내보낸다
  const p = typeof x.p === "string" && PLACEHOLDER.test(x.p) ? x.p : null;
  return { m: x.m, s: x.s as number, w: dim(x.w), h: dim(x.h), p, ...(x.t === 0 || x.t === 1 ? { t: x.t } : {}) };
}

/**
 * @param names `readdir`를 그대로 (거르기 전) — 도장의 항목 수와 맞춰 본다
 */
export function readFolderIndex(folder: string, names: string[]): FolderIndex | null {
  const dir = path.join(folder, THUMB_DIR);
  let raw: unknown;
  try {
    if (!fs.lstatSync(dir).isDirectory()) return null;   // 링크면 안 읽는다
    raw = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  } catch {
    return null;
  }
  const data = raw as { v?: unknown; dir?: { m?: unknown; n?: unknown } | null; files?: unknown };
  if (data?.v !== 1 || !data.files || typeof data.files !== "object" || Array.isArray(data.files)) return null;
  const files: Record<string, IndexEntry> = {};
  for (const [name, e] of Object.entries(data.files as Record<string, unknown>)) {
    const clean = cleanEntry(e);
    if (clean) files[name] = clean;
  }
  let trusted = false;
  if (data.dir && typeof data.dir.m === "string" && data.dir.n === names.length) {
    try { trusted = fs.lstatSync(folder, { bigint: true }).mtimeNs.toString() === data.dir.m; } catch { trusted = false; }
  }
  return { files, trusted };
}

/** 판이 같은 항목만 — 다르면 메인이 아직 못 본 새 파일이다 */
export function entryFor(index: FolderIndex | null, name: string, st: fs.BigIntStats): IndexEntry | null {
  const e = index?.files[name];
  return e && e.m === st.mtimeNs.toString() && e.s === Number(st.size) ? e : null;
}
