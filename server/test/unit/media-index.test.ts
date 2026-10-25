import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { entryFor, readFolderIndex } from "../../src/common/storage/mediaIndex";

function folderWith(files: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-index-"));
  for (const f of files) fs.writeFileSync(path.join(dir, f), "x");
  fs.mkdirSync(path.join(dir, ".thumbs"));
  return dir;
}

const writeIndex = (dir: string, data: unknown) => fs.writeFileSync(path.join(dir, ".thumbs", "index.json"), JSON.stringify(data));

describe("폴더 색인 (메인이 쓰고 서버는 읽기만)", () => {
  it("도장(폴더 mtime + 항목 수)이 맞을 때만 믿는다", () => {
    const dir = folderWith(["001.jpg"]);
    const st = fs.lstatSync(path.join(dir, "001.jpg"), { bigint: true });
    const names = fs.readdirSync(dir);
    const files = { "001.jpg": { m: st.mtimeNs.toString(), s: 1, w: 1920, h: 1080, p: "1x1:AAAA", t: 1 } };
    writeIndex(dir, { v: 1, dir: { m: fs.lstatSync(dir, { bigint: true }).mtimeNs.toString(), n: names.length }, files });
    const idx = readFolderIndex(dir, names)!;
    expect(idx.trusted).toBe(true);
    expect(entryFor(idx, "001.jpg", st)?.w).toBe(1920);
    // 항목 수가 다르면(파일이 늘었다) 안 믿는다 — 판이 같은 항목 값은 그대로 쓴다
    expect(readFolderIndex(dir, [...names, "002.jpg"])!.trusted).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("판(mtime·크기)이 다른 항목·모양이 틀린 자리표시·깨진 파일·링크인 .thumbs는 버린다", () => {
    const dir = folderWith(["001.jpg"]);
    const st = fs.lstatSync(path.join(dir, "001.jpg"), { bigint: true });
    writeIndex(dir, { v: 1, dir: null, files: { "001.jpg": { m: "1", s: 1, w: 1, h: 1, p: "<script>", t: 1 } } });
    const idx = readFolderIndex(dir, fs.readdirSync(dir))!;
    expect(idx.trusted).toBe(false);
    expect(entryFor(idx, "001.jpg", st)).toBeNull();
    expect(idx.files["001.jpg"]!.p).toBeNull();
    fs.writeFileSync(path.join(dir, ".thumbs", "index.json"), "{broken");
    expect(readFolderIndex(dir, fs.readdirSync(dir))).toBeNull();
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-index-out-"));
    fs.rmSync(path.join(dir, ".thumbs"), { recursive: true });
    fs.symlinkSync(other, path.join(dir, ".thumbs"));
    fs.writeFileSync(path.join(other, "index.json"), JSON.stringify({ v: 1, dir: null, files: {} }));
    expect(readFolderIndex(dir, fs.readdirSync(dir))).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  });
});
