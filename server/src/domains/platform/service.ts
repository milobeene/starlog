/**
 * 선택지 5종(플랫폼·계정·기기·에뮬레이터·입력방식)의 조회 — **다른 도메인이 쓰는 부분**.
 * 백로그(취득·회차)와 member(내 정보·옵션)가 가져다 쓴다. 쓰기는 `routes.ts`.
 *
 * 첫 인자가 `Db`라 트랜잭션(tx)도 그대로 넘길 수 있다.
 */
import { asc, eq, isNull, sql } from "drizzle-orm";
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

type SoftDeleted = { deletedAt: string | null };

/** 삭제된 것도 돌려준다. 과거 기록에 붙은 항목을 읽을 때 필요하다 */
export function requireFound<T>(row: T | undefined, message: string): T {
  if (!row) throw new NotFound(message);
  return row;
}

/** 수정·삭제 대상. 이미 지운 것을 또 만지려는 요청을 끊는다 */
export function requireAlive<T extends SoftDeleted>(
  row: T | undefined, message: string, displayName: (r: T) => string,
): T {
  const r = requireFound(row, message);
  if (r.deletedAt !== null) throw new Conflict(`이미 삭제되었습니다: ${displayName(r)}`);
  return r;
}

// ───────────── 플랫폼 ─────────────

export async function findPlatformRow(d: Db, id: number) {
  const [row] = await d.select().from(platform).where(eq(platform.id, id));
  return row;
}

/** 취득에 붙일 때. 삭제된 것도 돌려준다 */
export async function platformFindOne(d: Db, platformId: number): Promise<PlatformRow> {
  return requireFound(await findPlatformRow(d, platformId), `${NOT_FOUND.platform}. id=${platformId}`);
}

/** 계정을 붙일 때 쓴다. 삭제된 플랫폼에는 새 계정을 못 만든다 */
export async function platformFindAlive(d: Db, platformId: number): Promise<PlatformRow> {
  return requireAlive(await findPlatformRow(d, platformId),
    `${NOT_FOUND.platform}. id=${platformId}`, (r) => r.name);
}

export async function platformFindSelectable(d: Db): Promise<PlatformRow[]> {
  return d.select().from(platform)
    .where(isNull(platform.deletedAt))
    .orderBy(asc(platform.name));
}

// ───────────── 플랫폼 계정 ─────────────

export async function findAccountRow(d: Db, id: number) {
  const [row] = await d.select().from(platformAccount).where(eq(platformAccount.id, id));
  return row;
}

/** 삭제된 것 포함. 과거 기록에 붙은 계정을 보여줄 때 쓴다 */
export async function accountFindOne(d: Db, accountId: number): Promise<PlatformAccountRow> {
  return requireFound(await findAccountRow(d, accountId), `${NOT_FOUND.account}. id=${accountId}`);
}

export type SelectableAccount = PlatformAccountRow & {
  platform: PlatformRow | null;
  emulator: EmulatorRow | null;
};

/**
 * 회차·취득 입력 시 고를 수 있는 계정. 삭제된 건 빠진다.
 * 소속(플랫폼 또는 에뮬) 이름 → 라벨 → id 순으로 정렬한다
 */
export async function accountFindSelectable(d: Db): Promise<SelectableAccount[]> {
  const rows = await d.select({ a: platformAccount, p: platform, e: emulator })
    .from(platformAccount)
    .leftJoin(platform, eq(platformAccount.platformId, platform.id))
    .leftJoin(emulator, eq(platformAccount.emulatorId, emulator.id))
    .where(isNull(platformAccount.deletedAt))
    .orderBy(sql`coalesce(${platform.name}, ${emulator.name}) asc`, asc(platformAccount.accountLabel), asc(platformAccount.id));
  return rows.map((r) => ({ ...r.a, platform: r.p, emulator: r.e }));
}

// ───────────── 기기 ─────────────

export async function findDeviceRow(d: Db, id: number) {
  const [row] = await d.select().from(device).where(eq(device.id, id));
  return row;
}

/** 삭제된 기기도 돌려준다 — 그 기기로 했던 과거 회차를 수정할 수 있어야 한다 */
export async function deviceFindOne(d: Db, deviceId: number): Promise<DeviceRow> {
  return requireFound(await findDeviceRow(d, deviceId), `${NOT_FOUND.device}. id=${deviceId}`);
}

export async function deviceFindSelectable(d: Db): Promise<DeviceRow[]> {
  return d.select().from(device)
    .where(isNull(device.deletedAt))
    .orderBy(asc(device.label));
}

/** 선택지에 찍히는 이름 */
export const deviceOptionLabel = (r: Pick<DeviceRow, "label" | "deviceType">) =>
  r.label === r.deviceType ? r.label : `${r.label} (${r.deviceType})`;

// ───────────── 에뮬레이터 ─────────────

export async function findEmulatorRow(d: Db, id: number) {
  const [row] = await d.select().from(emulator).where(eq(emulator.id, id));
  return row;
}

/** 삭제된 것도 돌려준다 */
export async function emulatorFindOne(d: Db, emulatorId: number): Promise<EmulatorRow> {
  return requireFound(await findEmulatorRow(d, emulatorId), `${NOT_FOUND.emulator}. id=${emulatorId}`);
}

export async function emulatorFindSelectable(d: Db): Promise<EmulatorRow[]> {
  return d.select().from(emulator)
    .where(isNull(emulator.deletedAt))
    .orderBy(asc(emulator.name));
}

// ───────────── 입력 방식 ─────────────

export async function findInputMethodRow(d: Db, id: number) {
  const [row] = await d.select().from(inputMethod).where(eq(inputMethod.id, id));
  return row;
}

/** 삭제된 것도 돌려준다 */
export async function inputMethodFindOne(d: Db, inputMethodId: number): Promise<InputMethodRow> {
  return requireFound(await findInputMethodRow(d, inputMethodId),
    `${NOT_FOUND.inputMethod}. id=${inputMethodId}`);
}

export async function inputMethodFindSelectable(d: Db): Promise<InputMethodRow[]> {
  return d.select().from(inputMethod)
    .where(isNull(inputMethod.deletedAt))
    .orderBy(asc(inputMethod.name));
}
