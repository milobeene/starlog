/**
 * 항목 쓰기. 항목에 붙는 태그·장르는 tag 도메인(`changeTag`·`replaceGenres`)이 맡는다.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import {
  acquisition, backlogDeveloperOverride, backlogEntry, backlogEntryGenre, backlogPublisherOverride,
  coverImage, game, playRecord, playthrough,
} from "../../db/schema";
import { Conflict, InvalidInput, NotFound, Revivable } from "../../common/errors";
import { nowKst } from "../../common/clock";
import type { CoverLocation } from "../../common/storage";
import { bigDecimalText, compareDecimal, money, setScale, type Money } from "../../common/money";
import { normalize, normalizeAll, sortKey } from "../../common/text";
import { acquisitionCount, deriveState, findAliveEntry, findAliveEntryForUpdate, findEntryIncludingDeleted, playthroughsOf, saveEntryIfChanged } from "./shared";
import { recordPlayTimeChange, syncPlayTime, tenthsFromHours, tenthsOf } from "./playtime";
import { sameValue } from "../../db/changes";

// ───────────── 담기 (FR-BL-01) ─────────────

/**
 * 게임을 백로그에 담는다. 게임 해석(`resolveGame`)은 부르는 쪽이 **트랜잭션 밖에서** 먼저 끝낸다.
 * §7.4 3분기 — 삭제된 항목이 있으면 되살리기 제안(409 REVIVABLE), 살아 있으면 409, 없으면 새로
 */
export async function addToBacklog(d: Db, gameId: number): Promise<number> {
  const [g] = await d.select({ name: game.name, releasedOn: game.releasedOn }).from(game).where(eq(game.id, gameId));
  if (!g) throw new NotFound(`게임을 찾을 수 없습니다. id=${gameId}`);

  const [existing] = await d.select({ id: backlogEntry.id, deletedAt: backlogEntry.deletedAt }).from(backlogEntry)
    .where(eq(backlogEntry.gameId, gameId));
  if (existing) {
    if (existing.deletedAt !== null) {
      throw new Revivable(`삭제된 항목이 있습니다. 복원하시겠습니까? id=${existing.id}`, existing.id, `/api/backlog/${existing.id}/revive`);
    }
    throw new Conflict(`이미 담은 게임입니다. gameId=${gameId}`);
  }

  // 담을 때 취득 정보가 없으니 WISHLIST. 표시값은 마스터에서 (오버라이드가 아직 없다)
  const now = nowKst();
  const [row] = await d.insert(backlogEntry).values({
    gameId, status: "WISHLIST",
    displayName: g.name, displayNameSortKey: sortKey(g.name), releasedOnResolved: g.releasedOn,
    createdAt: now, updatedAt: now,
  }).returning({ id: backlogEntry.id });
  return row!.id;
}

// ───────────── 개인 기록 (FR-BL-05~07) ─────────────

/** setScale 후에 범위 검증 — 반대로 하면 반올림 결과가 검증을 빠져나간다. 메시지엔 원래 값 */
function normalizeRating(v: string | null): string | null {
  if (v === null) return null;
  const scaled = setScale(v, 1);
  if (compareDecimal(scaled, "0.0") < 0 || compareDecimal(scaled, "100.0") > 0) {
    throw new InvalidInput(`평점은 0.0 ~ 100.0 범위여야 합니다: ${bigDecimalText(v)}`);
  }
  return scaled;
}

function validatePlayTimeHours(v: string | null): string | null {
  if (v === null) return null;
  const scaled = setScale(v, 2);
  if (compareDecimal(scaled, "0") < 0 || compareDecimal(scaled, "99999.99") > 0) {
    throw new InvalidInput(`플레이 시간은 0 ~ 99999.99 범위여야 합니다: ${bigDecimalText(v)}`);
  }
  return scaled;
}

/** 화면이 보내는 합계(분). 0 ~ 99999.99시간 */
function validatePlayTimeMinutes(v: string | null): bigint | null {
  if (v === null) return null;
  const t = tenthsOf(v);
  if (t < 0n || t > tenthsFromHours("99999.99")) {
    throw new InvalidInput(`플레이 시간은 0 ~ 99999.99시간 범위여야 합니다: ${bigDecimalText(v)}분`);
  }
  return t;
}

export interface PlayTimeInput {
  /** 옛 모양 — 합계(시간). **null이면 플레이타임을 안 건드린다** (기록이 원본이라 "지움"이 없다) */
  hours: string | null;
  /** 합계(분) — 오면 `hours`보다 우선. 정수 분을 시간으로 반올림하지 않으려고 따로 받는다 */
  minutes: string | null;
  /** 이번에 한 만큼(분) → ADD 기록 */
  addMinutes: string | null;
}

/**
 * 평점·메모는 덮어쓰고, 플레이타임은 **기록으로** 남긴다 — 합계가 바뀌면 차이만큼 ADJUST, 더하기는 ADD.
 * 옛 모양(`hours`)은 지금 캐시와 같으면 안 건드린다 — 분으로 쌓인 합(140분)이 시간 캐시(2.33)로 반올림돼 있어서,
 * 그대로 되돌려 보낸 값(메모 저장)을 다시 분으로 바꿔 비교하면 0.2분짜리 가짜 수정이 생긴다
 */
export async function updatePersonalRecord(d: Db, entryId: number,
                                           rating: string | null, playTime: PlayTimeInput, memo: string | null) {
  const e = await findAliveEntryForUpdate(d, entryId);
  const scaledRating = normalizeRating(rating);
  const hours = validatePlayTimeHours(playTime.hours);
  const minutes = validatePlayTimeMinutes(playTime.minutes);
  const add = playTime.addMinutes === null ? null : tenthsOf(playTime.addMinutes);
  const target = minutes !== null ? minutes
    : hours !== null && !sameValue(hours, e.playTimeHours, true) ? tenthsFromHours(hours) : null;
  await recordPlayTimeChange(d, e, target, add);
  await syncPlayTime(d, e, { rating: scaledRating, memo: normalize(memo) });
}

// ───────────── 오버라이드 (FR-BL-03, 04) ─────────────

export interface OverrideCommand {
  name: string | null;
  developers: (string | null)[] | null;
  publishers: (string | null)[] | null;
  releasedOn: string | null;
  listPrice: Money | null;
}

/** 금액이 없으면 통째로 없는 것. 라우트에서 요청을 읽는 시점에 만들어지므로 항목 확인보다 먼저 터진다 */
export function toMoney(r: { amount?: string | number | null; currency?: string | null } | null | undefined): Money | null {
  if (r === null || r === undefined || r.amount === null || r.amount === undefined) return null;
  return money(r.amount, r.currency);
}

export async function updateOverrides(d: Db, entryId: number, cmd: OverrideCommand) {
  const e = await findAliveEntry(d, entryId);
  const [g] = await d.select({ name: game.name, releasedOn: game.releasedOn }).from(game).where(eq(game.id, e.gameId));

  const nameOverride = normalize(cmd.name);
  const displayName = nameOverride ?? g!.name;
  await saveEntryIfChanged(d, e, {
    nameOverride,
    releasedOnOverride: cmd.releasedOn,
    listPriceOverrideAmount: cmd.listPrice?.amount ?? null,
    listPriceOverrideCurrency: cmd.listPrice?.currency ?? null,
    displayName,
    displayNameSortKey: sortKey(displayName),
    releasedOnResolved: cmd.releasedOn ?? g!.releasedOn,
  });

  // 개발사·유통사는 통째로 지우고 다시 넣는다 (행 단위 diff 없음)
  await replaceValues(d, entryId, "developer", normalizeAll(cmd.developers));
  await replaceValues(d, entryId, "publisher", normalizeAll(cmd.publishers));
}

async function replaceValues(d: Db, entryId: number, kind: "developer" | "publisher", values: string[]) {
  const table = kind === "developer" ? backlogDeveloperOverride : backlogPublisherOverride;
  const existing = await d.select({ id: table.backlogEntryId }).from(table).where(eq(table.backlogEntryId, entryId));
  // 원래 비었고 넣을 것도 없으면 아무것도 안 한다 (불필요한 쓰기 방지)
  if (existing.length === 0 && values.length === 0) return;
  await d.delete(table).where(eq(table.backlogEntryId, entryId));
  if (values.length === 0) return;
  if (kind === "developer") {
    await d.insert(backlogDeveloperOverride).values(values.map((developer) => ({ backlogEntryId: entryId, developer })));
  } else {
    await d.insert(backlogPublisherOverride).values(values.map((publisher) => ({ backlogEntryId: entryId, publisher })));
  }
}

// ───────────── 삭제·되살리기·완전 삭제 (§7.4) ─────────────

/** 소프트 삭제. 회차·취득은 부모가 숨겨지면 같이 숨으므로 건드리지 않는다 */
export async function softDelete(d: Db, entryId: number) {
  const e = await findAliveEntry(d, entryId);
  await saveEntryIfChanged(d, e, { deletedAt: nowKst() });
}

/** 백지로 밀지 않는다 — deletedAt만 지우고, 드리프트에 대비해 파생 상태를 다시 계산한다 */
export async function revive(d: Db, entryId: number) {
  const e = await findEntryIncludingDeleted(d, entryId);
  if (e.deletedAt === null) throw new Conflict(`삭제되지 않은 항목입니다. id=${e.id}`);
  const derived = deriveState(await playthroughsOf(d, e.id), (await acquisitionCount(d, e.id)) > 0);
  await saveEntryIfChanged(d, e, { deletedAt: null, ...derived });
}

/**
 * 완전 삭제. **휴지통을 거친 것만** — 살아 있는 게임이 한 방에 사라지는 경로를 안 만든다.
 *
 * homeops 일정(`homeops_play_log`)은 FK의 `on delete cascade`가 지운다 — STARLOG 코드는 그 표에 쓰지 않는다.
 *
 * 순서가 전부다. 항목 ↔ 회차가 서로를 참조해서(lastPlaythrough) **항목의 참조를 먼저 끊어야**
 * 회차를 지울 수 있다. 개발사·유통사 오버라이드는 항목보다 먼저 지운다.
 *
 * @return 커밋 뒤에 지울 커버 파일 — key와 위치 (없으면 null)
 */
export async function purge(d: Db, entryId: number): Promise<{ storageKey: string; location: CoverLocation } | null> {
  const e = await findEntryIncludingDeleted(d, entryId);
  if (e.deletedAt === null) throw new Conflict(`삭제된 항목만 완전히 지울 수 있습니다. id=${entryId}`);

  const [cover] = await d.select({ storageKey: coverImage.storageKey, location: coverImage.location })
    .from(coverImage).where(eq(coverImage.backlogEntryId, entryId));

  await saveEntryIfChanged(d, e, { lastPlaythroughId: null });
  await d.delete(backlogEntryGenre).where(eq(backlogEntryGenre.backlogEntryId, entryId));
  await d.delete(coverImage).where(eq(coverImage.backlogEntryId, entryId));
  await d.delete(acquisition).where(eq(acquisition.backlogEntryId, entryId));
  await d.delete(playthrough).where(eq(playthrough.backlogEntryId, entryId));
  await d.delete(playRecord).where(eq(playRecord.backlogEntryId, entryId));
  await d.delete(backlogDeveloperOverride).where(eq(backlogDeveloperOverride.backlogEntryId, entryId));
  await d.delete(backlogPublisherOverride).where(eq(backlogPublisherOverride.backlogEntryId, entryId));
  await d.delete(backlogEntry).where(eq(backlogEntry.id, entryId));
  return cover ? { storageKey: cover.storageKey, location: cover.location as CoverLocation } : null;
}
