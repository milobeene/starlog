/**
 * 데이터 한 벌. 내보내기·가져오기·덮어쓰기 공용.
 *
 * **사용자가 들고 다니는 파일 형식이다.** 키 이름·순서·null·날짜 모양을 바꾸면 이미 받아 둔 백업을 못 읽는다.
 * 자격증명·파생 상태·id는 담지 않는다. 커버 실물은 DB 커버(형식 6)만 — LOCAL·EXTERNAL은 키만 싣는다.
 *
 * 받는 쪽(Zod)은 관대하게 읽는다 — 모르는 키는 버리고, 빠진 칸은 null.
 * 본문은 `readBodyExact`로 읽으므로 **JSON 숫자가 원문 글자(문자열)로** 들어온다
 * (`150.0`이 `150`으로 뭉개지면 평점 오류 메시지가 입력과 갈린다).
 */
import { z } from "zod";
import { opt, zDate, zDecimal, zLong, zText } from "../../common/schemas";

/**
 * 2 — 회차·취득이 계정을 `라벨 + 소속`으로 가리킨다 (v1.1.3).
 * 3 — 계정에 소속 종류가 생겼다: `accounts[]`의 `platform`·`emulator` 중 하나, 회차·취득은
 *     `platformAccountPlatform`·`platformAccountEmulator` 중 하나 (2026-10-24). 2 이하는 전부 플랫폼 계정이다.
 *     올린 이유 — 옛 앱이 이 파일을 읽으면 에뮬 계정을 플랫폼 계정으로 만들려다 엉뚱한 400이 난다
 * 4 — 프로필에서 `email`이 빠지고 `backgroundPresets`가 들어왔다 (V14, 2026-10-24). 읽기는 1~3도 그대로 —
 *     옛 파일의 `email`은 버리고, 프리셋이 없으면 지금 프리셋을 건드리지 않는다
 *
 * 항목의 `playRecords`(플레이타임 기록, v2 S4)는 **번호를 안 올리고** 더했다 — 양쪽으로 안전해서다.
 * 옛 앱은 모르는 키를 버리고 `playTimeHours`(합계, 그대로 싣는다)를 쓰고, 새 앱은 `playRecords`가 없는
 * 옛 파일을 합계에서 BASELINE 한 줄로 만든다
 * 5 — 왕복에서 잃던 것을 싣는다 (2026-10-25). 플랫폼·입력방식·태그가 이름 글자에서 객체로 바뀌어 옛 앱은 못 읽는다
 *     - 카탈로그는 **지운 행까지** `deletedAt`과 함께 — 살아 있는 계정·회차·취득이 지운 소속을 가리킬 수 있다.
 *       가져오기는 파일에 없는 기본 플랫폼·입력방식을 지운 것으로 둔다 (안 그러면 빈 세이브의 시드가 되살아난다)
 *     - 태그는 `{name, color, sortOrder}`, 안 쓰는 태그까지
 *     - 게임마다 `key` — 이름이 같은 수동 게임이 키 하나로 합쳐지지 않게 덤프 안에서만 쓰는 열쇠
 *     - 취득의 `subscriptionIndex` — 구독은 이름이 겹칠 수 있어(재구독) `catalog.subscriptions`의 순번으로 가리킨다
 *     - 항목 `createdAt`을 그대로 되살린다
 *     4 이하는 예전과 똑같이 읽는다
 * 6 — DB 커버(V17)의 바이트를 싣는다 (2026-10-25). 커버에 `location: "DB"` + `data`(base64), 타입은 `contentType`.
 *     LOCAL·EXTERNAL 커버는 예전처럼 키만. 옛 앱은 `DB` 위치를 모르므로 번호를 올렸다 (5 이하를 읽는 동작은 그대로 —
 *     5 이하 파일의 `DB`는 예전처럼 모르는 위치다)
 */
export const FORMAT_VERSION = 6;

/** 커버 한 장(5MB)의 base64 — 4/3배 + 여유. 본문 한도(256MB)는 따로 걸린다 */
const MAX_COVER_BASE64 = Math.ceil((5 * 1024 * 1024) / 3) * 4 + 16;

/**
 * ISO 로컬 날짜시각 (`2026-08-28T15:14:26.781806`, 초·소수는 생략 가능).
 * 못 읽으면 본문 전체가 400이다
 */
const zLdt = z.string().refine((s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!
    && +m[4]! < 24 && +m[5]! < 60 && +(m[6] ?? 0) < 60;
});

/**
 * 길이 상한 — 본문 한도(~256MB) 안에서도 한 칸이 수십 MB거나 배열이 수백만 개면 DB·메모리가 먼저 죽는다.
 * 실제 내보내기가 340KB 안팎이라 넉넉하게 잡았다 (한도를 넘는 파일은 400 "읽을 수 없습니다")
 */
const MAX_TEXT = 20_000;
const MAX_LONG_TEXT = 200_000;   // 요약·줄거리·메모
const MAX_ITEMS = 20_000;        // 게임·항목·카탈로그 목록
const MAX_SUB_ITEMS = 2_000;     // 항목 하나의 회차·취득·장르 따위

const shortText = zText.refine((v) => String(v).length <= MAX_TEXT);
const longText = opt(zText.refine((v) => String(v).length <= MAX_LONG_TEXT));
const text = opt(shortText);
const decimal = opt(zDecimal.transform(String));
const int = opt(zLong);
/** 문자열 목록 — 원소 null도 그대로 들어온다 (정규화 단계에서 걸러진다) */
const texts = opt(z.array(shortText.nullable()).max(MAX_SUB_ITEMS));
/** 객체 목록 — 원소가 null이면 꺼내 쓰는 자리에서 NPE 500이 난다 (`npe`). 그 자리까지 그대로 들고 간다 */
const list = <T extends z.ZodType>(t: T, max = MAX_SUB_ITEMS) => opt(z.array(t.nullable()).max(max));
const bigList = <T extends z.ZodType>(t: T) => list(t, MAX_ITEMS);

const Money = opt(z.object({ amount: decimal, currency: text }));

/** `backgroundPresets`는 모양 검사를 `presetsValue`가 한다 (프로필 수정과 같은 규칙·메시지) */
const Profile = z.object({ nickname: text, memo: longText, backgroundColors: texts, backgroundPresets: z.unknown().optional() });

const deletedAt = opt(zLdt);

/** 형식 4까지는 이름 글자, 5부터 `{name, deletedAt}` — 읽은 뒤엔 한 모양이다 (null 원소는 이름 null → 만들 때 400) */
const namedList = opt(z.array(z.union([shortText, z.object({ name: text, deletedAt })]).nullable()).max(MAX_ITEMS)
  .transform((vs) => vs.map((v) => (v === null || typeof v === "string" ? { name: v, deletedAt: null } : v))));

/** 형식 4까지는 이름 글자, 5부터 `{name, color, sortOrder}` */
const tagList = opt(z.array(z.union([shortText, z.object({ name: text, color: text, sortOrder: int })]).nullable()).max(MAX_ITEMS)
  .transform((vs) => vs.map((v) => (v === null || typeof v === "string" ? { name: v, color: null, sortOrder: null } : v))));

const Catalog = z.object({
  platforms: namedList,
  /** 형식 2 이하엔 `emulator`가 없다 → null → 플랫폼 계정 */
  accounts: bigList(z.object({ label: text, platform: text, emulator: text, deletedAt })),
  devices: bigList(z.object({ deviceType: text, label: text, memo: longText, deletedAt })),
  emulators: bigList(z.object({ name: text, memo: longText, deletedAt })),
  inputMethods: namedList,
  subscriptions: bigList(z.object({
    serviceName: text, startedOn: opt(zDate), endedOn: opt(zDate), fee: Money, billingCycle: text,
  })),
  tags: tagList,
  genres: opt(z.array(shortText.nullable()).max(MAX_ITEMS)),
});

const Game = z.object({
  key: text,
  externalId: text, source: text, name: text,
  developers: texts, publishers: texts, masterGenres: texts,
  releasedOn: opt(zDate), listPrice: Money,
  coverImageId: text, bannerImageId: text, summary: longText, storyline: longText,
  igdbRating: decimal, igdbRatingCount: int, releasePlatforms: texts,
  mainStoryHours: int, mainExtraHours: int, completionistHours: int, timeToBeatSamples: int,
  mediaFolder: text,
});

/**
 * 필수 숫자 칸 — **빠지거나 null이면 본문 전체가 400이다.**
 * 0으로 채우지 않는다 (채우면 "지원하지 않는 형식 (파일은 0)"으로 갈린다)
 */
const primitive = zLong;

const Cover = z.object({
  storageKey: text, contentType: text, sizeBytes: primitive, location: text,
  /** 형식 6, DB 커버만 — 바이트 base64. 글자 상한(MAX_TEXT)으로는 한 장도 못 담아 따로 잰다 */
  data: opt(z.string().max(MAX_COVER_BASE64)),
});

const Playthrough = z.object({
  sequenceNo: primitive, startedOn: opt(zDate), finishedOn: opt(zDate), status: text, label: text,
  device: text, platformAccount: text, platformAccountPlatform: text, platformAccountEmulator: text,
  emulator: text, inputMethod: text,
});

const Acquisition = z.object({
  method: text, platform: text, platformAccount: text, platformAccountPlatform: text, platformAccountEmulator: text,
  subscription: text, subscriptionIndex: int, price: Money, acquiredOn: opt(zDate), label: text,
});

/** STARLOG 기록만 — homeops 일정은 homeops 쪽 데이터라 안 싣는다(합계 차이는 가져올 때 메운다) */
const PlayRecord = z.object({ kind: text, minutes: decimal, playedOn: opt(zDate), note: longText });

const Entry = z.object({
  gameKey: text, createdAt: opt(zLdt), deletedAt: opt(zLdt),
  nameOverride: text, developerOverrides: texts, publisherOverrides: texts,
  releasedOnOverride: opt(zDate), listPriceOverride: Money,
  rating: decimal, playTimeHours: decimal, memo: longText, tag: text, genres: texts,
  cover: opt(Cover), playthroughs: list(Playthrough), acquisitions: list(Acquisition),
  playRecords: list(PlayRecord, 20_000),
});

/** 요청 본문 */
export const MemberDump = z.object({
  formatVersion: primitive,
  exportedAt: opt(zLdt),
  profile: opt(Profile),
  catalog: opt(Catalog),
  games: bigList(Game),
  entries: bigList(Entry),
});

export type MemberDump = z.output<typeof MemberDump>;
export type DumpMoney = z.output<typeof Money>;
export type DumpCatalog = NonNullable<MemberDump["catalog"]>;
export type DumpProfile = NonNullable<MemberDump["profile"]>;
export type DumpGame = z.output<typeof Game>;
export type DumpEntry = z.output<typeof Entry>;
export type DumpCover = z.output<typeof Cover>;
export type DumpPlayRecord = z.output<typeof PlayRecord>;


/** 의도된 500 — 값이 null인 채 꺼내 쓰이던 자리. 전역 핸들러가 못 잡아 기본 500 본문이 나간다 */
export function npe(what: string): never {
  throw new Error(`NullPointerException: ${what}`);
}

/** enum 이름 해석 — null이면 NPE, 없는 이름이면 IllegalArgumentException. 둘 다 400이 아니라 500이다 (의도) */
export function valueOf<T extends string>(values: readonly T[], name: string | null, what: string): T {
  if (name === null) npe(`${what} is null`);
  if (!(values as readonly string[]).includes(name)) throw new Error(`IllegalArgumentException: No enum constant ${what}.${name}`);
  return name as T;
}
