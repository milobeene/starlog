/**
 * 데이터 내보내기. 파일 형식은 `dump.ts`.
 *
 * **표를 통째로 읽어 메모리에서 묶는다** — 주인이 한 명이라 표가 작고, 클라우드(Neon)에서는 쿼리 하나가
 * 인터넷 왕복이라 항목마다 따로 읽던 때(항목 145개에 쿼리 1,900여 개)는 몇 분씩 걸렸다.
 *
 * 순서는 예전과 같아야 한다 (같은 DB면 같은 파일). 장르 연결·오버라이드·게임 컬렉션처럼 **정렬이 없는 것은
 * `where` 없이 통째로 읽어 물리 순서를 그대로** 쓴다 — 같은 키끼리의 상대 순서는 키로 거른 읽기와 같다
 */
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import {
  acquisition, backlogDeveloperOverride, backlogEntry, backlogEntryGenre, backlogPublisherOverride, coverImage,
  device, emulator, game, genre, inputMethod, platform, platformAccount, playRecord, playthrough, subscription, tag,
} from "../../db/schema";
import { nowKst } from "../../common/clock";
import { ldt, moneyJson } from "../../common/json";
import { gameCollections, type GameRow } from "../game/service";
import type { TagRow } from "../tag/service";
import { FORMAT_VERSION } from "./dump";
import { manualAppidsByEntry } from "../steam/service";
import { colorsOf, presetsOf } from "./query";
import { findProfile, type ProfileRow } from "./profile";

type SubscriptionRow = typeof subscription.$inferSelect;

/** IGDB id가 있으면 그것, 없으면(수동 등록) 이름. 형식 4까지는 이게 곧 열쇠였다 */
export const gameKeyOf = (g: Pick<GameRow, "externalId" | "name">) =>
  g.externalId !== null ? `igdb:${g.externalId}` : `name:${g.name}`;

/**
 * 덤프 안에서만 쓰는 열쇠 (형식 5). 수동 게임은 이름이 겹칠 수 있어서(`registerManual`이 허용) 겹치면 `#2`…를 붙인다 —
 * 이름만으로 두면 두 게임이 하나로 합쳐지고 두 항목이 같은 게임을 가리켜 되살리기가 409였다
 */
function uniqueKeys() {
  const used = new Set<string>();
  return (g: Pick<GameRow, "externalId" | "name">) => {
    const base = gameKeyOf(g);
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}#${n}`;
    used.add(key);
    return key;
  };
}

/**
 * ISO 로컬 날짜시각 — 소수 끝의 0은 안 찍는다 (기존 파일과 같은 모양).
 * DB에서 온 값은 Postgres가 이미 그렇게 주므로 `ldt()`면 되고, 이건 지금 시각용이다
 */
function nowLdt(): string {
  const s = ldt(nowKst())!;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** DB 커버만 바이트를 싣는다 (형식 6). 그 밖에는 예전과 같은 네 칸 — 키 순서도 그대로 */
function coverJson(c: typeof coverImage.$inferSelect) {
  const base = { storageKey: c.storageKey, contentType: c.contentType, sizeBytes: c.sizeBytes, location: c.location };
  return c.location === "DB" && c.data !== null ? { ...base, data: Buffer.from(c.data).toString("base64") } : base;
}

/** `starlog-backup-20261024.json` */
export const backupFileName = (today: string) => `starlog-backup-${today.replaceAll("-", "")}.json`;

export async function exportData(d: Db) {
  const t0 = performance.now();
  const m = await findProfile(d);

  // 삭제된 항목까지 — 백업은 휴지통까지 재현해야 한다
  const entries = await d.select({ e: backlogEntry, g: game }).from(backlogEntry)
    .innerJoin(game, eq(game.id, backlogEntry.gameId))
    .orderBy(asc(backlogEntry.id));

  // 차례로 읽는다 — 열 번 남짓이라 느리지 않고, 풀 연결을 하나만 쓴다 (동시에 열면 이득보다 변수가 크다)
  const collections = await gameCollections(d, [...new Set(entries.map(({ g }) => g.id))]);
  const genreLinks = await d.select().from(backlogEntryGenre);
  // 안 쓰는 태그까지 — 색·순서는 사전 관리 화면에서 정한 것이라 항목과 따로 산다 (형식 5)
  const tags = await d.select().from(tag).orderBy(asc(tag.sortOrder), asc(tag.name));
  const genreNames = await d.select({ id: genre.id, name: genre.name }).from(genre);
  const devOverrides = await d.select().from(backlogDeveloperOverride);
  const pubOverrides = await d.select().from(backlogPublisherOverride);
  const covers = await d.select().from(coverImage);
  const pts = await playthroughs(d);
  // 같은 서비스를 다시 구독하면 이름이 같은 행이 생긴다 — 취득은 순번으로 가리킨다 (형식 5). 동점은 id로 고정
  const subs = await d.select().from(subscription).orderBy(desc(subscription.startedOn), asc(subscription.id));
  const acqs = await acquisitions(d, new Map(subs.map((s, i) => [s.id, i])));
  const records = groupBy(await d.select().from(playRecord).orderBy(asc(playRecord.id)), (r) => r.backlogEntryId,
    (r) => ({ kind: r.kind, minutes: Number(r.minutes), playedOn: r.playedOn, note: r.note }));
  const steamOf = await manualAppidsByEntry(d);
  const tagById = new Map(tags.map((t) => [t.id, t.name]));
  const genreById = new Map(genreNames.map((x) => [x.id, x.name]));
  const genresOf = groupBy(genreLinks, (l) => l.backlogEntryId);
  const developersOf = groupBy(devOverrides, (r) => r.backlogEntryId);
  const publishersOf = groupBy(pubOverrides, (r) => r.backlogEntryId);
  // 항목당 하나(uk)지만 예전처럼 **첫 행**을 쓴다
  const coverOf = new Map<number, (typeof covers)[number]>();
  for (const c of covers) if (!coverOf.has(c.backlogEntryId)) coverOf.set(c.backlogEntryId, c);

  // 항목당 게임 하나(uk)라 게임도 항목 순서대로 한 번씩
  const games = new Map<string, ReturnType<typeof toGame>>();
  const exported = [];
  // 쓰인 장르는 UTF-16 코드 유닛 순으로 정렬한다 (JS 기본 정렬)
  const usedGenres = new Set<string>();
  const keyOf = uniqueKeys();

  for (const { e, g } of entries) {
    const key = keyOf(g);
    games.set(key, toGame(key, g, collections.get(g.id)!));

    const genres = (genresOf.get(e.id) ?? []).map((l) => genreById.get(l.genreId)!);
    genres.forEach((n) => usedGenres.add(n));

    const tagName = e.tagId === null ? null : tagById.get(e.tagId)!;

    const c = coverOf.get(e.id);
    exported.push({
      gameKey: key,
      createdAt: ldt(e.createdAt),
      deletedAt: ldt(e.deletedAt),
      nameOverride: e.nameOverride,
      developerOverrides: (developersOf.get(e.id) ?? []).map((r) => r.developer!),
      publisherOverrides: (publishersOf.get(e.id) ?? []).map((r) => r.publisher!),
      releasedOnOverride: e.releasedOnOverride,
      listPriceOverride: moneyJson(e.listPriceOverrideAmount, e.listPriceOverrideCurrency),
      rating: e.rating === null ? null : Number(e.rating),
      playTimeHours: e.playTimeHours === null ? null : Number(e.playTimeHours),
      memo: e.memo,
      tag: tagName,
      genres,
      cover: c ? coverJson(c) : null,
      playthroughs: pts.get(e.id) ?? [],
      acquisitions: acqs.get(e.id) ?? [],
      playRecords: records.get(e.id) ?? [],
      steamAppIds: steamOf.get(e.id) ?? [],
    });
  }

  const dump = {
    formatVersion: FORMAT_VERSION,
    exportedAt: nowLdt(),
    profile: profile(m),
    catalog: await catalog(d, subs, tags, [...usedGenres].sort()),
    games: [...games.values()],
    entries: exported,
  };
  // 오래 걸리면 어디서 걸렸는지 로그로 보이게 (클라우드는 왕복이 느리다)
  console.log(`내보내기 완료 — 항목 ${exported.length} · ${((performance.now() - t0) / 1000).toFixed(1)}초`);
  return dump;
}

/** 키별로 묶으며 모양을 바꾼다 — 각 묶음 안의 순서는 들어온 순서 그대로다 */
function groupBy<R, V = R>(rows: R[], keyOf: (r: R) => number, shape: (r: R) => V = (r) => r as unknown as V): Map<number, V[]> {
  const out = new Map<number, V[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = out.get(k);
    if (list) list.push(shape(r)); else out.set(k, [shape(r)]);
  }
  return out;
}

/** 형식 4부터 이메일이 없다(V14 — 로그인 칸이 사라졌다) */
function profile(m: ProfileRow) {
  return {
    nickname: m.nickname, memo: m.memo,
    backgroundColors: colorsOf(m.backgroundColors), backgroundPresets: presetsOf(m.backgroundPresets),
  };
}

/**
 * 선택지 다섯 종 + 구독 + 태그 + 쓰인 장르. **계정이 플랫폼을 참조하므로 플랫폼이 먼저다**.
 * 선택지는 **지운 행까지** `deletedAt`과 함께 싣는다 (형식 5) — 지운 기기·플랫폼을 가리키는 회차·취득·계정이 살아 있을 수 있다.
 * 이름(계정은 소속+라벨)이 지운 행까지 유니크라 이름으로 가리켜도 안 겹친다. 순서는 선택지 목록과 같은 열쇠
 */
async function catalog(d: Db, subs: SubscriptionRow[], tags: TagRow[], genres: string[]) {
  const accounts = await d.select({ a: platformAccount, p: platform.name, e: emulator.name })
    .from(platformAccount)
    .leftJoin(platform, eq(platformAccount.platformId, platform.id))
    .leftJoin(emulator, eq(platformAccount.emulatorId, emulator.id))
    .orderBy(sql`coalesce(${platform.name}, ${emulator.name}) asc`, asc(platformAccount.accountLabel), asc(platformAccount.id));
  return {
    platforms: (await d.select().from(platform).orderBy(asc(platform.name)))
      .map((p) => ({ name: p.name, deletedAt: ldt(p.deletedAt) })),
    // 소속은 둘 중 하나만 찬다 (형식 3). 에뮬 소속 계정 때문에 내보내기가 500이던 것(버그 1)을 여기서 고쳤다
    accounts: accounts.map(({ a, p, e }) => ({
      label: a.accountLabel, platform: p, emulator: e, deletedAt: ldt(a.deletedAt),
    })),
    devices: (await d.select().from(device).orderBy(asc(device.label)))
      .map((x) => ({ deviceType: x.deviceType, label: x.label, memo: x.memo, deletedAt: ldt(x.deletedAt) })),
    emulators: (await d.select().from(emulator).orderBy(asc(emulator.name)))
      .map((e) => ({ name: e.name, memo: e.memo, deletedAt: ldt(e.deletedAt) })),
    inputMethods: (await d.select().from(inputMethod).orderBy(asc(inputMethod.name)))
      .map((i) => ({ name: i.name, deletedAt: ldt(i.deletedAt) })),
    subscriptions: subs.map((s) => ({
      serviceName: s.serviceName,
      startedOn: s.startedOn,
      endedOn: s.endedOn,
      fee: moneyJson(s.feeAmount, s.feeCurrency),
      billingCycle: s.billingCycle,
    })),
    tags: tags.map((t) => ({ name: t.name, color: t.color, sortOrder: t.sortOrder })),
    genres,
  };
}

function toGame(key: string, g: GameRow, c: { developers: string[]; publishers: string[]; masterGenres: string[]; releasePlatforms: string[] }) {
  return {
    key,
    externalId: g.externalId,
    source: g.source,
    name: g.name,
    developers: c.developers,
    publishers: c.publishers,
    masterGenres: c.masterGenres,
    releasedOn: g.releasedOn,
    listPrice: moneyJson(g.listPriceAmount, g.listPriceCurrency),
    coverImageId: g.coverImageId,
    bannerImageId: g.bannerImageId,
    summary: g.summary,
    storyline: g.storyline,
    igdbRating: g.igdbRating === null ? null : Number(g.igdbRating),
    igdbRatingCount: g.igdbRatingCount,
    releasePlatforms: c.releasePlatforms,
    mainStoryHours: g.mainStoryHours,
    mainExtraHours: g.mainExtraHours,
    completionistHours: g.completionistHours,
    timeToBeatSamples: g.timeToBeatSamples,
    // 없으면 옮긴 뒤 스크린샷 연결이 끊긴다 — 번호가 붙은 폴더는 이름에서 다시 못 만든다
    mediaFolder: g.mediaFolder,
  };
}

const accountPlatform = alias(platform, "account_platform");
const accountEmulator = alias(emulator, "account_emulator");

/**
 * 계정의 소속 — 라벨만으로는 계정을 못 집어서 함께 적는다 (형식 2). **종류별로 칸이 따로다** (형식 3) —
 * 이름만 적으면 같은 이름의 플랫폼과 에뮬레이터를 못 가른다
 */
const accountOwner = (account: string | null, p: { name: string } | null, e: { name: string } | null) => ({
  platformAccountPlatform: account === null ? null : p?.name ?? null,
  platformAccountEmulator: account === null ? null : e?.name ?? null,
});

/** 항목 번호별로. 회차 번호 순 (한 항목 안에서) */
async function playthroughs(d: Db) {
  const rows = await d.select({
    p: playthrough, device: device.label, account: platformAccount.accountLabel,
    ap: accountPlatform, ae: accountEmulator, emulator: emulator.name, input: inputMethod.name,
  }).from(playthrough)
    .leftJoin(device, eq(device.id, playthrough.deviceId))
    .leftJoin(platformAccount, eq(platformAccount.id, playthrough.platformAccountId))
    .leftJoin(accountPlatform, eq(accountPlatform.id, platformAccount.platformId))
    .leftJoin(accountEmulator, eq(accountEmulator.id, platformAccount.emulatorId))
    .leftJoin(emulator, eq(emulator.id, playthrough.emulatorId))
    .leftJoin(inputMethod, eq(inputMethod.id, playthrough.inputMethodId))
    .orderBy(asc(playthrough.backlogEntryId), asc(playthrough.sequenceNo));
  return groupBy(rows, (r) => r.p.backlogEntryId, (r) => ({
    sequenceNo: r.p.sequenceNo,
    startedOn: r.p.startedOn,
    finishedOn: r.p.finishedOn,
    status: r.p.status,
    label: r.p.label,
    device: r.device,
    platformAccount: r.account,
    ...accountOwner(r.account, r.ap, r.ae),
    emulator: r.emulator,
    inputMethod: r.input,
  }));
}

/** `platform`은 **취득 자체의** 플랫폼이고, `platformAccountPlatform`·`…Emulator`는 **계정의** 소속이다 */
async function acquisitions(d: Db, subscriptionIndex: Map<number, number>) {
  const rows = await d.select({
    a: acquisition, platform: platform.name, account: platformAccount.accountLabel,
    ap: accountPlatform, ae: accountEmulator, subscription: subscription.serviceName,
  }).from(acquisition)
    .leftJoin(platform, eq(platform.id, acquisition.platformId))
    .leftJoin(platformAccount, eq(platformAccount.id, acquisition.platformAccountId))
    .leftJoin(accountPlatform, eq(accountPlatform.id, platformAccount.platformId))
    .leftJoin(accountEmulator, eq(accountEmulator.id, platformAccount.emulatorId))
    .leftJoin(subscription, eq(subscription.id, acquisition.subscriptionId))
    .orderBy(asc(acquisition.id));
  return groupBy(rows, (r) => r.a.backlogEntryId, (r) => ({
    method: r.a.method,
    platform: r.platform,
    platformAccount: r.account,
    ...accountOwner(r.account, r.ap, r.ae),
    subscription: r.subscription,
    subscriptionIndex: r.a.subscriptionId === null ? null : subscriptionIndex.get(r.a.subscriptionId) ?? null,
    price: moneyJson(r.a.priceAmount, r.a.priceCurrency),
    acquiredOn: r.a.acquiredOn,
    label: r.a.label,
  }));
}

