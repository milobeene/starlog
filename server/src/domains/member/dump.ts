/**
 * 회원 데이터 한 벌 — 자바 `MemberExport`. 내보내기·가져오기·덮어쓰기 공용.
 *
 * **사용자가 들고 다니는 파일 형식이다.** 키 이름·순서·null·날짜 모양을 자바와 같게 둔다.
 * 자격증명·파생 상태·커버 실물·id는 담지 않는다 (자바 클래스 주석 그대로).
 *
 * 받는 쪽(Zod)은 Jackson과 같은 관대함으로 읽는다 — 모르는 키는 버리고, 빠진 칸은 null.
 * 본문은 `readBodyExact`로 읽으므로 **JSON 숫자가 원문 글자(문자열)로** 들어온다
 * (`150.0`이 `150`으로 뭉개지면 평점 오류 메시지가 갈린다).
 */
import { z } from "zod";
import { opt, zDate, zDecimal, zLong, zText } from "../../common/schemas";

/** 2 — 회차·취득이 계정을 `라벨 + 소속`으로 가리킨다 (v1.1.3) */
export const FORMAT_VERSION = 2;

/**
 * LocalDateTime — Jackson `ISO_LOCAL_DATE_TIME` (`2026-08-28T15:14:26.781806`, 초·소수는 생략 가능).
 * 못 읽으면 본문 전체가 400이다 (가져오기는 `createdAt`을 안 쓰지만 읽기는 한다)
 */
const zLdt = z.string().refine((s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!
    && +m[4]! < 24 && +m[5]! < 60 && +(m[6] ?? 0) < 60;
});

const text = opt(zText);
const decimal = opt(zDecimal.transform(String));
const int = opt(zLong);
/** `List<String>` — 원소 null도 그대로 들어온다 (정규화 단계에서 걸러진다) */
const texts = opt(z.array(zText.nullable()));
/** 객체 목록 — 원소가 null이면 자바는 꺼내 쓰다 NPE(500)다. 그 자리까지 그대로 들고 간다 */
const list = <T extends z.ZodType>(t: T) => opt(z.array(t.nullable()));

const Money = opt(z.object({ amount: decimal, currency: text }));

const Profile = z.object({ email: text, nickname: text, memo: text, backgroundColors: texts });

const Catalog = z.object({
  platforms: texts,
  accounts: list(z.object({ label: text, platform: text })),
  devices: list(z.object({ deviceType: text, label: text, memo: text })),
  emulators: list(z.object({ name: text, memo: text })),
  inputMethods: texts,
  subscriptions: list(z.object({
    serviceName: text, startedOn: opt(zDate), endedOn: opt(zDate), fee: Money, billingCycle: text,
  })),
  tags: texts,
  genres: texts,
});

const Game = z.object({
  externalId: text, source: text, name: text,
  developers: texts, publishers: texts, masterGenres: texts,
  releasedOn: opt(zDate), listPrice: Money,
  coverImageId: text, bannerImageId: text, summary: text, storyline: text,
  igdbRating: decimal, igdbRatingCount: int, releasePlatforms: texts,
  mainStoryHours: int, mainExtraHours: int, completionistHours: int, timeToBeatSamples: int,
  mediaFolder: text,
});

/**
 * 자바 원시형(`int`·`long`) 칸 — **빠지거나 null이면 본문 전체가 400이다.**
 * 빠짐·null 둘 다 자바가 400을 냈다 (비교 장치 실측). Jackson 3에서 `FAIL_ON_NULL_FOR_PRIMITIVES`가
 * 기본으로 켜졌기 때문이다 — 2.x였다면 0으로 채워져 "지원하지 않는 형식 (파일은 0)"으로 갔을 것
 */
const primitive = zLong;

const Cover = z.object({ storageKey: text, contentType: text, sizeBytes: primitive, location: text });

const Playthrough = z.object({
  sequenceNo: primitive, startedOn: opt(zDate), finishedOn: opt(zDate), status: text, label: text,
  device: text, platformAccount: text, platformAccountPlatform: text, emulator: text, inputMethod: text,
});

const Acquisition = z.object({
  method: text, platform: text, platformAccount: text, platformAccountPlatform: text,
  subscription: text, price: Money, acquiredOn: opt(zDate), label: text,
});

const Entry = z.object({
  gameKey: text, createdAt: opt(zLdt), deletedAt: opt(zLdt),
  nameOverride: text, developerOverrides: texts, publisherOverrides: texts,
  releasedOnOverride: opt(zDate), listPriceOverride: Money,
  rating: decimal, playTimeHours: decimal, memo: text, tag: text, genres: texts,
  cover: opt(Cover), playthroughs: list(Playthrough), acquisitions: list(Acquisition),
});

/** 요청 본문 (`@RequestBody MemberExport`) */
export const MemberDump = z.object({
  formatVersion: primitive,
  exportedAt: opt(zLdt),
  profile: opt(Profile),
  catalog: opt(Catalog),
  games: list(Game),
  entries: list(Entry),
});

export type MemberDump = z.output<typeof MemberDump>;
export type DumpMoney = z.output<typeof Money>;
export type DumpCatalog = NonNullable<MemberDump["catalog"]>;
export type DumpProfile = NonNullable<MemberDump["profile"]>;
export type DumpGame = z.output<typeof Game>;
export type DumpEntry = z.output<typeof Entry>;
export type DumpCover = z.output<typeof Cover>;


/** 자바 `NullPointerException` 자리 — 전역 핸들러가 못 잡아 스프링 기본 500 본문이 나간다 */
export function npe(what: string): never {
  throw new Error(`NullPointerException: ${what}`);
}

/** 자바 `Enum.valueOf` — null이면 NPE, 없는 이름이면 IllegalArgumentException. 둘 다 500 */
export function valueOf<T extends string>(values: readonly T[], name: string | null, what: string): T {
  if (name === null) npe(`${what} is null`);
  if (!(values as readonly string[]).includes(name)) throw new Error(`IllegalArgumentException: No enum constant ${what}.${name}`);
  return name as T;
}
