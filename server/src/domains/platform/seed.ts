/**
 * 빈 DB에 주인이 생길 때 심는 기본 플랫폼·입력방식.
 *
 * 기기와 에뮬레이터는 넣지 않는다 — 남의 하드웨어 목록으로 시작하는 건 의미가 없다.
 * 호출자의 트랜잭션 안에서 돈다 (주인 생성이 롤백되면 선택지도 함께 사라져야 한다).
 */
import type { Tx } from "../../db/client";
import { inputMethod, platform } from "../../db/schema";
import { nowKst } from "../../common/clock";

/** 순서가 곧 화면 순서다 — 많이 쓰는 것부터 */
const PLATFORMS = ["Steam", "Epic Games", "Nintendo", "PlayStation", "Xbox", "GOG", "itch.io"];
const INPUT_METHODS = ["KeyboardMouse", "XInput", "Nintendo", "PlayStation"];

export async function seedDefaultCatalog(tx: Tx, memberId: number): Promise<void> {
  // 행마다 따로 insert — id가 순서대로 매겨져야 한다
  for (const name of PLATFORMS) {
    const now = nowKst();
    await tx.insert(platform).values({ memberId, name, deletedAt: null, createdAt: now, updatedAt: now });
  }
  for (const name of INPUT_METHODS) {
    const now = nowKst();
    await tx.insert(inputMethod).values({ memberId, name, deletedAt: null, createdAt: now, updatedAt: now });
  }
}
