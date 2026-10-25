/**
 * 구독 (FR-ACQ-04).
 * 취득이 SUBSCRIPTION일 때 여기 연결된다 (FR-ACQ-05). 서비스명은 마스터가 아니라 문자열 (OI-06).
 *
 * 구독은 **물리 삭제**다 (§7.4). 취득이 참조 중이면 FK 위반 → 409 — 앱에서 막지 않고 DB에 맡긴다.
 */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, type Db } from "../../db/client";
import { subscription } from "../../db/schema";
import { readBody, violations, DEFAULT_MSG } from "../../http/body";
import { pathId } from "../../http/params";
import { InvalidInput, NotFound } from "../../common/errors";
import { normalize } from "../../common/text";
import { money } from "../../common/money";
import { nowKst } from "../../common/clock";
import { opt, zDate, zMoney, zText } from "../../common/schemas";
import { saveIfChanged } from "../../db/changes";

export const BILLING_CYCLES = ["MONTHLY", "YEARLY"] as const;

const SubscriptionRequest = z.object({
  serviceName: opt(zText),
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

/** 검증 순서와 메시지를 바꾸지 않는다 — 화면이 메시지를 그대로 보여준다 */
function apply(r: SubscriptionRequest) {
  const serviceName = normalize(r.serviceName);
  if (serviceName === null) throw new InvalidInput("구독 서비스명은 필수입니다");
  if (r.startedOn === null) throw new InvalidInput("구독 시작일은 필수입니다");
  if (r.billingCycle === null) throw new InvalidInput("결제 주기는 필수입니다");
  // 회차의 BR-PT-01과 같은 규칙. 당일 종료도 유효
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

/** 없으면 404. 취득이 구독을 연결할 때도 쓴다 */
export async function findSubscription(d: Db, subscriptionId: number) {
  const [row] = await d.select().from(subscription).where(eq(subscription.id, subscriptionId));
  if (!row) throw new NotFound(`구독을 찾을 수 없습니다. id=${subscriptionId}`);
  return row;
}

export const routes = new Hono();

routes.post("/api/me/subscriptions", async (c) => {
  const r = await readBody(c, SubscriptionRequest);
  validate(r);
  const id = await db().transaction(async (tx) => {
    const v = apply(r);
    const now = nowKst();
    const [row] = await tx.insert(subscription)
      .values({ ...v, createdAt: now, updatedAt: now })
      .returning({ id: subscription.id });
    return row!.id;
  });
  c.header("Location", `/api/me/subscriptions/${id}`);
  return c.json({ id }, 201);
});

routes.put("/api/me/subscriptions/:subscriptionId", async (c) => {
  const subscriptionId = pathId(c, "subscriptionId");
  const r = await readBody(c, SubscriptionRequest);
  validate(r);
  await db().transaction(async (tx) => {
    const before = await findSubscription(tx, subscriptionId);
    const v = apply(r);
    // 같은 값으로 저장하면 `updated_at`도 그대로 (원칙 7)
    await saveIfChanged(tx, before, v, (patch) => tx.update(subscription).set(patch).where(eq(subscription.id, subscriptionId)),
      ["feeAmount"]);
  });
  return c.body(null, 200);
});

routes.delete("/api/me/subscriptions/:subscriptionId", async (c) => {
  const subscriptionId = pathId(c, "subscriptionId");
  await db().transaction(async (tx) => {
    await findSubscription(tx, subscriptionId);
    await tx.delete(subscription).where(eq(subscription.id, subscriptionId));
  });
  return c.body(null, 204);
});
