import { api } from "./api";

/**
 * 커버 업로드 — **경로가 둘로 갈린다** (v1.0 6단계, architecture §4).
 *
 * ```
 *   EXTERNAL  허가증 → 스토리지에 직접 PUT → 확정      (왕복 3회)
 *   LOCAL     백엔드로 파일 전송                        (왕복 1회)
 * ```
 *
 * **어느 쪽인지 화면이 안 정한다.** 판정에 필요한 것(자격증명이 있나, 체크박스가 켜졌나)이
 * 전부 서버에 있어서, 화면이 알아내려면 설정을 또 내려받아야 하고 그러면 규칙이 두 곳에 생긴다.
 * 첫 요청이 "어떻게 올려라"를 답해주고 여기는 따라가기만 한다.
 */
type UploadTarget = {
  mode: "LOCAL" | "EXTERNAL";
  uploadUrl: string | null;
  storageKey: string | null;
  contentType: string;
};

export async function uploadCover(entryId: number, file: File): Promise<void> {
  const target = await api.post<UploadTarget>(`/api/backlog/${entryId}/cover/upload-url`, {
    fileName: file.name,
    sizeBytes: file.size,
  });

  if (target.mode === "LOCAL") {
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

/** 스크린샷은 항상 백엔드를 지난다 (v1.0 7단계) */
export async function uploadScreenshot(entryId: number, file: File): Promise<void> {
  await postFile(`/api/backlog/${entryId}/screenshots`, file);
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
