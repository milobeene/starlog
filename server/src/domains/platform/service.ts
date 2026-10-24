/**
 * 선택지 5종의 조회 서비스 — 자바 `PlatformService`·`PlatformAccountService`·`DeviceService`·
 * `EmulatorService`·`InputMethodService`·`OwnedCatalog`의 **다른 도메인이 쓰는 부분**.
 * 백로그(취득·회차)와 member(내 정보·옵션)가 가져다 쓴다. 쓰기는 `routes.ts`.
 *
 * 첫 인자가 `Db`라 트랜잭션(tx)도 그대로 넘길 수 있다.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { device, emulator, inputMethod, platform, platformAccount } from "../../db/schema";
import { Conflict, NotFound } from "../../common/errors";

export type PlatformRow = typeof platform.$inferSelect;
export type PlatformAccountRow = typeof platformAccount.$inferSelect;
export type DeviceRow = typeof device.$inferSelect;
export type EmulatorRow = typeof emulator.$inferSelect;
export type InputMethodRow = typeof inputMethod.$inferSelect;

export const NOT_FOUND = {
  platform: "플랫폼을 찾을 수 없습니다",
  account: "플랫폼 계정을 찾을 수 없습니다",
  device: "기기를 찾을 수 없습니다",
  emulator: "에뮬레이터를 찾을 수 없습니다",
  inputMethod: "입력 방식을 찾을 수 없습니다",
} as const;

type Owned = { memberId: number; deletedAt: string | null };

/**
 * 삭제된 것도 돌려준다 (`OwnedCatalog.require`). 과거 기록에 붙은 항목을 읽을 때 필요하다.
 * "없음"과 "남의 것"을 같은 404로 뭉갠다 (NFR-S7)
 */
export function requireOwned<T extends Owned>(row: T | undefined, memberId: number, message: string): T {
  if (!row || row.memberId !== memberId) throw new NotFound(message);
  return row;
}

/** 수정·삭제 대상 (`OwnedCatalog.requireAlive`). 이미 지운 것을 또 만지려는 요청을 끊는다 */
export function requireAlive<T extends Owned>(
  row: T | undefined, memberId: number, message: string, displayName: (r: T) => string,
): T {
  const r = requireOwned(row, memberId, message);
  if (r.deletedAt !== null) throw new Conflict(`이미 삭제되었습니다: ${displayName(r)}`);
  return r;
}

// ───────────── 플랫폼 ─────────────

export async function findPlatformRow(d: Db, id: number) {
  const [row] = await d.select().from(platform).where(eq(platform.id, id));
  return row;
}

/** 취득에 붙일 때. 삭제된 것도 돌려준다 */
export async function platformFindOne(d: Db, memberId: number, platformId: number): Promise<PlatformRow> {
  return requireOwned(await findPlatformRow(d, platformId), memberId, `${NOT_FOUND.platform}. id=${platformId}`);
}

/** 계정을 붙일 때 쓴다. 삭제된 플랫폼에는 새 계정을 못 만든다 */
export async function platformFindAlive(d: Db, memberId: number, platformId: number): Promise<PlatformRow> {
  return requireAlive(await findPlatformRow(d, platformId), memberId,
    `${NOT_FOUND.platform}. id=${platformId}`, (r) => r.name);
}

export async function platformFindSelectable(d: Db, memberId: number): Promise<PlatformRow[]> {
  return d.select().from(platform)
    .where(and(eq(platform.memberId, memberId), isNull(platform.deletedAt)))
    .orderBy(asc(platform.name));
}

// ───────────── 플랫폼 계정 ─────────────

export async function findAccountRow(d: Db, id: number) {
  const [row] = await d.select().from(platformAccount).where(eq(platformAccount.id, id));
  return row;
}

/** 삭제된 것 포함. 과거 기록에 붙은 계정을 보여줄 때 쓴다 */
export async function accountFindOne(d: Db, memberId: number, accountId: number): Promise<PlatformAccountRow> {
  return requireOwned(await findAccountRow(d, accountId), memberId, `${NOT_FOUND.account}. id=${accountId}`);
}

export type SelectableAccount = PlatformAccountRow & {
  platform: PlatformRow | null;
  emulator: EmulatorRow | null;
};

/**
 * 회차·취득 입력 시 고를 수 있는 계정. 삭제된 건 빠진다.
 * 소속(플랫폼 또는 에뮬) 이름으로 묶어 정렬한다 — 자바 JPQL `order by coalesce(p.name, e.name), accountLabel, id`
 */
export async function accountFindSelectable(d: Db, memberId: number): Promise<SelectableAccount[]> {
  const rows = await d.select({ a: platformAccount, p: platform, e: emulator })
    .from(platformAccount)
    .leftJoin(platform, eq(platformAccount.platformId, platform.id))
    .leftJoin(emulator, eq(platformAccount.emulatorId, emulator.id))
    .where(and(eq(platformAccount.memberId, memberId), isNull(platformAccount.deletedAt)))
    .orderBy(sql`coalesce(${platform.name}, ${emulator.name}) asc`, asc(platformAccount.accountLabel), asc(platformAccount.id));
  return rows.map((r) => ({ ...r.a, platform: r.p, emulator: r.e }));
}

// ───────────── 기기 ─────────────

export async function findDeviceRow(d: Db, id: number) {
  const [row] = await d.select().from(device).where(eq(device.id, id));
  return row;
}

/** 삭제된 기기도 돌려준다 — 그 기기로 했던 과거 회차를 수정할 수 있어야 한다 */
export async function deviceFindOne(d: Db, memberId: number, deviceId: number): Promise<DeviceRow> {
  return requireOwned(await findDeviceRow(d, deviceId), memberId, `${NOT_FOUND.device}. id=${deviceId}`);
}

export async function deviceFindSelectable(d: Db, memberId: number): Promise<DeviceRow[]> {
  return d.select().from(device)
    .where(and(eq(device.memberId, memberId), isNull(device.deletedAt)))
    .orderBy(asc(device.label));
}

/** 선택지에 찍히는 이름 (`Device.optionLabel`) */
export const deviceOptionLabel = (r: Pick<DeviceRow, "label" | "deviceType">) =>
  r.label === r.deviceType ? r.label : `${r.label} (${r.deviceType})`;

// ───────────── 에뮬레이터 ─────────────

export async function findEmulatorRow(d: Db, id: number) {
  const [row] = await d.select().from(emulator).where(eq(emulator.id, id));
  return row;
}

/** 삭제된 것도 돌려준다 */
export async function emulatorFindOne(d: Db, memberId: number, emulatorId: number): Promise<EmulatorRow> {
  return requireOwned(await findEmulatorRow(d, emulatorId), memberId, `${NOT_FOUND.emulator}. id=${emulatorId}`);
}

export async function emulatorFindSelectable(d: Db, memberId: number): Promise<EmulatorRow[]> {
  return d.select().from(emulator)
    .where(and(eq(emulator.memberId, memberId), isNull(emulator.deletedAt)))
    .orderBy(asc(emulator.name));
}

// ───────────── 입력 방식 ─────────────

export async function findInputMethodRow(d: Db, id: number) {
  const [row] = await d.select().from(inputMethod).where(eq(inputMethod.id, id));
  return row;
}

/** 삭제된 것도 돌려준다 */
export async function inputMethodFindOne(d: Db, memberId: number, inputMethodId: number): Promise<InputMethodRow> {
  return requireOwned(await findInputMethodRow(d, inputMethodId), memberId,
    `${NOT_FOUND.inputMethod}. id=${inputMethodId}`);
}

export async function inputMethodFindSelectable(d: Db, memberId: number): Promise<InputMethodRow[]> {
  return d.select().from(inputMethod)
    .where(and(eq(inputMethod.memberId, memberId), isNull(inputMethod.deletedAt)))
    .orderBy(asc(inputMethod.name));
}
