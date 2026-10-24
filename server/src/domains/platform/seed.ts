/**
 * 빈 DB에 주인이 생길 때 심는 기본 플랫폼·입력방식 — 자바 `DefaultCatalogSeeder`.
 * TODO(P2 platform): 자바 그대로 옮길 것
 */
import type { Tx } from "../../db/client";

export async function seedDefaultCatalog(_tx: Tx, _memberId: number): Promise<void> {
  throw new Error("seedDefaultCatalog: 아직 안 옮겼다 (P2 platform)");
}
