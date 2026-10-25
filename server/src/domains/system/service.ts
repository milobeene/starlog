/**
 * 시스템 — 다른 도메인이 쓰는 부분과 시스템 현황.
 *
 *   - `recordApiCall` — 외부 API 호출을 한 줄 남긴다
 *   - 앱 설정 — IGDB·번역 키, 번역 하루 한도
 *   - 번역 한도와 번역
 *   - 시스템 현황
 *
 * ⚠️ **`recordApiCall`·`recordTranslation`은 부르는 쪽 트랜잭션과 따로 커밋된다** (롤백돼도 기록은 남는다).
 * 그래서 `db()`로 바로 쓴다. **트랜잭션 콜백 안에서 부르면 안 된다** — PGlite는 세션이 하나라
 * 열린 트랜잭션이 끝날 때까지 `db()` 쿼리가 기다리고, 그 트랜잭션은 이 쿼리를 기다린다(교착).
 * 외부 호출은 어차피 트랜잭션 밖이므로 기록도 그 자리에서 한다.
 */
import { and, eq, gte, min, sql, count } from "drizzle-orm";
import { db, type Db } from "../../db/client";
import { apiCallLog, appSetting, coverImage, game } from "../../db/schema";
import { one } from "../../db/raw";
import { ExternalApi, InvalidInput, NotFound, TooManyRequests } from "../../common/errors";
import { nowKst } from "../../common/clock";
import { ldt } from "../../common/json";
import { config } from "../../config";
import { coversDir, folderSize, mediaDir, storageHasCredentials } from "../../common/storage";
import { isJavaBlank, javaStrip } from "../../common/text";

// ───────────── 호출 기록 ─────────────

/** 한도를 여기 적지 않는다 — 벤더가 바꾸면 조용히 거짓말이 된다. 화면이 기준일과 함께 든다 */
export const API_PROVIDERS = ["IGDB", "STORAGE", "TRANSLATE"] as const;
export type ApiProvider = (typeof API_PROVIDERS)[number];

/**
 * 호출 한 줄. **실패를 삼킨다** — 계측이 본체를 망가뜨리면 안 된다.
 * 성공·실패를 안 가리고 센다 (실패도 대개 한도를 소모한다)
 */
export async function recordApiCall(provider: ApiProvider, operation: string, success: boolean): Promise<void> {
  try {
    const now = nowKst();
    await db().insert(apiCallLog).values({ provider, operation, calledAt: now, success, units: null, createdAt: now, updatedAt: now });
  } catch (e) {
    console.warn(`API 호출 기록 실패 — 본체는 계속한다. provider=${provider} operation=${operation}`, e);
  }
}

// ───────────── 앱 설정 ─────────────

export const SETTING = {
  IGDB_CLIENT_ID: "igdb.clientId",
  IGDB_CLIENT_SECRET: "igdb.clientSecret",
  /** 런타임에 바꿔도 되는 값이라 부팅 설정이 아니라 DB다 — 세이브파일을 옮기면 키도 함께 간다 */
  TRANSLATE_API_KEY: "translate.apiKey",
  /** 구글 콘솔에 걸어둔 하루 할당량의 **사본**. 우리가 강제하는 값이 아니다 */
  TRANSLATE_DAILY_CHARS: "translate.dailyChars",
} as const;

const blankToNull = (v: string | null | undefined) => (isJavaBlank(v) ? null : v!);

/** 두세 줄뿐이라 통째로 읽는다 */
export async function allSettings(d: Db = db()): Promise<Map<string, string | null>> {
  const list = await d.select({ k: appSetting.settingKey, v: appSetting.settingValue }).from(appSetting);
  return new Map(list.map((r) => [r.k, r.v]));
}

export interface IgdbCredentials { clientId: string | null; clientSecret: string | null }
export const igdbCredentialsPresent = (c: IgdbCredentials) => !isJavaBlank(c.clientId) && !isJavaBlank(c.clientSecret);

/**
 * 부팅 설정. 환경변수가 없으면 null이 아니라 **빈 문자열**이다 —
 * 설정 화면 응답(`igdbClientId: ""`)에 그대로 드러난다
 */
function bootIgdb(): IgdbCredentials {
  const c = config().igdb;
  return { clientId: c.clientId ?? "", clientSecret: c.clientSecret ?? "" };
}

/** **DB가 먼저, 없으면 부팅 설정** — 앱에서 바꾼 값이 이겨야 한다. 둘 중 하나라도 비면 둘 다 부팅 설정 */
export async function igdbCredentials(d: Db = db()): Promise<IgdbCredentials> {
  const values = await allSettings(d);
  const id = blankToNull(values.get(SETTING.IGDB_CLIENT_ID));
  const secret = blankToNull(values.get(SETTING.IGDB_CLIENT_SECRET));
  if (id === null || secret === null) return bootIgdb();
  return { clientId: id, clientSecret: secret };
}

/** 번역 키. DB가 먼저, 없으면 부팅 설정(연결 설정이 넣어준 환경변수) */
export async function translateApiKey(d: Db = db()): Promise<string | null> {
  const stored = blankToNull((await allSettings(d)).get(SETTING.TRANSLATE_API_KEY));
  return stored ?? blankToNull(config().translateApiKey);
}

/**
 * 넣거나 바꾼다 — 여럿이면 **한 트랜잭션으로**(넣은 순서대로). **값이 실제로 바뀔 때만** UPDATE한다 (`updated_at`이 그대로 남는다)
 */
export async function putSettings(values: Record<string, string>): Promise<void> {
  await db().transaction(async (tx) => {
    for (const [key, value] of Object.entries(values)) {
      const [row] = await tx.select().from(appSetting).where(eq(appSetting.settingKey, key));
      const now = nowKst();
      if (!row) {
        await tx.insert(appSetting).values({ settingKey: key, settingValue: value, createdAt: now, updatedAt: now });
      } else if (row.settingValue !== value) {
        await tx.update(appSetting).set({ settingValue: value, updatedAt: now }).where(eq(appSetting.settingKey, key));
      }
    }
  });
}

// ───────────── 번역 한도 ─────────────

/** 구글이 매달 공짜로 주는 양 */
export const FREE_MONTHLY_CHARS = 500_000;
/** 우리가 실제로 막는 선. 5만 자는 우리가 적게 셀 수 있는 오차의 여유다 */
export const GUARD_MONTHLY_CHARS = 450_000;
/** 한 번에 보낼 수 있는 최대 글자 수 — 책 한 권이 통째로 넘어오는 사고를 한 번으로 끝낸다 */
export const MAX_CHARS_PER_CALL = 25_000;

/** 64비트 정수만 받는다 — 부호 허용, 범위 밖은 실패 */
export function parseJavaLong(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) return null;
  const n = BigInt(s);
  if (n < -(2n ** 63n) || n > 2n ** 63n - 1n) return null;
  return Number(n);
}

/** 천 단위 쉼표 (`1,234`) */
export const grouped = (n: number) => n.toLocaleString("en-US");

/** 사람이 적어둔 하루 한도. 안 적었거나 숫자가 아니면 null — 그때는 안 막는다 */
export async function translationDailyLimit(d: Db = db()): Promise<number | null> {
  const raw = (await allSettings(d)).get(SETTING.TRANSLATE_DAILY_CHARS);
  if (raw === null || raw === undefined || isJavaBlank(raw)) return null;
  const v = parseJavaLong(javaStrip(raw));
  return v !== null && v > 0 ? v : null;
}

const QUOTA_ZONE = "America/Los_Angeles";

function zoneParts(instant: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, s: +p.second! };
}

/** 그 시간대의 벽시계 자정이 가리키는 순간. LA의 서머타임 전환은 새벽 2시라 자정은 늘 있다 */
function midnightIn(timeZone: string, y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  const p = zoneParts(new Date(guess), timeZone);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - guess;
  return new Date(guess - offset);
}

/**
 * ⚠️ **하루·한 달 모두 태평양 기준이다** — 구글의 할당량이 그쪽 자정에 리셋된다.
 * 태평양 자정을 우리 시각(KST 벽시계)으로 옮긴 값과 `called_at`을 비교한다.
 */
function startOfPacificDay(now = new Date()): string {
  const p = zoneParts(now, QUOTA_ZONE);
  return nowKst(midnightIn(QUOTA_ZONE, p.y, p.m, p.d));
}

function startOfPacificMonth(now = new Date()): string {
  const p = zoneParts(now, QUOTA_ZONE);
  return nowKst(midnightIn(QUOTA_ZONE, p.y, p.m, 1));
}

async function sumUnitsSince(d: Db, since: string, succeededOnly: boolean): Promise<number> {
  const conds = [eq(apiCallLog.provider, "TRANSLATE"), gte(apiCallLog.calledAt, since)];
  if (succeededOnly) conds.push(eq(apiCallLog.success, true));
  const [r] = await d.select({ v: sql<string>`coalesce(sum(${apiCallLog.units}), 0)` }).from(apiCallLog).where(and(...conds));
  return Number(r!.v);
}

/** 이번 달에 쓴 글자 수 — **실패도 센다** (구글은 이미 받아 세었을 수 있다. 적게 세는 쪽이 위험하다) */
export const translationUsedThisMonth = (d: Db = db()) => sumUnitsSince(d, startOfPacificMonth(), false);

/** 오늘 쓴 글자 수 — **성공만** 센다 (화면에 그대로 나간다. 거절당한 호출은 구글이 안 센다) */
export const translationUsedToday = (d: Db = db()) => sumUnitsSince(d, startOfPacificDay(), true);

export interface TranslationUsage { usedChars: number; guardChars: number; freeChars: number; remainingChars: number }

export async function translationUsage(d: Db = db()): Promise<TranslationUsage> {
  const used = await translationUsedThisMonth(d);
  return { usedChars: used, guardChars: GUARD_MONTHLY_CHARS, freeChars: FREE_MONTHLY_CHARS, remainingChars: Math.max(0, GUARD_MONTHLY_CHARS - used) };
}

/**
 * 보내도 되는지. **호출 전에** — 다녀와서 보면 이미 늦다. 넘으면 429(우리가 스스로 막은 것)
 */
export async function checkTranslationQuota(chars: number, d: Db = db()): Promise<void> {
  const limit = await translationDailyLimit(d);
  if (limit !== null) {
    const usedToday = await translationUsedToday(d);
    if (usedToday + chars > limit) {
      throw new TooManyRequests("TRANSLATE_DAILY_QUOTA_EXCEEDED",
        `오늘 쓸 수 있는 번역량(${grouped(limit)}자)을 다 쓰셨습니다. 지금까지 ${grouped(usedToday)}자를 쓰셨고 `
        + `이번 요청은 ${grouped(chars)}자입니다. 한국 시간 오후 4~5시(태평양 자정)에 새로 채워집니다.`);
    }
  }
  if (chars <= 0) throw new InvalidInput("번역할 내용이 없습니다");
  if (chars > MAX_CHARS_PER_CALL) {
    throw new InvalidInput(`한 번에 ${grouped(MAX_CHARS_PER_CALL)}자까지 번역할 수 있습니다 (요청 ${grouped(chars)}자)`);
  }
  const used = await translationUsedThisMonth(d);
  // ⚠️ 더한 값으로 비교한다. `used > 한도`면 한도 직전의 큰 요청이 통과한다 — 그 순간이 돈이 나가는 순간이다
  if (used + chars > GUARD_MONTHLY_CHARS) {
    console.warn(`번역 한도에 걸려 거절했습니다. 이번 달 ${used}자 사용, 요청 ${chars}자`);
    throw new TooManyRequests("TRANSLATE_QUOTA_EXCEEDED",
      `이번 달 번역 한도(${grouped(GUARD_MONTHLY_CHARS)}자)에 도달했습니다. 지금까지 ${grouped(used)}자를 쓰셨습니다. 다음 달에 다시 쓰실 수 있습니다.`);
  }
}

/**
 * 쓴 만큼 기록한다. `recordApiCall`과 달리 **실패를 안 삼킨다** — 안 남으면 다음 검사가 덜 쓴 줄 안다.
 * `db()`로 따로 커밋 (트랜잭션 안에서 부르지 말 것)
 */
export async function recordTranslation(chars: number, success: boolean): Promise<void> {
  const now = nowKst();
  await db().insert(apiCallLog).values({ provider: "TRANSLATE", operation: "translate", calledAt: now, success, units: chars, createdAt: now, updatedAt: now });
}

// ───────────── 번역 ─────────────

const TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";

/** 4xx 응답 — 상태별로 문구를 가른다 (나머지 실패는 한 문구) */
class Http4xx extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

/**
 * Google Cloud Translation v2. `q`를 **여러 개** 보내고 같은 순서로 받는다 — 이어 붙였다면
 * 구분자를 번역기가 옮겨버려 경계가 어긋난다. `format=text`가 없으면 `&#39;`가 그대로 보인다.
 *
 * 실패는 전부 502로 접는다 — 4xx는 상태별 문구, 5xx·연결 실패·응답 해석 실패는 한 문구 (고친 버그 8, `docs/v2-plan.md`)
 */
export async function toKorean(apiKey: string, texts: string[]): Promise<string[]> {
  const body = new URLSearchParams();
  for (const t of texts) body.append("q", t);
  body.append("target", "ko");
  body.append("format", "text");
  let found: { data?: { translations?: { translatedText?: string | null }[] | null } | null } | null;
  try {
    // 키는 주소가 아니라 머리글로 — 주소는 오류 객체·프록시 로그에 남는다 (구글 API 공통 `X-Goog-Api-Key`)
    const res = await fetch(TRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json", "X-Goog-Api-Key": apiKey },
      body,
    });
    if (res.status >= 400 && res.status < 500) throw new Http4xx(res.status);
    if (!res.ok) throw new Error(`번역 서버 오류 ${res.status}`);
    const text = await res.text();
    found = text.trim() === "" ? null : JSON.parse(text);
  } catch (e) {
    if (e instanceof Http4xx) {
      console.warn(`번역 실패 — ${e.status}`);
      throw new ExternalApi("TRANSLATE", ({ 400: "번역 요청이 올바르지 않습니다", 403: "이 키로는 번역 API를 부를 수 없습니다",
        429: "구글의 할당량을 넘었습니다. 콘솔에서 하루 한도를 확인해 주세요" } as Record<number, string>)[e.status]
        ?? `구글이 ${e.status}로 응답했습니다`);
    }
    console.warn("번역 실패 — 서버 오류·연결 실패·응답 해석 실패", e);
    throw new ExternalApi("TRANSLATE", e instanceof Error ? e.message : String(e));
  }
  const translations = found?.data?.translations ?? [];
  // ⚠️ 개수가 맞아야 한다. 순서로 짝을 짓는데 하나라도 빠지면 스토리라인이 소개문 자리에 들어간다
  if (translations.length !== texts.length) throw new ExternalApi("TRANSLATE", "번역 결과의 개수가 맞지 않습니다");
  return translations.map((t) => t?.translatedText ?? null) as string[];
}

export interface TranslationResult { summaryKo: string | null; storylineKo: string | null; usedChars: number; remainingChars: number }

const hasText = (v: string | null) => !isJavaBlank(v);

/**
 * 게임 소개문·스토리라인 번역. 순서가 전부다:
 *   1. 원문을 꺼낸다 → 2. **보내기 전에** 한도를 본다 → 3. 구글 → 4. 성공·실패 상관없이 기록 → 5. 저장
 *
 * 구글 호출은 트랜잭션에 넣지 않는다 — PGlite는 트랜잭션 동안 앱 전체가 멈춘다.
 * 기록은 게임 저장보다 먼저 따로 커밋되고, 응답의 남은 양은 기록 **전에** 계산한다 (이번 호출분은 `- chars`로 직접 뺀다)
 */
export async function translateGame(gameId: number): Promise<TranslationResult> {
  const d = db();
  const [g] = await d.select({ summary: game.summary, storyline: game.storyline }).from(game).where(eq(game.id, gameId));
  if (!g) throw new NotFound(`게임을 찾을 수 없습니다. id=${gameId}`);

  const apiKey = await translateApiKey(d);
  if (apiKey === null) throw new InvalidInput("번역 키가 없습니다. 시스템 → 연결에서 넣어 주세요");

  // 있는 것만 보낸다. 빈 문자열을 보내면 개수 검사가 헛돌 뿐이다
  const sources: string[] = [];
  if (hasText(g.summary)) sources.push(g.summary!);
  if (hasText(g.storyline)) sources.push(g.storyline!);
  if (sources.length === 0) throw new InvalidInput("번역할 내용이 없습니다");

  const chars = sources.reduce((n, s) => n + s.length, 0);   // UTF-16 코드 단위 길이
  await checkTranslationQuota(chars, d);

  let ok = false;
  let result: TranslationResult;
  try {
    const korean = await toKorean(apiKey, sources);
    ok = true;
    // 보낸 순서대로 돌아온다. 보낼 때 뺀 것은 받을 때도 없다
    let at = 0;
    const summaryKo = hasText(g.summary) ? korean[at++] ?? null : null;
    const storylineKo = hasText(g.storyline) ? korean[at] ?? null : null;
    const remaining = Math.max(0, GUARD_MONTHLY_CHARS - await translationUsedThisMonth(d) - chars);
    result = { summaryKo, storylineKo, usedChars: chars, remainingChars: remaining };
    console.log(`소개문·스토리라인을 번역했습니다. gameId=${gameId} ${chars}자`);
  } finally {
    // ⚠️ 실패해도 기록한다 — 우리만 안 세면 그 차이만큼 한도를 넘긴다
    await recordTranslation(chars, ok);
  }
  const now = nowKst();
  await d.update(game).set({ summaryKo: result.summaryKo, storylineKo: result.storylineKo, summaryTranslatedAt: now, updatedAt: now })
    .where(eq(game.id, gameId));
  return result;
}

// ───────────── 시스템 현황 ─────────────

/** 호출 기록 보존 기간 — 사용량 "지난 30일"과 기동 때 정리(`startup.ts`)가 같이 쓴다 */
export const RETENTION_DAYS = 30;

const minusMs = (now: Date, ms: number) => nowKst(new Date(now.getTime() - ms));

async function usageOf(d: Db, provider: ApiProvider, now: Date) {
  const countSince = async (since: string, failedOnly = false) => {
    const conds = [eq(apiCallLog.provider, provider), gte(apiCallLog.calledAt, since)];
    if (failedOnly) conds.push(eq(apiCallLog.success, false));
    const [r] = await d.select({ n: count() }).from(apiCallLog).where(and(...conds));
    return Number(r!.n);
  };
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const [oldest] = await d.select({ v: min(apiCallLog.calledAt) }).from(apiCallLog).where(eq(apiCallLog.provider, provider));
  return {
    provider,
    lastMinute: await countSince(minusMs(now, MIN)),
    lastHour: await countSince(minusMs(now, HOUR)),
    lastDay: await countSince(minusMs(now, DAY)),
    lastMonth: await countSince(minusMs(now, RETENTION_DAYS * DAY)),
    failedLastDay: await countSince(minusMs(now, DAY), true),
    since: ldt(oldest?.v ?? null),
  };
}

/** `pg_database_size`. 실패하면 null */
async function databaseSize(d: Db): Promise<number | null> {
  try {
    const r = await one<{ v: number | string }>(d, sql`select pg_database_size(current_database()) as v`);
    return r ? Number(r.v) : null;
  } catch {
    return null;
  }
}

/**
 * **내 테이블만** — `pg_database_size`는 시스템 카탈로그 7MB가 섞여 게임을 넣어도 안 움직였다.
 * 스키마는 연결된 것(`current_schema()`)으로 — 스키마를 지정한 클라우드(결정 60)는 `public`이 아니다 (고친 버그 10)
 */
async function myTablesSize(d: Db): Promise<number | null> {
  try {
    const r = await one<{ v: string | number }>(d, sql`select coalesce(sum(pg_total_relation_size(c.oid)), 0) as v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = current_schema()`);
    return Number(r!.v);
  } catch {
    return databaseSize(d);
  }
}

export async function systemStatus(d: Db = db()) {
  const now = new Date();
  // ⚠️ 번역은 뺀다 — 단위가 횟수가 아니라 글자 수다. 아래 `translation`이 따로 담는다
  const apiUsage = [];
  for (const p of API_PROVIDERS) if (p !== "TRANSLATE") apiUsage.push(await usageOf(d, p, now));

  // 스토리지에 실제로 있는 커버만 — DB·로컬 폴더 커버까지 세면 스토리지를 안 써도 보관량이 찬다
  const [covers] = await d.select({ n: count(), bytes: sql<string>`coalesce(sum(${coverImage.sizeBytes}), 0)` }).from(coverImage)
    .where(eq(coverImage.location, "EXTERNAL"));
  const storage = { coverCount: Number(covers!.n), totalBytes: Number(covers!.bytes), configured: storageHasCredentials() };

  const database = {
    product: "PostgreSQL",   // PGlite·Neon 둘 다 Postgres다
    sizeBytes: await myTablesSize(d),
    totalBytes: await databaseSize(d),
    coverBytes: folderSize(coversDir()),
    mediaBytes: folderSize(mediaDir()),
  };

  const used = await translationUsage(d);
  const translation = {
    ...used,
    usedTodayChars: await translationUsedToday(d),
    // 실제로 막는 쪽과 같은 값을 쓴다 — 다르면 "게이지는 여유가 있는데 거절당하는" 어긋남이 생긴다
    dailyLimitChars: await translationDailyLimit(d),
  };
  return { apiUsage, storage, database, retentionDays: RETENTION_DAYS, translation };
}
