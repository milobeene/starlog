/**
 * 업로드 허가증 서명 — 이전 구현(AWS SDK for Java 2.30.16 `S3Presigner`)이 만든 URL과 **글자 하나까지** 같은지.
 *
 * 기대값은 그 SDK로 직접 뽑았다 (가짜 자격증명, 네트워크 없음 — 서명은 로컬 계산이다).
 * 같은 시각(`X-Amz-Date`)을 넣으면 서명이 결정적이라 고정 시각으로 대조할 수 있다.
 * 진짜 버킷에 올려보지 않는다 — 사용자의 실제 R2다.
 */
import { describe, expect, it } from "vitest";
import { __test } from "./index";

const storage = new __test.S3Storage({
  endpoint: "https://acct123.r2.cloudflarestorage.com",
  bucket: "starlog",
  accessKey: "AKIDEXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  publicBaseUrl: null,
});

describe("presignUpload", () => {
  it("평범한 키 — content-type·content-length가 서명에 들어간다", async () => {
    const url = await storage.presignUrl("covers/1/57/0f8e-uuid.png", "image/png", 12345, 600, "20261024T094951Z");
    expect(url).toBe("https://acct123.r2.cloudflarestorage.com/starlog/covers/1/57/0f8e-uuid.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261024T094951Z&X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost&X-Amz-Credential=AKIDEXAMPLE%2F20261024%2Fauto%2Fs3%2Faws4_request&X-Amz-Expires=600&X-Amz-Signature=7b94506cf06b85f70c138800c20a30aadc5c129ab04a7791e682c1f68e952081");
  });

  it("공백·+·~·비ASCII·괄호가 든 키 — 경로 인코딩까지 같다", async () => {
    const url = await storage.presignUrl("covers/1/57/a b+c~ü(1).jpg", "image/png", 12345, 600, "20261024T094952Z");
    expect(url).toBe("https://acct123.r2.cloudflarestorage.com/starlog/covers/1/57/a%20b%2Bc~%C3%BC%281%29.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261024T094952Z&X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost&X-Amz-Credential=AKIDEXAMPLE%2F20261024%2Fauto%2Fs3%2Faws4_request&X-Amz-Expires=600&X-Amz-Signature=1b36c5e617bb6ab35d87b05bc6cd1fa43944466c4774412650e4a50bcda7d2da");
  });
});
