/**
 * 내 선택지 5종 (FR-PLT-01~04).
 * 플랫폼·플랫폼 계정·기기·에뮬레이터·입력 방식. **물리 삭제가 없다**
 * (회차·취득이 참조하므로 deletedAt만 찍는다 — §7.4).
 *
 * 조회 쪽(`findOne`·`findSelectable`)은 다른 도메인도 쓰므로 `service.ts`에 있다.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { device, emulator, inputMethod, platform, platformAccount } from "../../db/schema";
import { readBody, violations, DEFAULT_MSG } from "../../http/body";
import { pathId } from "../../http/params";
import { Conflict, InvalidInput, Revivable } from "../../common/errors";
import { normalize, require as requireText } from "../../common/text";
import { nowKst } from "../../common/clock";
import { opt, zLong, zText } from "../../common/schemas";
import {
  NOT_FOUND, accountFindOne, findAccountRow, findDeviceRow, findEmulatorRow, findInputMethodRow,
  findPlatformRow, platformFindAlive, emulatorFindOne, requireAlive,
} from "./service";

export const routes = new Hono();

// ───────────── 공통 ─────────────

const CatalogNameRequest = z.object({ name: opt(zText) });
const DeviceRequest = z.object({
  deviceType: opt(zText),
  label: opt(zText),
  memo: opt(zText),
});
const EmulatorRequest = z.object({ name: opt(zText), memo: opt(zText) });
const PlatformAccountCreateRequest = z.object({
  platformId: opt(zLong),
  emulatorId: opt(zLong),
  accountLabel: opt(zText),
});
const PlatformAccountRenameRequest = z.object({ accountLabel: opt(zText) });

/**
 * 공백뿐이면 비었다고 본다. ⚠️ Hibernate Validator의 `@NotBlank`는 `trim()`(U+0020 이하)이 아니라
 * `Character.isWhitespace` 기준이라 전각 공백(U+3000)만 있어도 걸린다. 그래서 `normalize`로 본다
 */
const blank = (v: string | null) => normalize(v) === null;

/** 이름: 비면 안 되고 50자 이하 */
function checkName(field: string, v: string | null) {
  return violations()
    .when(blank(v), field, DEFAULT_MSG.notBlank)
    .size(field, v, 0, 50, DEFAULT_MSG.size(0, 50));
}

function createdJson(c: Context, base: string, id: number) {
  c.header("Location", `${base}/${id}`);
  return c.json({ id }, 201);
}

// ───────────── 플랫폼 ─────────────

routes.post("/api/me/platforms", async (c) => {
  const r = await readBody(c, CatalogNameRequest);
  checkName("name", r.name).throwIfAny();
  const id = await db().transaction(async (tx) => {
    const name = requireText(r.name, "플랫폼 이름은 비울 수 없습니다");
    const [found] = await tx.select().from(platform)
      .where(eq(platform.name, name));
    if (found) {
      if (found.deletedAt === null) throw new Conflict(`이미 있는 플랫폼입니다: ${name}`);
      // 지웠던 이름을 다시 넣으면 되살린다 — 유니크가 이름에 걸려 있어 삭제된 행도 자리를 차지한다
      await tx.update(platform).set({ deletedAt: null, updatedAt: nowKst() }).where(eq(platform.id, found.id));
      return found.id;
    }
    const now = nowKst();
    const [row] = await tx.insert(platform)
      .values({ name, deletedAt: null, createdAt: now, updatedAt: now })
      .returning({ id: platform.id });
    return row!.id;
  });
  return createdJson(c, "/api/me/platforms", id);
});

routes.put("/api/me/platforms/:platformId", async (c) => {
  const platformId = pathId(c, "platformId");
  const r = await readBody(c, CatalogNameRequest);
  checkName("name", r.name).throwIfAny();
  await db().transaction(async (tx) => {
    const p = requireAlive(await findPlatformRow(tx, platformId),
      `${NOT_FOUND.platform}. id=${platformId}`, (x) => x.name);
    const name = requireText(r.name, "플랫폼 이름은 비울 수 없습니다");
    // 중복 검사를 변경보다 먼저
    const [other] = await tx.select({ id: platform.id }).from(platform)
      .where(eq(platform.name, name));
    if (other && other.id !== platformId) throw new Conflict(`이미 있는 플랫폼입니다: ${name}`);
    if (p.name !== name) {
      await tx.update(platform).set({ name, updatedAt: nowKst() }).where(eq(platform.id, platformId));
    }
  });
  return c.body(null, 200);
});

routes.delete("/api/me/platforms/:platformId", async (c) => {
  const platformId = pathId(c, "platformId");
  await db().transaction(async (tx) => {
    requireAlive(await findPlatformRow(tx, platformId),
      `${NOT_FOUND.platform}. id=${platformId}`, (x) => x.name);
    const now = nowKst();
    // 딸린 계정도 함께 닫는다 — 플랫폼만 지우면 주인 없는 계정이 선택지에 남는다
    await tx.update(platformAccount).set({ deletedAt: now, updatedAt: now })
      .where(and(eq(platformAccount.platformId, platformId), isNull(platformAccount.deletedAt)));
    await tx.update(platform).set({ deletedAt: now, updatedAt: now }).where(eq(platform.id, platformId));
  });
  return c.body(null, 204);
});

// ───────────── 입력 방식 ─────────────

routes.post("/api/me/input-methods", async (c) => {
  const r = await readBody(c, CatalogNameRequest);
  checkName("name", r.name).throwIfAny();
  const id = await db().transaction(async (tx) => {
    const name = requireText(r.name, "입력 방식 이름은 비울 수 없습니다");
    const [found] = await tx.select().from(inputMethod)
      .where(eq(inputMethod.name, name));
    if (found) {
      if (found.deletedAt === null) throw new Conflict(`이미 있는 입력 방식입니다: ${name}`);
      await tx.update(inputMethod).set({ deletedAt: null, updatedAt: nowKst() }).where(eq(inputMethod.id, found.id));
      return found.id;
    }
    const now = nowKst();
    const [row] = await tx.insert(inputMethod)
      .values({ name, deletedAt: null, createdAt: now, updatedAt: now })
      .returning({ id: inputMethod.id });
    return row!.id;
  });
  return createdJson(c, "/api/me/input-methods", id);
});

routes.put("/api/me/input-methods/:inputMethodId", async (c) => {
  const inputMethodId = pathId(c, "inputMethodId");
  const r = await readBody(c, CatalogNameRequest);
  checkName("name", r.name).throwIfAny();
  await db().transaction(async (tx) => {
    const m = requireAlive(await findInputMethodRow(tx, inputMethodId),
      `${NOT_FOUND.inputMethod}. id=${inputMethodId}`, (x) => x.name);
    const name = requireText(r.name, "입력 방식 이름은 비울 수 없습니다");
    const [other] = await tx.select({ id: inputMethod.id }).from(inputMethod)
      .where(eq(inputMethod.name, name));
    if (other && other.id !== inputMethodId) throw new Conflict(`이미 있는 입력 방식입니다: ${name}`);
    if (m.name !== name) {
      await tx.update(inputMethod).set({ name, updatedAt: nowKst() }).where(eq(inputMethod.id, inputMethodId));
    }
  });
  return c.body(null, 200);
});

routes.delete("/api/me/input-methods/:inputMethodId", async (c) => {
  const inputMethodId = pathId(c, "inputMethodId");
  await db().transaction(async (tx) => {
    requireAlive(await findInputMethodRow(tx, inputMethodId),
      `${NOT_FOUND.inputMethod}. id=${inputMethodId}`, (x) => x.name);
    const now = nowKst();
    await tx.update(inputMethod).set({ deletedAt: now, updatedAt: now }).where(eq(inputMethod.id, inputMethodId));
  });
  return c.body(null, 204);
});

// ───────────── 기기 ─────────────

function checkDevice(r: z.output<typeof DeviceRequest>) {
  return violations()
    .when(blank(r.deviceType), "deviceType", DEFAULT_MSG.notBlank)
    .size("deviceType", r.deviceType, 0, 50, DEFAULT_MSG.size(0, 50))
    .when(blank(r.label), "label", DEFAULT_MSG.notBlank)
    .size("label", r.label, 0, 50, DEFAULT_MSG.size(0, 50))
    .size("memo", r.memo, 0, 2000, DEFAULT_MSG.size(0, 2000));
}

/** 유형 → 라벨 순으로 검사한다 — 둘 다 비면 유형 메시지가 먼저 나간다 */
function applyDevice(r: z.output<typeof DeviceRequest>) {
  return {
    deviceType: requireText(r.deviceType, "기기 유형은 비울 수 없습니다"),
    label: requireText(r.label, "기기 라벨은 비울 수 없습니다"),
    memo: normalize(r.memo),
  };
}

routes.post("/api/me/devices", async (c) => {
  const r = await readBody(c, DeviceRequest);
  checkDevice(r).throwIfAny();
  const id = await db().transaction(async (tx) => {
    const label = requireText(r.label, "기기 라벨은 비울 수 없습니다");
    const [found] = await tx.select().from(device)
      .where(eq(device.label, label));
    if (found) {
      if (found.deletedAt === null) throw new Conflict(`이미 있는 기기입니다: ${label}`);
      // 지웠던 라벨을 다시 넣으면 되살리고 유형·메모를 새 값으로 덮는다
      const v = applyDevice(r);
      await tx.update(device).set({ ...v, deletedAt: null, updatedAt: nowKst() }).where(eq(device.id, found.id));
      return found.id;
    }
    const v = applyDevice(r);
    const now = nowKst();
    const [row] = await tx.insert(device)
      .values({ ...v, deletedAt: null, createdAt: now, updatedAt: now })
      .returning({ id: device.id });
    return row!.id;
  });
  return createdJson(c, "/api/me/devices", id);
});

routes.put("/api/me/devices/:deviceId", async (c) => {
  const deviceId = pathId(c, "deviceId");
  const r = await readBody(c, DeviceRequest);
  checkDevice(r).throwIfAny();
  await db().transaction(async (tx) => {
    const cur = requireAlive(await findDeviceRow(tx, deviceId),
      `${NOT_FOUND.device}. id=${deviceId}`, (x) => x.label);
    const label = requireText(r.label, "기기 라벨은 비울 수 없습니다");
    // 중복 검사를 변경보다 먼저 — 라벨에 유니크 제약이 걸려 있다
    const [other] = await tx.select({ id: device.id }).from(device)
      .where(eq(device.label, label));
    if (other && other.id !== deviceId) throw new Conflict(`이미 있는 기기입니다: ${label}`);
    const v = applyDevice(r);
    if (cur.deviceType !== v.deviceType || cur.label !== v.label || cur.memo !== v.memo) {
      await tx.update(device).set({ ...v, updatedAt: nowKst() }).where(eq(device.id, deviceId));
    }
  });
  return c.body(null, 200);
});

routes.delete("/api/me/devices/:deviceId", async (c) => {
  const deviceId = pathId(c, "deviceId");
  await db().transaction(async (tx) => {
    requireAlive(await findDeviceRow(tx, deviceId),
      `${NOT_FOUND.device}. id=${deviceId}`, (x) => x.label);
    const now = nowKst();
    await tx.update(device).set({ deletedAt: now, updatedAt: now }).where(eq(device.id, deviceId));
  });
  return c.body(null, 204);
});

// ───────────── 에뮬레이터 ─────────────

function checkEmulator(r: z.output<typeof EmulatorRequest>) {
  return violations()
    .when(blank(r.name), "name", DEFAULT_MSG.notBlank)
    .size("name", r.name, 0, 50, DEFAULT_MSG.size(0, 50))
    .size("memo", r.memo, 0, 2000, DEFAULT_MSG.size(0, 2000));
}

routes.post("/api/me/emulators", async (c) => {
  const r = await readBody(c, EmulatorRequest);
  checkEmulator(r).throwIfAny();
  const id = await db().transaction(async (tx) => {
    const name = requireText(r.name, "에뮬레이터 이름은 비울 수 없습니다");
    const memo = normalize(r.memo);
    const [found] = await tx.select().from(emulator)
      .where(eq(emulator.name, name));
    if (found) {
      if (found.deletedAt === null) throw new Conflict(`이미 있는 에뮬레이터입니다: ${name}`);
      await tx.update(emulator).set({ name, memo, deletedAt: null, updatedAt: nowKst() }).where(eq(emulator.id, found.id));
      return found.id;
    }
    const now = nowKst();
    const [row] = await tx.insert(emulator)
      .values({ name, memo, deletedAt: null, createdAt: now, updatedAt: now })
      .returning({ id: emulator.id });
    return row!.id;
  });
  return createdJson(c, "/api/me/emulators", id);
});

routes.put("/api/me/emulators/:emulatorId", async (c) => {
  const emulatorId = pathId(c, "emulatorId");
  const r = await readBody(c, EmulatorRequest);
  checkEmulator(r).throwIfAny();
  await db().transaction(async (tx) => {
    const cur = requireAlive(await findEmulatorRow(tx, emulatorId),
      `${NOT_FOUND.emulator}. id=${emulatorId}`, (x) => x.name);
    const name = requireText(r.name, "에뮬레이터 이름은 비울 수 없습니다");
    const [other] = await tx.select({ id: emulator.id }).from(emulator)
      .where(eq(emulator.name, name));
    if (other && other.id !== emulatorId) throw new Conflict(`이미 있는 에뮬레이터입니다: ${name}`);
    const memo = normalize(r.memo);
    if (cur.name !== name || cur.memo !== memo) {
      await tx.update(emulator).set({ name, memo, updatedAt: nowKst() }).where(eq(emulator.id, emulatorId));
    }
  });
  return c.body(null, 200);
});

routes.delete("/api/me/emulators/:emulatorId", async (c) => {
  const emulatorId = pathId(c, "emulatorId");
  await db().transaction(async (tx) => {
    requireAlive(await findEmulatorRow(tx, emulatorId),
      `${NOT_FOUND.emulator}. id=${emulatorId}`, (x) => x.name);
    const now = nowKst();
    // 플랫폼 삭제와 같게 딸린 계정도 닫는다 — 남겨두면 내보낸 세이브가 가져오기에서 깨진다
    // ("계정이 가리키는 에뮬레이터가 백업에 없습니다")
    await tx.update(platformAccount).set({ deletedAt: now, updatedAt: now })
      .where(and(eq(platformAccount.emulatorId, emulatorId), isNull(platformAccount.deletedAt)));
    await tx.update(emulator).set({ deletedAt: now, updatedAt: now }).where(eq(emulator.id, emulatorId));
  });
  return c.body(null, 204);
});

// ───────────── 플랫폼 계정 ─────────────

/** 소속 키 — `P12` 또는 `E3`. 유니크 제약용이라 밖으로 안 내보낸다 */
const ownerKeyOf = (platformId: number | null, emulatorId: number | null) =>
  platformId !== null ? `P${platformId}` : `E${emulatorId}`;

routes.post("/api/me/platform-accounts", async (c) => {
  const r = await readBody(c, PlatformAccountCreateRequest);
  checkName("accountLabel", r.accountLabel).throwIfAny();
  const id = await db().transaction(async (tx) => {
    if ((r.platformId === null) === (r.emulatorId === null)) {
      throw new InvalidInput("플랫폼이나 에뮬레이터 중 하나만 골라 주세요");
    }
    const p = r.platformId === null ? null : await platformFindAlive(tx, r.platformId);
    // ⚠️ 에뮬레이터는 삭제된 것도 받는다 — 삭제된 에뮬레이터에도 계정이 생긴다 (알려진 버그 6, `docs/v2-plan.md`)
    const e = r.emulatorId === null ? null : await emulatorFindOne(tx, r.emulatorId);

    const label = requireText(r.accountLabel, "계정 라벨은 비울 수 없습니다");
    const ownerKey = ownerKeyOf(p?.id ?? null, e?.id ?? null);

    const [found] = await tx.select().from(platformAccount).where(and(
      eq(platformAccount.ownerKey, ownerKey),
      eq(platformAccount.accountLabel, label)));
    if (found) {
      // 나머지 선택지와 달리 되살리기를 조용히 하지 않고 409로 되묻는다 — 취득 기록까지 물고 있다 (§7.4)
      if (found.deletedAt !== null) {
        throw new Revivable(`삭제된 플랫폼 계정이 있습니다. 복원하시겠습니까? id=${found.id}`,
          found.id, `/api/me/platform-accounts/${found.id}/revive`);
      }
      throw new Conflict(`이미 등록된 계정입니다: ${label}`);
    }

    const now = nowKst();
    const [row] = await tx.insert(platformAccount)
      .values({
        platformId: p?.id ?? null, emulatorId: e?.id ?? null, ownerKey,
        accountLabel: label, deletedAt: null, createdAt: now, updatedAt: now,
      })
      .returning({ id: platformAccount.id });
    return row!.id;
  });
  return createdJson(c, "/api/me/platform-accounts", id);
});

routes.put("/api/me/platform-accounts/:accountId", async (c) => {
  const accountId = pathId(c, "accountId");
  const r = await readBody(c, PlatformAccountRenameRequest);
  checkName("accountLabel", r.accountLabel).throwIfAny();
  await db().transaction(async (tx) => {
    const a = requireAlive(await findAccountRow(tx, accountId),
      `${NOT_FOUND.account}. id=${accountId}`, (x) => x.accountLabel);
    const label = requireText(r.accountLabel, "계정 라벨은 비울 수 없습니다");
    const [other] = await tx.select({ id: platformAccount.id }).from(platformAccount).where(and(
      eq(platformAccount.ownerKey, a.ownerKey),
      eq(platformAccount.accountLabel, label)));
    if (other && other.id !== accountId) throw new Conflict(`이미 있는 계정 라벨입니다: ${label}`);
    if (a.accountLabel !== label) {
      await tx.update(platformAccount).set({ accountLabel: label, updatedAt: nowKst() })
        .where(eq(platformAccount.id, accountId));
    }
  });
  return c.body(null, 200);
});

routes.delete("/api/me/platform-accounts/:accountId", async (c) => {
  const accountId = pathId(c, "accountId");
  await db().transaction(async (tx) => {
    requireAlive(await findAccountRow(tx, accountId),
      `${NOT_FOUND.account}. id=${accountId}`, (x) => x.accountLabel);
    const now = nowKst();
    await tx.update(platformAccount).set({ deletedAt: now, updatedAt: now }).where(eq(platformAccount.id, accountId));
  });
  return c.body(null, 204);
});

routes.post("/api/me/platform-accounts/:accountId/revive", async (c) => {
  const accountId = pathId(c, "accountId");
  await db().transaction(async (tx) => {
    const a = await accountFindOne(tx, accountId);
    if (a.deletedAt === null) throw new Conflict(`삭제되지 않았습니다: ${a.accountLabel}`);
    // ⚠️ 부모 플랫폼이 삭제돼 있어도 되살린다 (알려진 버그 5, `docs/v2-plan.md`)
    await tx.update(platformAccount).set({ deletedAt: null, updatedAt: nowKst() })
      .where(eq(platformAccount.id, accountId));
  });
  return c.body(null, 200);
});
