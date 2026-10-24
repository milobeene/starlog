/**
 * 구독 (FR-ACQ-04) — 자바 `subscription` 패키지.
 * 취득이 SUBSCRIPTION일 때 여기 연결된다 (FR-ACQ-05). 서비스명은 마스터가 아니라 문자열 (OI-06).
 *
 * 구독은 **물리 삭제**다 (§7.4). 취득이 참조 중이면 FK 위반 → 409 — 앱에서 막지 않고 DB에 맡긴다.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../../http/env";
import { db, type Db } from "../../db/client";
import { member, subscription } from "../../db/schema";
import { readBody, violations, DEFAULT_MSG } from "../../http/body";
import { pathId } from "../../http/params";
import { InvalidInput, NotFound } from "../../common/errors";
import { normalize } from "../../common/text";
import { money } from "../../common/money";
import { nowKst } from "../../common/clock";
import { opt, zDate, zMoney } from "../../common/schemas";

export const BILLING_CYCLES = ["MONTHLY", "YEARLY"] as const;

const SubscriptionRequest = z.object({
  serviceName: opt(z.string()),
  startedOn: opt(zDate),
  endedOn: opt(zDate),
  fee: zMoney,
  billingCycle: opt(z.enum(BILLING_CYCLES)),
});
type SubscriptionRequest = z.output<typeof SubscriptionRequest>;

function validate(r: SubscriptionRequest) {
  violations()
    .notBlank("serviceName", r.serviceName, DEFAULT_MSG.notBlank)
    .size("serviceName", r.serviceName, 0, 100, DEFAULT_MSG.size(0, 100))
    .notNull("startedOn", r.startedOn, DEFAULT_MSG.notNull)
    .throwIfAny();
}

/** 엔티티 `apply` — 검증 순서와 메시지를 자바와 같게 */
function apply(r: SubscriptionRequest) {
  const serviceName = normalize(r.serviceName);
  if (serviceName === null) throw new InvalidInput("구독 서비스명은 필수입니다");
  if (r.startedOn === null) throw new InvalidInput("구독 시작일은 필수입니다");
  if (r.billingCycle === null) throw new InvalidInput("결제 주기는 필수입니다");
  // 회차의 BR-PT-01과 같은 규칙. 당일 종료도 유효 (isBefore)
  if (r.endedOn !== null && r.endedOn < r.startedOn) {
    throw new InvalidInput(`종료일은 시작일 이후여야 합니다: ${r.startedOn} ~ ${r.endedOn}`);
  }
  const amount = r.fee?.amount ?? null;
  const fee = amount === null ? null : money(amount, r.fee?.currency ?? null);
  return {
    serviceName,
    startedOn: r.startedOn,
    endedOn: r.endedOn,
    billingCycle: r.billingCycle,
    feeAmount: fee?.amount ?? null,
    feeCurrency: fee?.currency ?? null,
  };
}

/** 소유권 확인 — 남의 것도 "없음"으로 (404). 취득이 구독을 연결할 때도 쓴다 */
export async function findOwnedSubscription(d: Db, memberId: number, subscriptionId: number) {
  const [row] = await d.select().from(subscription).where(eq(subscription.id, subscriptionId));
  if (!row || row.memberId !== memberId) throw new NotFound(`구독을 찾을 수 없습니다. id=${subscriptionId}`);
  return row;
}

export const routes = new Hono<AppEnv>();

routes.post("/api/me/subscriptions", async (c) => {
  const memberId = c.get("memberId");
  const r = await readBody(c, SubscriptionRequest);
  validate(r);
  const id = await db().transaction(async (tx) => {
    const [m] = await tx.select({ id: member.id }).from(member).where(eq(member.id, memberId));
    if (!m) throw new NotFound(`회원을 찾을 수 없습니다. id=${memberId}`);
    const v = apply(r);
    const now = nowKst();
    const [row] = await tx.insert(subscription)
      .values({ memberId, ...v, createdAt: now, updatedAt: now })
      .returning({ id: subscription.id });
    return row!.id;
  });
  c.header("Location", `/api/me/subscriptions/${id}`);
  return c.json({ id }, 201);
});

routes.put("/api/me/subscriptions/:subscriptionId", async (c) => {
  const memberId = c.get("memberId");
  const subscriptionId = pathId(c, "subscriptionId");
  const r = await readBody(c, SubscriptionRequest);
  validate(r);
  await db().transaction(async (tx) => {
    await findOwnedSubscription(tx, memberId, subscriptionId);
    const v = apply(r);
    await tx.update(subscription).set({ ...v, updatedAt: nowKst() })
      .where(and(eq(subscription.id, subscriptionId), eq(subscription.memberId, memberId)));
  });
  return c.body(null, 200);
});

routes.delete("/api/me/subscriptions/:subscriptionId", async (c) => {
  const memberId = c.get("memberId");
  const subscriptionId = pathId(c, "subscriptionId");
  await db().transaction(async (tx) => {
    await findOwnedSubscription(tx, memberId, subscriptionId);
    await tx.delete(subscription).where(eq(subscription.id, subscriptionId));
  });
  return c.body(null, 204);
});
