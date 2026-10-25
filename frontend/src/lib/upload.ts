import { api } from "./api";

/**
 * 커버 업로드 — **경로가 둘로 갈린다** (v1.0 6단계, architecture §4).
 *
 * ```
 *   EXTERNAL   허가증 → 스토리지에 직접 PUT → 확정      (왕복 3회)
 *   LOCAL·DB   백엔드로 파일 전송                        (왕복 1회 — 폴더냐 DB 행이냐는 서버 몫)
 * ```
 *
 * **어느 쪽인지 화면이 안 정한다.** 판정에 필요한 것(자격증명이 있나, 체크박스가 켜졌나)이
 * 전부 서버에 있어서, 화면이 알아내려면 설정을 또 내려받아야 하고 그러면 규칙이 두 곳에 생긴다.
 * 첫 요청이 "어떻게 올려라"를 답해주고 여기는 따라가기만 한다.
 */
type UploadTarget = {
  mode: "LOCAL" | "EXTERNAL" | "DB";
  uploadUrl: string | null;
  storageKey: string | null;
  contentType: string;
};

export async function uploadCover(entryId: number, original: File): Promise<void> {
  // 줄인 뒤의 이름·크기로 허가증을 받는다 — EXTERNAL은 크기·타입이 서명에 들어간다
  const file = await shrinkCover(original);
  const target = await api.post<UploadTarget>(`/api/backlog/${entryId}/cover/upload-url`, {
    fileName: file.name,
    sizeBytes: file.size,
  });

  if (target.mode === "LOCAL" || target.mode === "DB") {
    await postFile(`/api/backlog/${entryId}/cover/file`, file);
    return;
  }

  /*
   * 2단계는 우리 API가 아니다 — `api` 래퍼를 쓰면 안 된다.
   * Content-Type은 **서버가 준 값 그대로** 써야 한다. 서명에 포함된 값이라 다르면 403이다
   */
  const uploaded = await fetch(target.uploadUrl!, {
    method: "PUT",
    headers: { "Content-Type": target.contentType },
    body: file,
  });
  if (!uploaded.ok) {
    throw new Error(`이미지 업로드에 실패했습니다 (${uploaded.status})`);
  }

  await api.put(`/api/backlog/${entryId}/cover`, { storageKey: target.storageKey });
}

/** 긴 변 상한. 카드·상세 커버는 이보다 작게 그려진다 */
const COVER_MAX_EDGE = 1200;
/** 이미 이만큼 작은 JPEG면 다시 굽지 않는다 — 다시 구우면 화질만 깎인다 */
const COVER_KEEP_BYTES = 400 * 1024;
const COVER_QUALITY = 0.85;

/**
 * 올리기 전에 줄인다 (2026-10-25) — 커버가 DB에 들어가 백업·세이브 뽑기마다 실려 다니므로 몇 MB짜리 원본이면
 * 그대로 무게가 된다. 긴 변 1200px · JPEG 0.85. 세 위치 모두 같다 (스크린샷은 안 줄인다 — 원본이 곧 기록이다).
 *
 * 못 읽는 파일(GIF·깨진 파일·지원 안 하는 형식)은 **그대로** 보낸다 — 거절은 서버가 이유와 함께 한다.
 * 투명한 부분은 검게 칠한다: JPEG에는 투명이 없고, 앱 바탕이 검다
 */
async function shrinkCover(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const { width, height } = bitmap;
    const edge = Math.max(width, height);
    if (edge <= COVER_MAX_EDGE && file.type === "image/jpeg" && file.size <= COVER_KEEP_BYTES) return file;
    const scale = Math.min(1, COVER_MAX_EDGE / edge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", COVER_QUALITY));
    if (!blob) return file;
    /*
     * 상한 안의 원본인데 다시 구운 게 작아지지 않았으면 원본이 낫다 — 형식을 안 가린다.
     * 작은 PNG·WebP(아이콘풍 커버)는 JPEG로 구우면 오히려 커지고 화질만 깎인다
     */
    if (edge <= COVER_MAX_EDGE && blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]*$/, "") || "cover";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/**
 * 스크린샷·영상은 항상 백엔드를 지난다 (v1.0 7단계).
 *
 * `takenAt`은 **원본 파일의 수정시각**이다. 서버가 저장한 파일에 그대로 심어서
 * "찍은 순서"를 만든다 — 안 보내면 옛 스크린샷 스무 장이 전부 "지금"이 된다
 */
export async function uploadScreenshot(
  entryId: number,
  file: File,
  takenAt?: number,
): Promise<void> {
  const query = takenAt ? `?takenAt=${takenAt}` : "";
  await postFile(`/api/backlog/${entryId}/screenshots${query}`, file);
}

/**
 * `multipart/form-data`.
 *
 * **`Content-Type`을 직접 안 쓴다.** 손으로 쓰면 boundary가 빠져서 서버가 파싱을 못 한다 —
 * FormData를 주면 브라우저가 boundary까지 붙여 알아서 채운다
 */
async function postFile(path: string, file: File): Promise<void> {
  const body = new FormData();
  body.append("file", file);
  await api.postMultipart(path, body);
}
