/**
 * 취득 (FR-ACQ-01~06) — 자바 `AcquisitionService` + `Acquisition` 엔티티.
 * 형제 검증이 없다 — 재구매도 DLC도 별도 행이 정상이다
 */
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { acquisition } from "../../db/schema";
import { InvalidInput, NotFound } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { money } from "../../common/money";
import { normalize } from "../../common/text";
import { findOwnedSubscription } from "../subscription/routes";
import { deriveState, findOwned, playthroughsOf, saveEntryIfChanged, saveIfChanged, type EntryRow } from "./shared";
import { belongsTo, findAccount, findPlatform } from "./refs";

export interface AcquisitionCommand {
  method: string | null;
  platformId: number | null;
  platformAccountId: number | null;
  subscriptionId: number | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  acquiredOn: string | null;
  label: string | null;
}

/** `Acquisition.apply`. SUBSCRIPTION인데 연결이 없는 건 허용한다 — 제약 최소화 */
function apply(cmd: AcquisitionCommand) {
  if (cmd.method === null) throw new InvalidInput("취득 방식은 필수입니다");
  if (cmd.subscriptionId !== null && cmd.method !== "SUBSCRIPTION") {
    throw new InvalidInput("취득 방식이 SUBSCRIPTION일 때만 구독을 연결할 수 있습니다");
  }
  const price = cmd.priceAmount === null ? null : money(cmd.priceAmount, cmd.priceCurrency);
  return {
    method: cmd.method,
    priceAmount: price?.amount ?? null,
    priceCurrency: price?.currency ?? null,
    acquiredOn: cmd.acquiredOn,
    label: normalize(cmd.label),
  };
}

/** 남의 것은 못 붙인다. 취득에는 에뮬이 없어서 계정은 플랫폼 쪽만 본다 */
async function resolveReferences(d: Db, ownerId: number, cmd: AcquisitionCommand) {
  const plat = cmd.platformId === null ? null : await findPlatform(d, ownerId, cmd.platformId);
  const account = cmd.platformAccountId === null ? null : await findAccount(d, ownerId, cmd.platformAccountId);
  if (account !== null && plat !== null && !belongsTo(account, plat.id, null)) {
    throw new InvalidInput("계정이 고른 플랫폼의 것이 아닙니다");
  }
  const sub = cmd.subscriptionId === null ? null : await findOwnedSubscription(d, ownerId, cmd.subscriptionId);
  return { platformId: plat?.id ?? null, platformAccountId: account?.id ?? null, subscriptionId: sub?.id ?? null };
}

async function syncEntry(d: Db, entry: EntryRow, hasAcquisition: boolean) {
  await saveEntryIfChanged(d, entry, deriveState(await playthroughsOf(d, entry.id), hasAcquisition));
}

export async function addAcquisition(d: Db, memberId: number, entryId: number, cmd: AcquisitionCommand): Promise<number> {
  const entry = await findOwned(d, memberId, entryId);
  const v = apply(cmd);
  const refs = await resolveReferences(d, entry.memberId, cmd);
  const now = nowKst();
  const [row] = await d.insert(acquisition)
    .values({ backlogEntryId: entryId, ...v, ...refs, createdAt: now, updatedAt: now })
    .returning({ id: acquisition.id });
  await syncEntry(d, entry, true);
  return row!.id;
}

async function findOwnedAcquisition(d: Db, memberId: number, acquisitionId: number) {
  const [a] = await d.select().from(acquisition).where(eq(acquisition.id, acquisitionId));
  if (!a) throw new NotFound(`취득 기록을 찾을 수 없습니다. id=${acquisitionId}`);
  const entry = await findOwned(d, memberId, a.backlogEntryId);
  return { a, entry };
}

export async function updateAcquisition(d: Db, memberId: number, acquisitionId: number, cmd: AcquisitionCommand) {
  const { a, entry } = await findOwnedAcquisition(d, memberId, acquisitionId);
  const v = apply(cmd);
  const refs = await resolveReferences(d, entry.memberId, cmd);
  await saveIfChanged(d, a, { ...v, ...refs }, (patch) => d.update(acquisition).set(patch).where(eq(acquisition.id, a.id)));
  // 취득이 남아 있는 건 그대로라 상태는 회차 쪽만 다시 본다 (드리프트가 있으면 여기서 맞춰진다)
  await syncEntry(d, entry, true);
}

export async function deleteAcquisition(d: Db, memberId: number, acquisitionId: number) {
  const { a, entry } = await findOwnedAcquisition(d, memberId, acquisitionId);
  const remaining = (await d.select({ id: acquisition.id }).from(acquisition).where(eq(acquisition.backlogEntryId, entry.id)))
    .filter((x) => x.id !== a.id).length;
  await syncEntry(d, entry, remaining > 0);
  await d.delete(acquisition).where(eq(acquisition.id, a.id));
}
