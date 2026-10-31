/**
 * 스크린샷 받기 묶음 — 일렉트론 메인이 `<게임>/.incoming/<batchId>/`에 복사·검증을 마친 파일들을 **번호를 붙여 제자리로**.
 *
 * 번호는 서버가 정한다 (`nextName` — 가장 큰 번호 다음). 메인이 정하면 사람이 탐색기로 넣는 파일과 이름이 겹친다.
 * 같은 볼륨 안의 rename이라 파일마다 원자적이다. 하나라도 실패하면 **이미 옮긴 것을 되돌린다** — 반쪽 묶음을 남기지 않는다
 * (메인은 500을 받으면 묶음 폴더를 통째로 치운다)
 */
import fs from "fs";
import path from "path";
import { FileIo, InvalidInput } from "../../common/errors";
import { isRealDirectory } from "../../common/storage";
import { dropThumb } from "../../common/storage/thumbs";

export const INCOMING_DIR = ".incoming";

/** `crypto.randomUUID()`의 소문자 모양만 — 경로 조각으로 쓰므로 엄격하게 */
const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isBatchId = (s: unknown): s is string => typeof s === "string" && BATCH_ID.test(s);

/** 매직 넘버 판정에 필요한 앞 바이트 (media.ts의 MAGIC_LENGTH와 같다 — 순환 import를 피해 따로 둔다) */
const MAGIC_LENGTH = 12;

export const STALE_MS = 60 * 60 * 1000;

export interface CommitDeps {
  /** 테스트가 중간 실패를 흉내 낼 수 있게 갈아끼운다 */
  rename: (from: string, to: string) => void;
  nextName: (folder: string, extension: string) => string;
  /** 확장자·첫 바이트가 미디어로 맞나. 맞으면 null, 아니면 사유 */
  check: (name: string, head: Uint8Array) => string | null;
}

function readHead(file: string): Uint8Array {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(MAGIC_LENGTH);
    const n = fs.readSync(fd, buf, 0, MAGIC_LENGTH, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 덮어쓰지 않는 이동 — rename은 대상이 있으면 조용히 덮는다. Neon에선 트랜잭션이 겹쳐
 * (붙여넣기·탐색기 드롭) 같은 번호를 잡을 수 있어서, link는 EEXIST로 막고 그다음에 원본을 푼다
 */
export function moveNoClobber(from: string, to: string): void {
  fs.linkSync(from, to);
  try { fs.unlinkSync(from); } catch (e) { try { fs.unlinkSync(to); } catch { /* 그대로 둔다 */ } throw e; }
}

const isExists = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "EEXIST";

export interface Committed {
  names: string[];
  /** 옮긴 것을 전부 `.incoming`으로 되돌린다 — 이후 단계(목록 만들기·트랜잭션 커밋)가 실패했을 때 */
  undo: () => void;
  /** 다 끝났다 — 묶음 폴더를 치운다 */
  finish: () => void;
}

/** 제자리에 놓은 파일 이름들 (붙은 순서). 뒤 단계가 실패하면 호출자가 `undo()` — 반쪽이 갤러리에 남으면 메인의 재시도가 중복을 만든다 */
export function commitIncoming(folder: string, batchId: string, deps: CommitDeps): Committed {
  if (!isBatchId(batchId)) throw new InvalidInput("묶음 번호가 올바르지 않습니다");
  const root = path.join(folder, INCOMING_DIR);
  const dir = path.join(root, batchId);
  if (!isRealDirectory(root) || !isRealDirectory(dir)) throw new InvalidInput("받은 묶음이 없습니다");

  let names: string[];
  try { names = fs.readdirSync(dir); } catch (e) { throw new FileIo(e); }
  if (names.length === 0) throw new InvalidInput("받은 묶음이 비어 있습니다");

  // 검증이 이름 붙이기보다 먼저다 — 하나라도 틀리면 아무것도 안 옮긴다
  const items: { name: string; mtimeNs: bigint }[] = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let st: fs.BigIntStats;
    try { st = fs.lstatSync(file, { bigint: true }); } catch (e) { throw new FileIo(e); }
    if (!st.isFile() || st.size === 0n) throw new InvalidInput(`올바른 파일이 아닙니다: ${name}`);
    let head: Uint8Array;
    try { head = readHead(file); } catch (e) { throw new FileIo(e); }
    const why = deps.check(name, head);
    if (why !== null) throw new InvalidInput(why);
    items.push({ name, mtimeNs: st.mtimeNs });
  }
  // 찍은 순서(mtime) → 같으면 이름. 메인이 복사본 이름을 원본 순서 번호로 지어 둬서 같은 시각이어도 순서가 정해진다
  items.sort((a, b) => (a.mtimeNs < b.mtimeNs ? -1 : a.mtimeNs > b.mtimeNs ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const moved: { from: string; to: string }[] = [];
  const stored: string[] = [];
  const undo = () => {
    for (const m of moved.splice(0).reverse()) {
      try { deps.rename(m.to, m.from); } catch (back) { console.warn(`되돌리지 못했습니다: ${path.basename(m.to)}`, back); }
    }
  };
  try {
    for (const { name } of items) {
      const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
      const from = path.join(dir, name);
      // 이름이 그새 찼으면(EEXIST) 다음 번호로 — 남의 파일을 덮지 않는다
      for (let attempt = 0; ; attempt++) {
        const target = deps.nextName(folder, ext);
        // 끝번호를 지우고 다시 올리면 같은 이름이 돌아온다 — 옛 썸네일을 먼저 치운다
        dropThumb(folder, target);
        const to = path.join(folder, target);
        try {
          deps.rename(from, to);
        } catch (e) {
          if (isExists(e) && attempt < 50) continue;
          throw e;
        }
        moved.push({ from, to });
        stored.push(target);
        break;
      }
    }
  } catch (e) {
    undo();
    throw new FileIo(e);
  }
  const finish = () => {
    removeDirQuietly(dir);
    try { fs.rmdirSync(root); } catch { /* 다른 묶음이 있다 */ }
  };
  return { names: stored, undo, finish };
}

function removeDirQuietly(dir: string) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.warn("받은 묶음 폴더를 치우지 못했습니다", e); }
}

/**
 * 기동 때 — 한 시간 넘은 `.incoming/*`는 비정상 종료가 남긴 것이다.
 * 도는 중인 묶음은 메인이 계속 시각을 갱신하지는 않지만 한 시간 안에 끝나지 않는 복사는 치우는 쪽이 안전하다(커밋하면 400)
 */
export function sweepIncoming(mediaRoot: string, now = Date.now()): number {
  let removed = 0;
  let games: fs.Dirent[];
  try { games = fs.readdirSync(mediaRoot, { withFileTypes: true }); } catch { return 0; }
  for (const g of games) {
    if (!g.isDirectory() || g.name.startsWith(".")) continue;
    const root = path.join(mediaRoot, g.name, INCOMING_DIR);
    if (!isRealDirectory(root)) continue;
    for (const b of fs.readdirSync(root)) {
      const dir = path.join(root, b);
      try {
        if (now - fs.lstatSync(dir).mtimeMs < STALE_MS) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        removed++;
      } catch { /* 다음 기동에 */ }
    }
    try { fs.rmdirSync(root); } catch { /* 안 비었다 */ }
  }
  return removed;
}
