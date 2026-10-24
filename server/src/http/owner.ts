/**
 * "이 요청은 누구의 것인가" — 자바 `LoginMemberArgumentResolver` + `OwnerService`.
 *
 * **로그인이 없다.** 주인은 가장 먼저 만들어진 회원이고, 없으면 지금 만든다.
 * ⚠️ `X-Member-Id` 헤더는 인증이 아니라 테스트 장치다 — dev·test 프로필에서만 읽는다.
 */
import type { MiddlewareHandler } from "hono";
import { asc } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db/client";
import { member } from "../db/schema";
import { nowKst } from "../common/clock";
import { seedDefaultCatalog } from "../domains/platform/seed";
import type { AppEnv } from "./env";

export const TEST_MEMBER_HEADER = "X-Member-Id";

let cachedOwner: number | null = null;

export async function ownerId(): Promise<number> {
  if (cachedOwner !== null) return cachedOwner;
  const [first] = await db().select({ id: member.id }).from(member).orderBy(asc(member.id)).limit(1);
  cachedOwner = first ? first.id : await createOwner();
  return cachedOwner;
}

/** 세이브파일을 바꿔 열면 주인이 달라진다 — 프로세스가 새로 뜨므로 실제로는 안 쓰인다 */
export function forgetOwner() { cachedOwner = null; }

async function createOwner(): Promise<number> {
  return db().transaction(async (tx) => {
    const now = nowKst();
    const [row] = await tx.insert(member).values({
      email: "owner@starlog.local",
      password: "(no-login)",
      nickname: "Scribe",
      role: "USER",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: member.id });
    await seedDefaultCatalog(tx, row!.id);   // 플랫폼·입력방식 기본값
    console.log(`주인 계정을 새로 만들었습니다. id=${row!.id}`);
    return row!.id;
  });
}

function override(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const s = raw.trim();
  if (!/^[+-]?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export const ownerMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const o = config().allowMemberOverride ? override(c.req.header(TEST_MEMBER_HEADER)) : null;
  c.set("memberId", o ?? await ownerId());
  await next();
};
