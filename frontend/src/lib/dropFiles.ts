/**
 * 끌어다 놓은·고른 파일에서 받을 것만 거른다 — DropZone(커버)과 스크린샷 격자가 같이 쓴다.
 * 말없이 버리면 "드롭이 안 된다"로 보이므로 거른 이유를 서버가 내는 문구와 같은 글자로 돌려준다
 */
export function splitAccepted(list: FileList | File[] | null, video: boolean): { files: File[]; message: string | null } {
  const all = Array.from(list ?? []);
  const files = all.filter((f) => f.type.startsWith("image/") || (video && f.type.startsWith("video/")));
  const skipped = all.filter((f) => !files.includes(f));
  // 확장자가 없으면 파일 이름을 대신 보인다
  const kinds = [...new Set(skipped.map((f) => extensionOf(f.name)))].join(", ");
  return {
    files,
    message:
      skipped.length === 0
        ? null
        : `지원하지 않는 형식입니다: ${kinds} (${video ? "jpg · png · webp · mp4 · mov · webm" : "jpg, png, webp만 가능"})`,
  };
}

/** `a.b.pdf` → `pdf`. 점이 없으면 이름 전체 */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 || dot === name.length - 1 ? name : name.slice(dot + 1).toLowerCase();
}
