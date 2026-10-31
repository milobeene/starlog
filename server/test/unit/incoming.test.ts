import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { commitIncoming, INCOMING_DIR, isBatchId, moveNoClobber, sweepIncoming, type CommitDeps } from "../../src/domains/backlog/incoming";
import { nextName } from "../../src/domains/backlog/media";
import { localList } from "../../src/common/storage";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
const BATCH = "0b1e4a7e-2f4c-4f0e-9d0a-1c2d3e4f5a6b";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function setup() {
  const media = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-incoming-"));
  dirs.push(media);
  const folder = path.join(media, "game");
  fs.mkdirSync(folder);
  const batch = path.join(folder, INCOMING_DIR, BATCH);
  fs.mkdirSync(batch, { recursive: true });
  const put = (name: string, body: Buffer, mtimeSec: number) => {
    const f = path.join(batch, name);
    fs.writeFileSync(f, body);
    fs.utimesSync(f, mtimeSec, mtimeSec);
  };
  return { media, folder, batch, put };
}

const deps = (over: Partial<CommitDeps> = {}): CommitDeps => ({
  rename: moveNoClobber,
  nextName,
  check: (name, head) => (name.endsWith(".png") && head[0] !== 0x89 ? "형식 불일치" : null),
  ...over,
});

describe("스크린샷 묶음 커밋", () => {
  it("mtime 순 → 같으면 이름 순으로, 기존 최대 번호 다음부터 붙인다", () => {
    const { folder, put } = setup();
    fs.writeFileSync(path.join(folder, "007.png"), PNG);   // 중간이 비어 있어도 최대 번호 다음
    put("0000.png", PNG, 3000);
    put("0001.jpg", JPG, 1000);
    put("0002.png", PNG, 2000);
    put("0003.png", PNG, 2000);
    const { names, finish } = commitIncoming(folder, BATCH, deps());
    finish();
    expect(names).toEqual(["008.jpg", "009.png", "010.png", "011.png"]);
    // 0001(1000) → 0002(2000) → 0003(2000) → 0000(3000)
    expect(fs.statSync(path.join(folder, "008.jpg")).mtimeMs).toBe(1000_000);
    expect(fs.statSync(path.join(folder, "011.png")).mtimeMs).toBe(3000_000);
    expect(fs.existsSync(path.join(folder, INCOMING_DIR))).toBe(false);
  });

  it("중간 rename이 실패하면 옮긴 것을 되돌리고 묶음은 그대로 남는다", () => {
    const { folder, batch, put } = setup();
    put("0000.png", PNG, 1000);
    put("0001.png", PNG, 2000);
    put("0002.png", PNG, 3000);
    let n = 0;
    const flaky = (a: string, b: string) => { if (++n === 3) throw new Error("EBUSY"); moveNoClobber(a, b); };
    expect(() => commitIncoming(folder, BATCH, deps({ rename: flaky }))).toThrow();
    expect(fs.readdirSync(batch).sort()).toEqual(["0000.png", "0001.png", "0002.png"]);
    expect(fs.readdirSync(folder)).toEqual([INCOMING_DIR]);
    expect(fs.statSync(path.join(batch, "0000.png")).mtimeMs).toBe(1000_000);
  });

  it("옮긴 뒤 단계가 실패해 undo하면 전부 .incoming으로 돌아온다 (갤러리에 안 남는다)", () => {
    const { folder, batch, put } = setup();
    put("0000.png", PNG, 1000);
    put("0001.png", PNG, 2000);
    const done = commitIncoming(folder, BATCH, deps());
    expect(fs.readdirSync(folder).sort()).toEqual([INCOMING_DIR, "001.png", "002.png"].sort());
    // describe/stat 실패·커밋 실패를 흉내 — 호출자가 undo를 부른다
    done.undo();
    expect(fs.readdirSync(batch).sort()).toEqual(["0000.png", "0001.png"]);
    expect(fs.readdirSync(folder)).toEqual([INCOMING_DIR]);
    expect(fs.statSync(path.join(batch, "0000.png")).mtimeMs).toBe(1000_000);
  });

  it("대상 이름이 이미 있으면 덮지 않고 다음 번호로 간다", () => {
    const { folder, put } = setup();
    put("0000.png", PNG, 1000);
    const mine = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 9]);
    let first = true;
    // 다른 트랜잭션이 같은 번호를 잡은 상황: 처음엔 이미 찬 이름을 돌려준다
    const racing = (f: string, ext: string) => {
      if (first) { first = false; fs.writeFileSync(path.join(f, `001.${ext}`), mine); return `001.${ext}`; }
      return nextName(f, ext);
    };
    const { names } = commitIncoming(folder, BATCH, deps({ nextName: racing }));
    expect(names).toEqual(["002.png"]);
    expect(fs.readFileSync(path.join(folder, "001.png"))).toEqual(mine);
    expect(fs.readFileSync(path.join(folder, "002.png"))).toEqual(PNG);
  });

  it("내용이 형식과 안 맞으면 아무것도 옮기지 않는다", () => {
    const { folder, batch, put } = setup();
    put("0000.png", PNG, 1000);
    put("0001.png", JPG, 2000);
    expect(() => commitIncoming(folder, BATCH, deps())).toThrow(/형식/);
    expect(fs.readdirSync(batch).length).toBe(2);
    expect(fs.readdirSync(folder)).toEqual([INCOMING_DIR]);
  });

  it("batchId는 uuid 모양만 — 경로 탈출·빈 값·대문자 거절, 없는 묶음도 거절", () => {
    const { folder } = setup();
    for (const bad of ["../x", "", "..", "0b1e4a7e-2f4c-4f0e-9d0a-1c2d3e4f5a6B", "a/b", BATCH + "/.."]) {
      expect(isBatchId(bad)).toBe(false);
      expect(() => commitIncoming(folder, bad, deps())).toThrow();
    }
    expect(() => commitIncoming(folder, "11111111-2222-3333-4444-555555555555", deps())).toThrow(/묶음/);
  });

  it(".incoming은 목록(localList)에 안 나온다", () => {
    const { folder, put } = setup();
    put("0000.png", PNG, 1000);
    expect(localList(folder)).toEqual([]);
  });

  it("한 시간 넘은 묶음만 정리한다", () => {
    const { media, folder, batch } = setup();
    const recent = path.join(folder, INCOMING_DIR, "11111111-2222-3333-4444-555555555555");
    fs.mkdirSync(recent);
    const old = Date.now() / 1000 - 2 * 3600;
    fs.utimesSync(batch, old, old);
    expect(sweepIncoming(media, Date.now())).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(batch)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
  });
});
