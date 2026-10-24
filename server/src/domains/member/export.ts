/**
 * 회원 데이터 내보내기 — 자바 `MemberExportService`.
 *
 * 항목마다 회차·취득·장르를 따로 읽는다 (자바도 그랬다 — 하루 한 번 도는 백업이라 정확함이 속도보다 먼저).
 * 특히 **장르 연결은 자바와 같은 SQL 모양**(`where backlog_entry_id = ?`, 정렬 없음)으로 읽는다 —
 * 정렬이 없어 물리 순서가 곧 출력 순서이고, 조인으로 묶으면 실행 계획이 바뀌어 순서가 갈릴 수 있다.
 */
import { alias } from "drizzle-orm/pg-core";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import {
  acquisition, backlogDeveloperOverride, backlogEntry, backlogEntryGenre, backlogPublisherOverride, coverImage,
  device, emulator, game, genre, inputMethod, platform, platformAccount, playthrough, subscription, tag,
} from "../../db/schema";
import { nowKst } from "../../common/clock";
import { ldt } from "../../common/json";
import {
  accountFindSelectable, deviceFindSelectable, emulatorFindSelectable, inputMethodFindSelectable,
  platformFindSelectable, type SelectableAccount,
} from "../platform/service";
import { gameCollections, type GameRow } from "../game/service";
import { FORMAT_VERSION, moneyOut, npe } from "./dump";
import { colorsOf, findMember, subscriptionsOf, type MemberRow } from "./query";

/** IGDB id가 있으면 그것, 없으면(수동 등록) 이름. 새 DB에서 항목이 게임을 찾는 열쇠다 */
export const gameKeyOf = (g: Pick<GameRow, "externalId" | "name">) =>
  g.externalId !== null ? `igdb:${g.externalId}` : `name:${g.name}`;

/**
 * 자바 `LocalDateTime` JSON (`ISO_LOCAL_DATE_TIME`) — 소수 끝의 0은 안 찍는다.
 * DB에서 온 값은 Postgres가 이미 그렇게 주므로 `ldt()`면 되고, 이건 지금 시각용이다
 */
function nowLdt(): string {
  const s = ldt(nowKst())!;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** `starlog-backup-20261024.json` (`BASIC_ISO_DATE`) */
export const backupFileName = (today: string) => `starlog-backup-${today.replaceAll("-", "")}.json`;

export async function exportData(d: Db, memberId: number) {
  const m = await findMember(d, memberId);

  // 삭제된 항목까지 — 백업은 휴지통까지 재현해야 한다
  const entries = await d.select({ e: backlogEntry, g: game }).from(backlogEntry)
    .innerJoin(game, eq(game.id, backlogEntry.gameId))
    .where(eq(backlogEntry.memberId, memberId))
    .orderBy(asc(backlogEntry.id));

  // 여러 항목이 같은 게임을 가리킬 수는 없지만(uk) 순서를 지키며 중복을 걷는다 (LinkedHashMap)
  const games = new Map<string, ReturnType<typeof toGame>>();
  const exported = [];
  // TreeSet<String> — 자바 문자열 비교는 UTF-16 단위라 JS 기본 정렬과 같다
  const usedTags = new Set<string>();
  const usedGenres = new Set<string>();

  for (const { e, g } of entries) {
    const key = gameKeyOf(g);
    if (!games.has(key)) games.set(key, toGame(g, (await gameCollections(d, [g.id])).get(g.id)!));

    const genres = await genreNames(d, e.id);
    genres.forEach((n) => usedGenres.add(n));

    const tagName = e.tagId === null ? null
      : (await d.select({ name: tag.name }).from(tag).where(eq(tag.id, e.tagId)))[0]!.name;
    if (tagName !== null) usedTags.add(tagName);

    exported.push({
      gameKey: key,
      createdAt: ldt(e.createdAt),
      deletedAt: ldt(e.deletedAt),
      nameOverride: e.nameOverride,
      developerOverrides: (await d.select().from(backlogDeveloperOverride)
        .where(eq(backlogDeveloperOverride.backlogEntryId, e.id))).map((r) => r.developer!),
      publisherOverrides: (await d.select().from(backlogPublisherOverride)
        .where(eq(backlogPublisherOverride.backlogEntryId, e.id))).map((r) => r.publisher!),
      releasedOnOverride: e.releasedOnOverride,
      listPriceOverride: moneyOut(e.listPriceOverrideAmount, e.listPriceOverrideCurrency),
      rating: e.rating === null ? null : Number(e.rating),
      playTimeHours: e.playTimeHours === null ? null : Number(e.playTimeHours),
      memo: e.memo,
      tag: tagName,
      genres,
      cover: await cover(d, e.id),
      playthroughs: await playthroughs(d, e.id),
      acquisitions: await acquisitions(d, e.id),
    });
  }

  return {
    formatVersion: FORMAT_VERSION,
    exportedAt: nowLdt(),
    profile: profile(m),
    catalog: await catalog(d, memberId, [...usedTags].sort(), [...usedGenres].sort()),
    games: [...games.values()],
    entries: exported,
  };
}

/** 자격증명은 담지 않는다 — 이 파일은 동기화 폴더에 놓일 물건이다 */
function profile(m: MemberRow) {
  return { email: m.email, nickname: m.nickname, memo: m.memo, backgroundColors: colorsOf(m.backgroundColors) };
}

/**
 * ⚠️ **자바 버그 그대로 옮겼다** — 계정의 소속을 `a.getPlatform().getName()`으로만 읽어서
 * **에뮬레이터 소속 계정(platform = null)이 하나라도 있으면 NPE → 500**이다.
 * 형식 2의 `Account(label, platform)`에는 소속 종류 칸도 없다 (가져오기는 늘 `onPlatform`).
 * 고칠 때는 아래 `platformNameOf(a)` 한 줄을 `ownerName(a)`로 바꾸면 된다 (+ 형식에 소속 종류를 더할지 결정)
 */
const platformNameOf = (a: SelectableAccount): string => (a.platform === null ? npe("account.platform") : a.platform.name);

/** 선택지 다섯 종 + 구독 + 쓰인 태그·장르. **계정이 플랫폼을 참조하므로 플랫폼이 먼저다** */
async function catalog(d: Db, memberId: number, tags: string[], genres: string[]) {
  return {
    platforms: (await platformFindSelectable(d, memberId)).map((p) => p.name),
    accounts: (await accountFindSelectable(d, memberId)).map((a) => ({ label: a.accountLabel, platform: platformNameOf(a) })),
    devices: (await deviceFindSelectable(d, memberId)).map((x) => ({ deviceType: x.deviceType, label: x.label, memo: x.memo })),
    emulators: (await emulatorFindSelectable(d, memberId)).map((e) => ({ name: e.name, memo: e.memo })),
    inputMethods: (await inputMethodFindSelectable(d, memberId)).map((i) => i.name),
    subscriptions: (await subscriptionsOf(d, memberId)).map((s) => ({
      serviceName: s.serviceName,
      startedOn: s.startedOn,
      endedOn: s.endedOn,
      fee: moneyOut(s.feeAmount, s.feeCurrency),
      billingCycle: s.billingCycle,
    })),
    tags,
    genres,
  };
}

function toGame(g: GameRow, c: { developers: string[]; publishers: string[]; masterGenres: string[]; releasePlatforms: string[] }) {
  return {
    externalId: g.externalId,
    source: g.source,
    name: g.name,
    developers: c.developers,
    publishers: c.publishers,
    masterGenres: c.masterGenres,
    releasedOn: g.releasedOn,
    listPrice: moneyOut(g.listPriceAmount, g.listPriceCurrency),
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

/** `findByBacklogEntryId` 후 장르를 하나씩 — 연결 행 순서 그대로 */
async function genreNames(d: Db, entryId: number): Promise<string[]> {
  const links = await d.select().from(backlogEntryGenre).where(eq(backlogEntryGenre.backlogEntryId, entryId));
  const out: string[] = [];
  for (const l of links) out.push((await d.select({ name: genre.name }).from(genre).where(eq(genre.id, l.genreId)))[0]!.name);
  return out;
}

/** 실물은 스토리지·데이터 루트에 남는다 — 키와 위치만 */
async function cover(d: Db, entryId: number) {
  const [c] = await d.select().from(coverImage).where(eq(coverImage.backlogEntryId, entryId));
  return c ? { storageKey: c.storageKey, contentType: c.contentType, sizeBytes: c.sizeBytes, location: c.location } : null;
}

const accountPlatform = alias(platform, "account_platform");
const accountEmulator = alias(emulator, "account_emulator");

/** 계정의 소속 이름 — 라벨만으로는 계정을 못 집기 때문에 함께 적는다 (형식 2). 플랫폼이거나 에뮬이거나 하나다 */
const ownerName = (p: { name: string } | null, e: { name: string } | null) => p?.name ?? e?.name ?? null;

async function playthroughs(d: Db, entryId: number) {
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
    .where(eq(playthrough.backlogEntryId, entryId))
    .orderBy(asc(playthrough.sequenceNo));
  return rows.map((r) => ({
    sequenceNo: r.p.sequenceNo,
    startedOn: r.p.startedOn,
    finishedOn: r.p.finishedOn,
    status: r.p.status,
    label: r.p.label,
    device: r.device,
    platformAccount: r.account,
    platformAccountPlatform: r.account === null ? null : ownerName(r.ap, r.ae),
    emulator: r.emulator,
    inputMethod: r.input,
  }));
}

/** `platform`은 **취득 자체의** 플랫폼이고, `platformAccountPlatform`은 **계정의** 소속이다 */
async function acquisitions(d: Db, entryId: number) {
  const rows = await d.select({
    a: acquisition, platform: platform.name, account: platformAccount.accountLabel,
    ap: accountPlatform, ae: accountEmulator, subscription: subscription.serviceName,
  }).from(acquisition)
    .leftJoin(platform, eq(platform.id, acquisition.platformId))
    .leftJoin(platformAccount, eq(platformAccount.id, acquisition.platformAccountId))
    .leftJoin(accountPlatform, eq(accountPlatform.id, platformAccount.platformId))
    .leftJoin(accountEmulator, eq(accountEmulator.id, platformAccount.emulatorId))
    .leftJoin(subscription, eq(subscription.id, acquisition.subscriptionId))
    .where(eq(acquisition.backlogEntryId, entryId))
    .orderBy(asc(acquisition.id));
  return rows.map((r) => ({
    method: r.a.method,
    platform: r.platform,
    platformAccount: r.account,
    platformAccountPlatform: r.account === null ? null : ownerName(r.ap, r.ae),
    subscription: r.subscription,
    price: moneyOut(r.a.priceAmount, r.a.priceCurrency),
    acquiredOn: r.a.acquiredOn,
    label: r.a.label,
  }));
}

