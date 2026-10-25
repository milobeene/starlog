/**
 * 데이터 가져오기·덮어쓰기. 파일 형식은 `dump.ts`.
 *
 * ## 순서가 전부다
 * `마스터 게임 → 플랫폼 → 플랫폼 계정 → 기기·에뮬 → 에뮬 계정 → 입력방식 → 구독 → 태그·장르 → (프로필) → 항목 →
 * 회차·취득·커버 → 파생 상태 재계산`. 계정이 플랫폼·에뮬을, 회차가 기기·계정을 참조한다.
 * 에뮬 계정(형식 3)만 에뮬 뒤로 미룬다 — 플랫폼 계정은 옛 파일과 같은 자리에서 만들어야 시퀀스·오류 순서가 같다
 *
 * ⚠️ **INSERT와 검증의 순서를 바꾸지 않는다.** 중간에 검증이 터지면 롤백되지만 **시퀀스는 안 돌아간다** —
 * 같은 자리에서 터져야 뒤에 만드는 행의 id가 기존 동작과 같다. 그래서 "INSERT 먼저, 검증은 그다음"인
 * 자리(게임 정가·항목의 금액·평점)도 그 순서를 지킨다.
 *
 * 값 컬렉션(개발사·유통사·장르·출시 기종, 항목의 오버라이드)은 id가 없어 INSERT 순서가 상관없다.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import {
  acquisition, backlogDeveloperOverride, backlogEntry, backlogEntryGenre, backlogPublisherOverride, coverImage,
  device, emulator, game, gameDeveloper, gameMasterGenre, gamePublisher, gameReleasePlatform, genre, inputMethod,
  platform, platformAccount, playRecord, playthrough, subscription, tag,
} from "../../db/schema";
import { Conflict, InvalidInput } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { bigDecimalText, compareDecimal, money, setScale, type Money } from "../../common/money";
import { normalize, normalizeAll, require, sortKey, subjectParticle } from "../../common/text";
import { ldtToDb } from "../../common/json";
import { coversDir, localExists } from "../../common/storage";
import { findIgdbGame, searchGamesByName, type GameRow } from "../game/service";
import type { PlatformAccountRow, PlatformRow } from "../platform/service";
import { ACQUISITION_METHODS, PLAYTHROUGH_STATUSES, deriveState } from "../backlog/shared";
import { belongsTo } from "../backlog/refs";
import { FORMAT_VERSION, npe, valueOf, type DumpCatalog, type DumpCover, type DumpEntry, type DumpGame, type DumpMoney, type DumpPlayRecord, type DumpProfile, type MemberDump } from "./dump";
import { PLAY_RECORD_KINDS, hoursText, minutesText, tenthsFromHours, tenthsOf } from "../backlog/playtime";
import { presetsValue, profileValues, saveProfile } from "./query";
import { findProfile, type ProfileRow } from "./profile";

export interface ImportResult { games: number; entries: number; playthroughs: number; acquisitions: number }

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

/** 객체가 있으면 금액·통화 검증을 탄다 (금액이 null이어도) */
const toMoney = (m: DumpMoney): Money | null => (m === null ? null : money(m.amount, m.currency));

/** **금액이 없으면 통째로 없는 것** (구독료·취득가) — 통화만 있어도 검증하지 않는다 */
const toOptionalMoney = (m: DumpMoney): Money | null =>
  (m === null || m.amount === null ? null : money(m.amount, m.currency));

/** 글자 단위로 대문자·소문자 둘 다 비교한다 (통째로 대소문자 변환하면 `ß` 같은 글자에서 길이가 달라진다) */
function equalsIgnoreCase(a: string, b: string | null): boolean {
  if (b === null || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    if (x === y || x.toUpperCase() === y.toUpperCase() || x.toLowerCase() === y.toLowerCase()) continue;
    return false;
  }
  return true;
}

/** null 원소는 `"null"` 글자가 된다 (JS `join`은 빈 칸으로 만든다) — 기존 동작 유지 */
const javaJoin = (values: (string | null)[]) => values.map((v) => (v === null ? "null" : v)).join(",");

// ───────────── 가져오기 ─────────────

/**
 * **빈 기록에만 넣는다** — 병합은 409. "같은 항목인가"를 판정할 방법이 없어서다.
 * `d`는 트랜잭션이어야 한다 (덮어쓰기는 지운 직후 같은 트랜잭션에서 부른다)
 */
export async function importInto(d: Db, data: MemberDump): Promise<ImportResult> {
  const t0 = performance.now();
  if (data.entries === null) throw new InvalidInput("가져올 데이터가 비어 있습니다");
  // 옛 형식(1~3)도 읽는다 — 없는 칸은 null(계정이면 플랫폼 계정, 프리셋이면 그대로 둠)로 읽힌다. 위쪽(미래 파일)만 막는다
  const version = data.formatVersion;
  if (version < 1 || version > FORMAT_VERSION) {
    throw new InvalidInput(`지원하지 않는 백업 형식입니다. 이 버전은 ${FORMAT_VERSION}까지 읽습니다 (파일은 ${version})`);
  }

  const m = await findProfile(d);

  // 삭제된 것까지 센다 — 안 보이는 항목이 남아 있으면 같은 게임이 두 벌이 되어 유니크에 걸린다
  const [existing] = await d.select({ id: backlogEntry.id }).from(backlogEntry).limit(1);
  if (existing) throw new Conflict("이미 데이터가 있는 계정입니다. 빈 계정에만 가져올 수 있습니다");

  const games = await importGames(d, data.games);
  const catalog = await importCatalog(d, data.catalog);
  await importProfile(d, m, data.profile);

  let playthroughs = 0;
  let acquisitions = 0;
  for (const item of data.entries) {
    if (item === null) npe("entry");
    const g = games.get(item.gameKey as string);
    if (!g) throw new InvalidInput(`항목이 가리키는 게임이 백업에 없습니다: ${item.gameKey}`);
    await importEntry(d, g, item, catalog);
    playthroughs += item.playthroughs?.length ?? 0;
    acquisitions += item.acquisitions?.length ?? 0;
  }

  console.log(`가져오기 완료 — 게임 ${games.size} / 항목 ${data.entries.length} / 회차 ${playthroughs} / 취득 ${acquisitions} · ${((performance.now() - t0) / 1000).toFixed(1)}초`);
  return { games: games.size, entries: data.entries.length, playthroughs, acquisitions };
}

// ───────────── 마스터 게임 ─────────────

/** 이미 있으면 그대로 쓴다 — 마스터는 항목과 따로 사는 데이터라 덮어쓰기에서도 안 지운다 */
async function importGames(d: Db, exported: (DumpGame | null)[] | null): Promise<Map<string, GameRow>> {
  const byKey = new Map<string, GameRow>();
  for (const item of exported ?? []) {
    if (item === null) npe("game");
    const g = (await findExisting(d, item)) ?? (await createGame(d, item));
    byKey.set(item.externalId !== null ? `igdb:${item.externalId}` : `name:${item.name}`, g);
  }
  return byKey;
}

/**
 * IGDB 게임은 `externalId`로, 수동 등록은 이름으로. 이름 조회는 부분 일치 검색(20건)을 재활용하고
 * **결과를 정확 일치로 거른다** — 21번째 너머에 있으면 못 찾는다 (기존 동작 그대로).
 * 이름은 **저장할 때와 같이 정규화한 뒤** 비교한다 — 원문으로 비교하면 앞뒤 공백이 있는 덤프에서
 * 가져올 때마다 같은 게임이 새로 생겼다 (고친 버그 20, `docs/v2-plan.md`). 비면 못 찾고 `createGame`에서 400
 */
async function findExisting(d: Db, item: DumpGame): Promise<GameRow | undefined> {
  if (item.externalId !== null) return findIgdbGame(d, item.externalId);
  const name = normalize(item.name);
  if (name === null) return undefined;
  return (await searchGamesByName(d, name, 20))
    .find((g) => g.source === "MANUAL" && equalsIgnoreCase(g.name, name));
}

/**
 * 둘로 나눠 채운다 — IGDB 동기화는 일부러 정가를 안 건드리고(§6.2), 복원은 정가까지 되살려야 해서
 * INSERT 뒤에 정가를 한 번 더 덮는다. 결과는 "덤프의 값 전부"다
 */
async function createGame(d: Db, item: DumpGame): Promise<GameRow> {
  // IGDB 게임은 이름을 정규화하지 않는다 (IGDB 원문 그대로). 수동 등록만 정규화·필수 검사를 탄다
  const name = item.externalId !== null ? item.name : require(item.name, "게임 이름은 비울 수 없습니다");
  const now = nowKst();
  const [row] = await d.insert(game).values({
    source: item.externalId !== null ? "IGDB" : "MANUAL",
    externalId: item.externalId,
    name: name as string,
    // 스크린샷 폴더 이름을 되살린다 — 번호가 붙었던 폴더는 이름에서 다시 못 만든다
    mediaFolder: item.mediaFolder,
    releasedOn: item.releasedOn,
    coverImageId: item.coverImageId,
    bannerImageId: item.bannerImageId,
    summary: item.summary,
    storyline: item.storyline,
    igdbRating: item.igdbRating,
    igdbRatingCount: item.igdbRatingCount,
    mainStoryHours: item.mainStoryHours,
    mainExtraHours: item.mainExtraHours,
    completionistHours: item.completionistHours,
    timeToBeatSamples: item.timeToBeatSamples,
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  }).returning();

  // 정가 검증은 INSERT 뒤다 (위 순서 규칙)
  const listPrice = toMoney(item.listPrice);
  let g = row!;
  if (listPrice !== null) {
    [g] = await d.update(game).set({ listPriceAmount: listPrice.amount, listPriceCurrency: listPrice.currency })
      .where(eq(game.id, g.id)).returning() as [GameRow];
  }
  const id = g.id;
  const put = async <T>(values: T[], insert: (rows: T[]) => Promise<unknown>) => { if (values.length) await insert(values); };
  await put(normalizeAll(item.developers), (vs) => d.insert(gameDeveloper).values(vs.map((developer) => ({ gameId: id, developer }))));
  await put(normalizeAll(item.publishers), (vs) => d.insert(gamePublisher).values(vs.map((publisher) => ({ gameId: id, publisher }))));
  await put(normalizeAll(item.masterGenres), (vs) => d.insert(gameMasterGenre).values(vs.map((genre) => ({ gameId: id, genre }))));
  await put(normalizeAll(item.releasePlatforms),
    (vs) => d.insert(gameReleasePlatform).values(vs.map((platformName) => ({ gameId: id, platformName }))));
  return g;
}

// ───────────── 선택지 ─────────────

/** 이름 → 행. 키는 **덤프에 적힌 글자 그대로**다 (정규화 전) — 회차·취득도 같은 글자로 가리킨다 */
interface Catalog {
  platforms: Map<string | null, PlatformRow>;
  /** 라벨 → 계정. **겹칠 수 있다** — 옛 파일(형식 1) 폴백 전용 */
  accounts: Map<string | null, PlatformAccountRow>;
  /** `종류\0소속\0라벨` → 계정. 형식 2부터 이쪽으로 찾는다 */
  accountsByOwner: Map<string, PlatformAccountRow>;
  devices: Map<string | null, Row<typeof device>>;
  emulators: Map<string | null, Row<typeof emulator>>;
  inputMethods: Map<string | null, Row<typeof inputMethod>>;
  subscriptions: Map<string | null, Row<typeof subscription>>;
  tags: Map<string | null, Row<typeof tag>>;
  genres: Map<string | null, Row<typeof genre>>;
}

/**
 * `\0`으로 잇는다 — 라벨이나 소속 이름에 절대 안 들어가는 문자라 경계가 안 섞인다.
 * 종류(`P`/`E`)를 앞에 붙인다 — 같은 이름의 플랫폼과 에뮬레이터가 있을 수 있다
 */
const accountKey = (kind: "P" | "E", ownerName: string | null, label: string | null) => `${kind}\u0000${ownerName}\u0000${label}`;

/**
 * ⚠️ **기본 카탈로그 시드(`seedDefaultCatalog`)와 짝이 맞아야 한다.** 프로필은 기본 플랫폼·입력방식을
 * 늘 갖고 시작하므로 그 둘만 "있으면 재사용"이다 (삭제된 행이어도 그대로 쓴다 — 유니크가 삭제된 행도 본다).
 * 나머지는 빈 기록에 없으니 무조건 만든다
 */
async function importCatalog(d: Db, data: DumpCatalog | null): Promise<Catalog> {
  const c: Catalog = {
    platforms: new Map(), accounts: new Map(), accountsByOwner: new Map(), devices: new Map(),
    emulators: new Map(), inputMethods: new Map(), subscriptions: new Map(), tags: new Map(), genres: new Map(),
  };
  if (data === null) return c;
  const now = nowKst();
  const stamp = () => ({ createdAt: now, updatedAt: now });

  for (const name of data.platforms ?? []) {
    // 이름이 null이면 조회 없이 만들러 가서 `require`에서 400이 난다
    const [found] = name === null ? [] : await d.select().from(platform)
      .where(eq(platform.name, name));
    c.platforms.set(name, found ?? (await d.insert(platform)
      .values({ ...stamp(), name: require(name, "플랫폼 이름은 비울 수 없습니다") }).returning())[0]!);
  }

  // 에뮬 소속 계정은 에뮬을 만든 뒤에 (형식 3). `emulator`가 없으면(형식 2 이하) 예전처럼 플랫폼 계정이다
  const emulatorAccounts: NonNullable<DumpCatalog["accounts"]>[number][] = [];
  for (const item of data.accounts ?? []) {
    if (item === null) npe("account");
    if (item.emulator !== null) {
      if (item.platform !== null) throw new InvalidInput(`계정의 소속은 플랫폼과 에뮬레이터 중 하나여야 합니다: ${item.label}`);
      emulatorAccounts.push(item);
      continue;
    }
    const p = c.platforms.get(item.platform);
    if (!p) throw new InvalidInput(`계정이 가리키는 플랫폼이 백업에 없습니다: ${item.platform}`);
    const [a] = await d.insert(platformAccount).values({
      ...stamp(), platformId: p.id, emulatorId: null,
      accountLabel: require(item.label, "계정 라벨은 비울 수 없습니다"), ownerKey: `P${p.id}`,
    }).returning();
    c.accounts.set(item.label, a!);
    c.accountsByOwner.set(accountKey("P", p.name, item.label), a!);
  }

  for (const item of data.devices ?? []) {
    if (item === null) npe("device");
    const deviceType = require(item.deviceType, "기기 유형은 비울 수 없습니다");
    const label = require(item.label, "기기 라벨은 비울 수 없습니다");
    const [row] = await d.insert(device).values({ ...stamp(), deviceType, label, memo: normalize(item.memo) }).returning();
    c.devices.set(item.label, row!);
  }

  for (const item of data.emulators ?? []) {
    if (item === null) npe("emulator");
    const name = require(item.name, "에뮬레이터 이름은 비울 수 없습니다");
    const [row] = await d.insert(emulator).values({ ...stamp(), name, memo: normalize(item.memo) }).returning();
    c.emulators.set(item.name, row!);
  }

  for (const item of emulatorAccounts) {
    const e = c.emulators.get(item!.emulator);
    if (!e) throw new InvalidInput(`계정이 가리키는 에뮬레이터가 백업에 없습니다: ${item!.emulator}`);
    const [a] = await d.insert(platformAccount).values({
      ...stamp(), platformId: null, emulatorId: e.id,
      accountLabel: require(item!.label, "계정 라벨은 비울 수 없습니다"), ownerKey: `E${e.id}`,
    }).returning();
    c.accounts.set(item!.label, a!);
    c.accountsByOwner.set(accountKey("E", e.name, item!.label), a!);
  }

  // 입력방식도 기본 시드와 부딪힌다 (Keyboard & Mouse 등) — 플랫폼과 같은 규칙
  for (const name of data.inputMethods ?? []) {
    const [found] = name === null ? [] : await d.select().from(inputMethod)
      .where(eq(inputMethod.name, name));
    c.inputMethods.set(name, found ?? (await d.insert(inputMethod)
      .values({ ...stamp(), name: require(name, "입력 방식 이름은 비울 수 없습니다") }).returning())[0]!);
  }

  for (const item of data.subscriptions ?? []) {
    if (item === null) npe("subscription");
    // 결제 주기 해석이 다른 검증보다 먼저 돈다 — 잘못된 값은 400이 아니라 500 (`valueOf`)
    const billingCycle = valueOf(["MONTHLY", "YEARLY"] as const, item.billingCycle, "BillingCycle");
    const serviceName = normalize(item.serviceName);
    if (serviceName === null) throw new InvalidInput("구독 서비스명은 필수입니다");
    if (item.startedOn === null) throw new InvalidInput("구독 시작일은 필수입니다");
    if (item.endedOn !== null && item.endedOn < item.startedOn) {
      throw new InvalidInput(`종료일은 시작일 이후여야 합니다: ${item.startedOn} ~ ${item.endedOn}`);
    }
    const fee = toOptionalMoney(item.fee);
    const [row] = await d.insert(subscription).values({
      ...stamp(), serviceName, startedOn: item.startedOn, endedOn: item.endedOn, billingCycle,
      feeAmount: fee?.amount ?? null, feeCurrency: fee?.currency ?? null,
    }).returning();
    c.subscriptions.set(item.serviceName, row!);
  }

  for (const name of data.tags ?? []) {
    const [row] = await d.insert(tag)
      .values({ ...stamp(), name: require(name, "태그 이름은 비울 수 없습니다"), sortOrder: 0, color: null }).returning();
    c.tags.set(name, row!);
  }

  for (const name of data.genres ?? []) {
    const [row] = await d.insert(genre).values({ ...stamp(), name: require(name, "장르 이름은 비울 수 없습니다") }).returning();
    c.genres.set(name, row!);
  }
  return c;
}

/** 옛 파일(형식 3 이하)의 이메일은 버린다. 프리셋은 파일에 있을 때만 갈아 넣는다 (프로필 수정과 같은 규칙) */
async function importProfile(d: Db, m: ProfileRow, p: DumpProfile | null) {
  if (p === null) return;
  const colors = p.backgroundColors === null ? null : javaJoin(p.backgroundColors);
  const v = profileValues(p.nickname, p.memo, colors);
  const presets = p.backgroundPresets;
  await saveProfile(d, m, presets === undefined || presets === null ? v : { ...v, backgroundPresets: presetsValue(presets) });
}

// ───────────── 항목 ─────────────

/** 소수 1자리로 맞춘(setScale) 뒤 범위를 본다. 메시지엔 원래 값 */
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

/** 없으면 조용히 null — 회차의 기기처럼 원래 비어 있을 수 있는 참조 */
const optional = <T>(byName: Map<string | null, T>, name: string | null): T | null =>
  (name === null ? null : byName.get(name) ?? null);

/** 없으면 터진다 — 항목이 이름을 적어 놓았는데 사전에 없으면 백업이 깨진 것이다 */
function required<T>(byName: Map<string | null, T>, name: string | null, what: string): T {
  const found = byName.get(name);
  if (found === undefined) throw new InvalidInput(`${what}${subjectParticle(what)} 백업의 사전에 없습니다: ${name}`);
  return found;
}

/**
 * 계정을 **소속까지 보고** 찾는다 (형식 2, 종류는 형식 3). 라벨만으로는 `Beene(Steam)`과 `Beene(Nintendo)`가 뭉개진다.
 * 형식 2의 `platformAccountPlatform`은 플랫폼 계정만 가리킨다 (그때 사전엔 플랫폼 계정뿐이었다).
 * 소속이 없거나(형식 1) 소속으로 못 찾으면 라벨로 한 번 더 — 여기서 null을 주면 계정이 조용히 사라진다.
 * 형식 1 파일에서 같은 라벨 계정이 소속마다 있으면 라벨 폴백에서 마지막 것이 붙어 400이 난다 (알려진 버그 19, `docs/v2-plan.md`)
 */
function accountOf(c: Catalog, label: string | null, platformName: string | null, emulatorName: string | null): PlatformAccountRow | null {
  if (label === null) return null;
  const owner = emulatorName !== null ? accountKey("E", emulatorName, label)
    : platformName !== null ? accountKey("P", platformName, label) : null;
  const exact = owner === null ? undefined : c.accountsByOwner.get(owner);
  return exact ?? c.accounts.get(label) ?? null;
}

async function importEntry(d: Db, g: GameRow, item: DumpEntry, c: Catalog) {
  const now = nowKst();
  // 담는 순간은 위시리스트, 표시값은 마스터에서
  const [e] = await d.insert(backlogEntry).values({
    gameId: g.id, status: "WISHLIST",
    displayName: g.name, displayNameSortKey: sortKey(g.name), releasedOnResolved: g.releasedOn,
    createdAt: now, updatedAt: now,
  }).returning({ id: backlogEntry.id });
  const entryId = e!.id;

  // 검증은 INSERT 뒤 — 파일 머리의 순서 규칙 (같은 자리에서 터져야 시퀀스가 같게 소모된다)
  const listPrice = toMoney(item.listPriceOverride);
  const nameOverride = normalize(item.nameOverride);
  const developers = normalizeAll(item.developerOverrides);
  const publishers = normalizeAll(item.publisherOverrides);
  const rating = normalizeRating(item.rating);
  const playTimeHours = validatePlayTimeHours(item.playTimeHours);
  const memo = normalize(item.memo);
  const tagRow = item.tag === null ? null : required(c.tags, item.tag, "태그");

  for (const name of item.genres ?? []) {
    const gr = required(c.genres, name, "장르");
    await d.insert(backlogEntryGenre).values({ backlogEntryId: entryId, genreId: gr.id, createdAt: now, updatedAt: now });
  }

  const pts: Row<typeof playthrough>[] = [];
  for (const pt of item.playthroughs ?? []) {
    if (pt === null) npe("playthrough");
    const status = valueOf(PLAYTHROUGH_STATUSES, pt.status, "PlaythroughStatus");
    // 회차 검증
    if (pt.startedOn === null) throw new InvalidInput("시작일은 필수입니다");
    if (pt.finishedOn !== null && pt.finishedOn < pt.startedOn) {
      throw new InvalidInput(`종료일은 시작일 이후여야 합니다: ${pt.startedOn} ~ ${pt.finishedOn}`);
    }
    if (status === "PLAYING" && pt.finishedOn !== null) {
      throw new InvalidInput("PLAYING 회차에는 종료일을 둘 수 없습니다. 멈춘 날을 적으려면 PAUSED로 두세요");
    }
    if ((status === "DROPPED" || status === "COMPLETED") && pt.finishedOn === null) {
      throw new InvalidInput(`종료된(${status}) 회차에는 종료일이 필요합니다`);
    }
    /*
     * 형식에 회차의 플랫폼이 없다 — **계정에서 역산한다** (V11 백필과 같은 규칙).
     * 플랫폼이 있으면 에뮬은 버린다
     */
    const account = accountOf(c, pt.platformAccount, pt.platformAccountPlatform, pt.platformAccountEmulator);
    const platformId = account?.platformId ?? null;
    const emu = platformId !== null ? null : optional(c.emulators, pt.emulator);
    if (account !== null && (platformId !== null || emu !== null) && !belongsTo(account, platformId, emu?.id ?? null)) {
      throw new InvalidInput("계정이 고른 소속의 것이 아닙니다");
    }
    const [row] = await d.insert(playthrough).values({
      backlogEntryId: entryId, sequenceNo: pt.sequenceNo, startedOn: pt.startedOn, finishedOn: pt.finishedOn,
      status, label: normalize(pt.label),
      deviceId: optional(c.devices, pt.device)?.id ?? null,
      platformId,
      platformAccountId: account?.id ?? null,
      emulatorId: emu?.id ?? null,
      inputMethodId: optional(c.inputMethods, pt.inputMethod)?.id ?? null,
      createdAt: now, updatedAt: now,
    }).returning();
    pts.push(row!);
  }

  let acquired = 0;
  for (const ac of item.acquisitions ?? []) {
    if (ac === null) npe("acquisition");
    const method = valueOf(ACQUISITION_METHODS, ac.method, "AcquisitionMethod");
    const price = toOptionalMoney(ac.price);
    const p = optional(c.platforms, ac.platform);
    const account = accountOf(c, ac.platformAccount, ac.platformAccountPlatform, ac.platformAccountEmulator);
    if (account !== null && p !== null && !belongsTo(account, p.id, null)) {
      throw new InvalidInput("계정이 고른 플랫폼의 것이 아닙니다");
    }
    const sub = ac.subscription === null ? null : required(c.subscriptions, ac.subscription, "구독");
    await d.insert(acquisition).values({
      backlogEntryId: entryId, method, priceAmount: price?.amount ?? null, priceCurrency: price?.currency ?? null,
      acquiredOn: ac.acquiredOn, label: normalize(ac.label),
      platformId: p?.id ?? null, platformAccountId: account?.id ?? null, subscriptionId: sub?.id ?? null,
      createdAt: now, updatedAt: now,
    });
    acquired++;
  }

  if (item.cover !== null) await attachCover(d, entryId, item.cover, now);
  const playTotal = await importPlayRecords(d, entryId, item.playRecords, playTimeHours, item.createdAt, now);

  // 파생 상태는 회차·취득을 다 붙인 다음에 — 순서가 바뀌면 status가 위시리스트로 굳는다
  const displayName = nameOverride ?? g.name;
  await d.update(backlogEntry).set({
    nameOverride,
    releasedOnOverride: item.releasedOnOverride,
    listPriceOverrideAmount: listPrice?.amount ?? null,
    listPriceOverrideCurrency: listPrice?.currency ?? null,
    rating, playTimeHours: playTotal, memo,
    tagId: tagRow?.id ?? null,
    // 삭제 상태도 그대로 옮긴다 — 백업은 휴지통까지 재현해야 한다
    deletedAt: item.deletedAt === null ? null : ldtToDb(item.deletedAt),
    displayName,
    displayNameSortKey: sortKey(displayName),
    releasedOnResolved: item.releasedOnOverride ?? g.releasedOn,
    ...deriveState(pts, acquired > 0),
    updatedAt: nowKst(),
  }).where(eq(backlogEntry.id, entryId));

  if (developers.length) {
    await d.insert(backlogDeveloperOverride).values(developers.map((developer) => ({ backlogEntryId: entryId, developer })));
  }
  if (publishers.length) {
    await d.insert(backlogPublisherOverride).values(publishers.map((publisher) => ({ backlogEntryId: entryId, publisher })));
  }
}

/**
 * 플레이타임 기록을 넣고 합계 캐시 값을 돌려준다. **가져온 합계는 파일의 합계(`playTimeHours`)와 같아야 한다** —
 * 기록의 합과 다르면(homeops 일정 몫은 파일에 없다, 또는 기록이 없는 옛 파일) 차이를 한 줄로 메운다.
 * 기록이 없으면 BASELINE(기존 기록), 있으면 ADJUST(직접 수정). 합계가 null인데 기록이 있으면 기록을 믿는다
 */
async function importPlayRecords(d: Db, entryId: number, records: (DumpPlayRecord | null)[] | null,
                                 hours: string | null, createdAt: string | null, now: string): Promise<string | null> {
  let sum = 0n;
  let count = 0;
  for (const r of records ?? []) {
    if (r === null) npe("playRecord");
    const kind = valueOf(PLAY_RECORD_KINDS, r.kind, "PlayRecordKind");
    if (r.minutes === null) throw new InvalidInput("플레이 기록의 시간(분)은 필수입니다");
    if (r.playedOn === null) throw new InvalidInput("플레이 기록의 날짜는 필수입니다");
    const t = tenthsOf(r.minutes);
    if (kind === "ADD" && t <= 0n) throw new InvalidInput("추가하는 플레이 시간은 0분보다 커야 합니다");
    await d.insert(playRecord).values({
      backlogEntryId: entryId, kind, minutes: minutesText(t), playedOn: r.playedOn, note: normalize(r.note),
      createdAt: now, updatedAt: now,
    });
    sum += t;
    count++;
  }
  if (hours === null) return count === 0 ? null : hoursText(sum < 0n ? 0n : sum);
  // 분으로 쌓인 합은 시간 칸에서 반올림돼 있다(140분 → 2.33) — 반올림해서 같으면 차이가 아니다.
  // 합이 0 밑이면(homeops 몫을 빼 둔 직접 수정) 반올림 비교가 0으로 잘린 값을 보므로 차이로 친다
  if (count > 0 && sum >= 0n && compareDecimal(hoursText(sum), hours) === 0) return hours;

  // 시간 칸은 0.6분 단위라 차이가 135.2분처럼 나온다 — 정수 분으로 맞춰도 같은 합계면 그쪽으로 (일정은 분 단위다)
  const exact = tenthsFromHours(hours) - sum;
  const whole = ((exact < 0n ? exact - 5n : exact + 5n) / 10n) * 10n;
  const gap = sum + whole >= 0n && compareDecimal(hoursText(sum + whole), hours) === 0 ? whole : exact;
  await d.insert(playRecord).values({
    backlogEntryId: entryId, kind: count === 0 ? "BASELINE" : "ADJUST", minutes: minutesText(gap),
    // 기록이 없던 옛 파일은 항목을 담은 날로 — V15가 실데이터에 한 것과 같은 결
    playedOn: (createdAt ?? now).slice(0, 10), note: count === 0 ? null : "가져온 합계에 맞춤",
    createdAt: now, updatedAt: now,
  });
  return hours;
}

/**
 * ⚠️ **LOCAL 커버는 실물이 있을 때만 붙인다.** JSON은 다른 기계로 건너가도 로컬 파일은 안 따라온다 —
 * 그대로 붙이면 깨진 이미지가 뜨고 지울 수도 다시 올릴 수도 없다. 없으면 마스터 커버로 폴백시킨다
 */
async function attachCover(d: Db, entryId: number, cover: DumpCover, now: string) {
  // location은 6단계에 생겼다. 그 전에 뽑은 파일에는 없어서 EXTERNAL로 읽는다
  const location = cover.location === null ? "EXTERNAL" : valueOf(["LOCAL", "EXTERNAL"] as const, cover.location, "CoverLocation");
  if (location === "LOCAL" && !localExists(coversDir(), cover.storageKey as string)) {
    console.log(`로컬 커버 실물이 없어 건너뛴다. entry=${entryId} file=${cover.storageKey}`);
    return;
  }
  await d.insert(coverImage).values({
    backlogEntryId: entryId, storageKey: cover.storageKey as string, contentType: cover.contentType as string,
    sizeBytes: cover.sizeBytes, location, createdAt: now, updatedAt: now,
  });
}

// ───────────── 덮어쓰기 ─────────────

/**
 * 지우고 붓는다. **한 트랜잭션이다** — 중간에 실패하면 옛 데이터가 그대로 남는다.
 * 되돌릴 수 없어서 부르는 쪽(일렉트론)이 직전에 로컬 세이브파일로 뽑아둔다.
 * 마스터 게임은 안 지운다 — 항목이 없어도 남는 데이터다(게임 마스터 화면)
 */
export async function replace(d: Db, data: MemberDump): Promise<ImportResult> {
  await wipe(d);
  // 같은 트랜잭션이라 "빈 기록인가" 검사가 방금 지운 결과를 본다
  return importInto(d, data);
}

/** 자식 → 부모 순서. 순서 근거는 V1의 FK다. 프로필 행은 남긴다 (가져오기가 값을 덮는다) */
async function wipe(d: Db) {
  // 순환 참조(항목 ↔ 회차의 lastPlaythrough)를 먼저 끊는다. 벌크라 updatedAt을 직접 쓴다
  await d.update(backlogEntry).set({ lastPlaythroughId: null, updatedAt: nowKst() });

  await d.delete(backlogEntryGenre);
  await d.delete(coverImage);
  await d.delete(acquisition);
  await d.delete(playthrough);
  // homeops 일정(`homeops_play_log`)은 항목을 지울 때 cascade로 같이 사라진다 — 새 항목은 번호가 달라 이어 붙일 수 없다
  await d.delete(playRecord);
  // 개발사·유통사 오버라이드 테이블도 항목을 가리키는 FK라 항목보다 먼저
  await d.delete(backlogDeveloperOverride);
  await d.delete(backlogPublisherOverride);
  const entries = await d.delete(backlogEntry).returning({ id: backlogEntry.id });

  // 항목을 지운 뒤에야 지울 수 있는 것들. 삭제된(소프트) 행까지 전부
  await d.delete(platformAccount);
  await d.delete(platform);
  await d.delete(device);
  await d.delete(emulator);
  await d.delete(inputMethod);
  await d.delete(subscription);
  await d.delete(genre);
  await d.delete(tag);

  console.log(`덮어쓰기 전 정리 — 지운 항목 ${entries.length}건`);
}
