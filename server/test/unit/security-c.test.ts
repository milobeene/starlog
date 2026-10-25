/**
 * 보안 조사 C 레인 — 스토리지 키·슬러그·가져오기 검증·tar 풀기.
 * 실데이터를 적지 않는다 (저장소가 공개다) — 이름은 전부 만든 값
 */
import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { createRequire } from "module";
import {
  isExternalCoverKey, isLocalCoverName, isNewCoverKeyOf, isSafeFolderName, isPlainFileName, mediaFolder,
  localExists, localList, __test,
} from "../../src/common/storage";
import { dropThumb, isFresh, pruneOrphans, THUMB_DIR } from "../../src/common/storage/thumbs";
import { isSlugShaped, slug } from "../../src/common/text";
import { mediaSlugGiven } from "../../src/domains/game/service";
import { MemberDump } from "../../src/domains/member/dump";

const U = "0f8e9a1c-3b4d-4e5f-8a6b-7c8d9e0f1a2b";

describe("커버 키 모양", () => {
  it("새 모양은 그 항목 것만", () => {
    expect(isNewCoverKeyOf(237, `covers/entry-237/${U}.png`)).toBe(true);
    expect(isNewCoverKeyOf(5, `covers/entry-237/${U}.png`)).toBe(false);
    expect(isNewCoverKeyOf(23, `covers/entry-237/${U}.png`)).toBe(false);
  });
  it("`..`·이중 슬래시·절대 경로·역슬래시는 전부 거절", () => {
    const bad = [
      `covers/entry-237/../entry-5/${U}.png`, `covers/entry-237/../../x.png`, `covers//entry-237/${U}.png`,
      `/covers/entry-237/${U}.png`, `covers\\entry-237\\${U}.png`, `covers/entry-237/${U}.png/`, `covers/entry-237/x.png`,
      `covers/entry-237/${U}.gif`, `covers/entry-237/${U}.png\0`, `covers/entry-237/${U}.png?x=1`, `x/covers/entry-237/${U}.png`,
      "", "k", "covers/abc.jpg", `covers/1/2/../3/${U}.jpg`,
    ];
    for (const k of bad) { expect(isExternalCoverKey(k), k).toBe(false); expect(isNewCoverKeyOf(237, k), k).toBe(false); }
  });
  it("V14 전 모양 covers/<회원>/<항목>/<uuid>.<ext>은 읽기·삭제용으로 계속 통한다", () => {
    expect(isExternalCoverKey(`covers/1/57/${U}.jpg`)).toBe(true);
    expect(isNewCoverKeyOf(57, `covers/1/57/${U}.jpg`)).toBe(false);   // 새로 붙이는 건 새 모양만
  });
  it("LOCAL 커버는 파일 이름 하나", () => {
    expect(isLocalCoverName(`${U}.jpg`)).toBe(true);
    for (const k of ["../a.png", "a/b.png", ".hidden.png", "a.txt", "", "a\\b.png"]) expect(isLocalCoverName(k), k).toBe(false);
  });
});

describe("스토리지 요청 — 틀린 키는 네트워크로 나가지 않는다", () => {
  const s3 = new __test.S3Storage({ endpoint: "https://s3.example.test", bucket: "b", accessKey: "a", secretKey: "s", publicBaseUrl: null });
  it("HEAD·GET·DELETE·허가증 모두", async () => {
    const f = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", f);
    const bad = `covers/entry-237/../entry-5/${U}.png`;
    await expect(s3.head(bad)).rejects.toThrow();
    await expect(s3.readHead(bad, 12)).rejects.toThrow();
    await expect(s3.delete(bad)).resolves.toBeUndefined();   // 던지지 않지만 보내지도 않는다
    await expect(s3.presignUpload(bad, "image/png", 10, 600)).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
    await s3.delete(`covers/1/57/${U}.jpg`);                 // 옛 모양은 나간다
    expect(f).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("슬러그", () => {
  it("윈도우 예약 이름에는 꼬리를 붙인다", () => {
    for (const n of ["CON", "nul", "Com1", "LPT9", "prn", "aux"]) expect(slug(n)).toBe(`${n.toLowerCase()}-game`);
    expect(slug("console")).toBe("console");
    expect(slug("com10")).toBe("com10");
  });
  it("바이트 상한 200 — 한글도 넘지 않고 글자를 쪼개지 않는다", () => {
    const s = slug("가".repeat(80));
    expect(Buffer.byteLength(s)).toBeLessThanOrEqual(200);
    expect(s).toBe("가".repeat(66));
    expect(slug("a".repeat(500))).toBe("a".repeat(80));   // 80자 상한은 그대로
  });
  it("기존 이름은 안 바뀐다", () => {
    expect(slug("Cyberpunk 2077")).toBe("cyberpunk-2077");
    expect(slug("내 게임 12")).toBe("내-게임-12");
  });
  it("slug 모양 검사 — 가져온 mediaFolder", () => {
    for (const ok of ["a", "cyberpunk-2077", "내-게임-12", "foo-12"]) expect(isSlugShaped(ok), ok).toBe(true);
    for (const bad of ["", ".", "..", "a/b", "a\\b", "../x", ".hidden", "con", "a b", "A-b", "-a", "a-", "a--b", "a\0", "x".repeat(300)]) expect(isSlugShaped(bad), bad).toBe(false);
    expect(slug("..")).toBe("untitled");
  });
  it("번호 붙은 이름도 남이 쓰면 한 칸 더 간다", () => {
    const owners = new Map([["foo", 1], ["foo-2", 9]]);
    expect(mediaSlugGiven({ id: 2, name: "Foo" }, (f) => owners.get(f))).toBe("foo-2-2");
    expect(mediaSlugGiven({ id: 1, name: "Foo" }, (f) => owners.get(f))).toBe("foo");
    expect(mediaSlugGiven({ id: 3, name: "Foo" }, (f) => owners.get(f))).toBe("foo-3");
  });
});

describe("폴더·파일 이름 한 조각", () => {
  it("폴더", () => {
    for (const bad of ["", ".", "..", "a/b", "a\\b", ".x", "a\0"]) expect(isSafeFolderName(bad), bad).toBe(false);
    expect(isSafeFolderName("cyberpunk-2077")).toBe(true);
    expect(() => mediaFolder("a/b")).toThrow();
    expect(() => mediaFolder("..")).toThrow();
  });
  it("파일", () => {
    for (const bad of ["", ".", "..", "a/b.png", "a\\b.png", "a\0"]) expect(isPlainFileName(bad), bad).toBe(false);
    expect(isPlainFileName("001.png")).toBe(true);
  });
});

describe("심볼릭 링크는 따라가지 않는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-c-"));
  const secret = path.join(dir, "secret.png");
  fs.writeFileSync(secret, "x");
  const folder = path.join(dir, "game");
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "001.png"), "x");
  fs.symlinkSync(secret, path.join(folder, "002.png"));
  fs.symlinkSync(dir, path.join(folder, "sub"));
  it("목록·존재 확인에서 링크는 없는 것", () => {
    expect(localList(folder)).toEqual(["001.png"]);
    expect(localExists(folder, "001.png")).toBe(true);
    expect(localExists(folder, "002.png")).toBe(false);
    expect(localExists(folder, "sub/secret.png")).toBe(false);
  });
});

describe(".thumbs가 링크면 읽지도 쓰지도 지우지도 않는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-c2-"));
  const outside = path.join(dir, "outside"); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "001.png.jpg"), "keep");
  const folder = path.join(dir, "game"); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "001.png"), "x");
  fs.symlinkSync(outside, path.join(folder, THUMB_DIR));
  it("dropThumb·pruneOrphans", () => {
    dropThumb(folder, "001.png");
    pruneOrphans(folder, new Set());
    expect(fs.readFileSync(path.join(outside, "001.png.jpg"), "utf8")).toBe("keep");
  });
  it("isFresh — 링크 폴더의 썸네일은 신선하지 않다", () => {
    const st = fs.statSync(path.join(outside, "001.png.jpg"), { bigint: true });
    expect(isFresh(path.join(folder, THUMB_DIR, "001.png.jpg"), st.mtimeNs / 1_000_000n)).toBe(false);
  });
});

describe("가져오기 본문 길이 상한", () => {
  const base = { formatVersion: 4 };
  it("배열이 상한을 넘으면 거절", () => {
    expect(MemberDump.safeParse({ ...base, entries: new Array(20_001).fill(null) }).success).toBe(false);
    expect(MemberDump.safeParse({ ...base, entries: [{ playthroughs: new Array(2_001).fill(null) }] }).success).toBe(false);
    expect(MemberDump.safeParse({ ...base, entries: [{ memo: "x".repeat(200_001) }] }).success).toBe(false);
    expect(MemberDump.safeParse({ ...base, games: [{ name: "x".repeat(20_001) }] }).success).toBe(false);
  });
  it("보통 크기는 통과", () => {
    expect(MemberDump.safeParse({ ...base, games: [{ name: "x".repeat(300) }], entries: [{ memo: "y".repeat(5000) }] }).success).toBe(true);
  });
});

// ───────────── tar 풀기 (desktop/tarball.js) ─────────────

const tarball = createRequire(import.meta.url)("../../../desktop/tarball.js") as {
  pack(dir: string, target: string): void; unpack(file: string, dir: string): void;
};
const BLOCK = 512;
function hdr(name: string, size: number, type = "0", link = "", fixSum = true) {
  const b = Buffer.alloc(BLOCK);
  b.write(name, 0, 100); b.write("0000644\0", 100); b.write(size.toString(8).padStart(11, "0") + "\0", 124);
  b.write("        ", 148); b.write(type, 156); if (link) b.write(link, 157, 100); b.write("ustar\0" + "00", 257);
  let sum = 0; for (const x of b) sum += x;
  if (fixSum) b.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return b;
}
type E = { name: string; data?: string; size?: number; type?: string; link?: string; badSum?: boolean };
function mk(entries: E[], end = true): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const data = Buffer.from(e.data ?? "");
    parts.push(hdr(e.name, e.size ?? data.length, e.type ?? "0", e.link, !e.badSum), data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  if (end) parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}

describe("tar 풀기", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-tar-"));
  let n = 0;
  const tryUnpack = (bytes: Buffer) => {
    const f = path.join(work, `t${++n}.tgz`), dir = path.join(work, `o${n}`);
    fs.writeFileSync(f, bytes);
    let err: Error | null = null;
    try { tarball.unpack(f, dir); } catch (e) { err = e as Error; }
    return { err, dir, partLeft: fs.existsSync(`${dir}.part`) };
  };
  const pg: E = { name: "PG_VERSION", data: "17" };

  it("왕복: pack → unpack", () => {
    const src = path.join(work, "src"); fs.mkdirSync(path.join(src, "base"), { recursive: true });
    fs.writeFileSync(path.join(src, "PG_VERSION"), "17"); fs.writeFileSync(path.join(src, "base", "f"), "hello");
    const t = path.join(work, "rt.tar.gz"); tarball.pack(src, t);
    const dest = path.join(work, "rt-out"); tarball.unpack(t, dest);
    expect(fs.readFileSync(path.join(dest, "base", "f"), "utf8")).toBe("hello");
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
  });
  it("정상 묶음", () => {
    const r = tryUnpack(mk([pg, { name: "a/b", data: "zz" }]));
    expect(r.err).toBeNull();
    expect(fs.readFileSync(path.join(r.dir, "a", "b"), "utf8")).toBe("zz");
  });
  it.each([
    ["..", [{ name: "../escape.txt", data: "x" }]],
    ["중간 ..", [{ name: "a/../../escape.txt", data: "x" }]],
    ["절대 경로", [{ name: "/tmp/escape.txt", data: "x" }]],
    ["역슬래시", [{ name: "a\\..\\x", data: "x" }]],
    ["드라이브", [{ name: "C:/x", data: "x" }]],
    ["심볼릭 링크", [{ name: "ln", type: "2", link: "/etc", size: 0 }]],
    ["하드 링크", [{ name: "hl", type: "1", link: "/etc/hosts", size: 0 }]],
    ["장치", [{ name: "dev", type: "3", size: 0 }]],
    ["체크섬 틀림", [{ name: "x", data: "y", badSum: true }]],
    ["크기가 남은 버퍼보다 큼 (잘림)", [pg, { name: "big", size: 5000, data: "abc" }]],
    ["크기 칸이 숫자가 아님", [pg, { name: "n", size: Number.NaN }]],
    ["같은 파일 두 번", [pg, { name: "d", data: "1" }, { name: "d", data: "2" }]],
    ["PG_VERSION 없음", [{ name: "x", data: "y" }]],
  ] as [string, E[]][])("거절 — %s", (_label, entries) => {
    const r = tryUnpack(mk(entries));
    expect(r.err).not.toBeNull();
    expect(r.partLeft).toBe(false);          // .part를 치운다
    expect(fs.existsSync(r.dir)).toBe(false);
  });
  it("끝 표시 없이 잘린 묶음은 거절", () => {
    const r = tryUnpack(mk([pg, { name: "a", data: "z" }], false));
    expect(r.err?.message).toMatch(/잘려/);
    expect(r.partLeft).toBe(false);
  });
  it("tar가 아닌 gzip은 거절", () => {
    expect(tryUnpack(zlib.gzipSync(Buffer.from("x".repeat(2000)))).err).not.toBeNull();
  });
  it("압축 폭탄(풀면 1GB 초과)은 메모리에 다 풀기 전에 끊는다", () => {
    const bomb = zlib.gzipSync(Buffer.alloc(1100 * 1024 * 1024, 0), { level: 9 });
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    const r = tryUnpack(bomb);
    expect(r.err).not.toBeNull();
    expect(r.partLeft).toBe(false);
  }, 60_000);
});
