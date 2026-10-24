/**
 * 통계 (FR-STAT-01~04, 07). 조회 전용.
 *
 * 금액은 전부 센트(BigInt)로 더한다 — numeric을 scale 2 그대로 합산하는 것과 같고, 부동소수점 오차가 없다.
 */
import { Hono } from "hono";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { AppEnv } from "../../http/env";
import { db } from "../../db/client";
import { rows } from "../../db/raw";
import {
  acquisition, backlogEntry, backlogEntryGenre, genre, playthrough, subscription,
} from "../../db/schema";
import { query } from "../../http/params";
import { todayKst } from "../../common/clock";
import { amountJson, scale2, toCents } from "../../common/money";

const MAX_TOP = 50;

/** 센트 → `1234.50` (scale 2 문자열). 합계는 음수가 없다 */
function fromCents(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** UTF-16 코드 유닛 순 비교. JS의 `<`가 같은 규칙이라 기존 응답과 정렬이 같다 */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 구독 합계의 "오늘". 원래 구현은 서버 시스템 시간대를 따랐지만 KST 환경에선 `todayKst()`와 같다
 * (알려진 버그 3, `docs/v2-plan.md`)
 */
const today = () => todayKst();

/** 월 산술용 — 연*12+월(0부터) */
const ym = (date: string) => Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1);
const ymString = (n: number) => `${String(Math.floor(n / 12)).padStart(4, "0")}-${String((n % 12) + 1).padStart(2, "0")}`;

export const routes = new Hono<AppEnv>();

/**
 * 장르별 분포 (FR-STAT-01). 개인 장르가 1개라도 있는 항목은 개인 것만, 하나도 없으면 마스터 것 (§6.7).
 * group by가 항목별 분기를 못 해서 두 집합을 따로 세어 합친다
 */
routes.get("/api/stats/genres", async (c) => {
  const memberId = c.get("memberId");
  const d = db();

  const personal = await d
    .select({ name: genre.name, count: sql<number>`count(distinct ${backlogEntry.id})`.mapWith(Number) })
    .from(backlogEntryGenre)
    .innerJoin(backlogEntry, eq(backlogEntryGenre.backlogEntryId, backlogEntry.id))
    .innerJoin(genre, eq(backlogEntryGenre.genreId, genre.id))
    .where(and(eq(backlogEntry.memberId, memberId), isNull(backlogEntry.deletedAt)))
    .groupBy(genre.name);

  const master = await rows<{ genre: string | null; count: string | number }>(d, sql`
    select mg.genre as genre, count(distinct b.id) as count
    from backlog_entry b
      join game g on g.id = b.game_id
      join game_master_genre mg on mg.game_id = g.id
    where b.member_id = ${memberId}
      and b.deleted_at is null
      and not exists (select 1 from backlog_entry_genre l where l.backlog_entry_id = b.id)
    group by mg.genre`);

  const merged = new Map<string | null, number>();
  for (const r of personal) merged.set(r.name, (merged.get(r.name) ?? 0) + r.count);
  for (const r of master) merged.set(r.genre, (merged.get(r.genre) ?? 0) + Number(r.count));

  const out = [...merged.entries()]
    .map(([g, count]) => ({ genre: g, count }))
    // 마스터 장르가 null이어도 터지지 않고 null 키로 나간다 (알려진 버그 4, `docs/v2-plan.md` — 실데이터엔 0건)
    .sort((a, b) => b.count - a.count || cmp(a.genre as string, b.genre as string));
  return c.json(out);
});

/**
 * 월별 완료 추이 (FR-STAT-02). 완료 = 종료일이 있는 COMPLETED 회차 — 항목 상태가 아니다.
 * 이름은 `displayName`(오버라이드 반영)
 */
routes.get("/api/stats/completions/monthly", async (c) => {
  const memberId = c.get("memberId");
  const found = await db()
    .select({ finishedOn: playthrough.finishedOn, name: backlogEntry.displayName })
    .from(playthrough)
    .innerJoin(backlogEntry, eq(playthrough.backlogEntryId, backlogEntry.id))
    .where(and(
      eq(backlogEntry.memberId, memberId),
      isNull(backlogEntry.deletedAt),
      isNotNull(playthrough.finishedOn),
      eq(playthrough.status, "COMPLETED"),
    ));

  const byMonth = new Map<string, string[]>();
  const byYear = new Map<number, number>();
  for (const r of found) {
    const year = Number(r.finishedOn!.slice(0, 4));
    const period = r.finishedOn!.slice(0, 7);
    let list = byMonth.get(period);
    if (!list) byMonth.set(period, (list = []));
    list.push(r.name);
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }

  // 같은 달 안의 이름은 정렬한다 — 툴팁 목록이 새로고침마다 달라 보이지 않게
  const months = [...byMonth.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([period, names]) => ({ period, count: names.length, items: [...names].sort(cmp) }));
  const years = [...byYear.entries()].sort(([a], [b]) => a - b).map(([year, count]) => ({ year, count }));
  return c.json({ months, years });
});

/** 총 플레이 시간 + 게임별 순위 (FR-STAT-03). `limit`은 1~50으로 조인다 */
routes.get("/api/stats/playtime", async (c) => {
  const memberId = c.get("memberId");
  const limit = Math.min(Math.max(query(c).int("limit", 10), 1), MAX_TOP);
  const d = db();

  const where = and(
    eq(backlogEntry.memberId, memberId), isNull(backlogEntry.deletedAt), isNotNull(backlogEntry.playTimeHours));
  const [totals] = await d
    .select({ sum: sql<string | null>`sum(${backlogEntry.playTimeHours})`, count: sql<string>`count(*)` })
    .from(backlogEntry)
    .where(where);

  // 합계도 두 자리로 고정한다 (null이면 0.00)
  const totalHours = amountJson(totals?.sum == null ? "0.00" : scale2(totals.sum));
  const recorded = Number(totals?.count ?? 0);

  // 동점 tie-break가 없으면 순위가 요청마다 흔들린다
  const top = await d
    .select({ entryId: backlogEntry.id, displayName: backlogEntry.displayName, hours: backlogEntry.playTimeHours })
    .from(backlogEntry)
    .where(where)
    .orderBy(desc(backlogEntry.playTimeHours), desc(backlogEntry.id))
    .limit(limit);

  return c.json({
    totalHours,
    recordedEntries: recorded,
    top: top.map((r) => ({ entryId: r.entryId, displayName: r.displayName, hours: amountJson(r.hours) })),
  });
});

interface SubRow {
  currency: string | null;
  amount: string;
  cycle: string;
  startedOn: string;
  endedOn: string | null;
  serviceName: string;
}

async function subscriptionRows(memberId: number): Promise<SubRow[]> {
  return db()
    .select({
      currency: subscription.feeCurrency,
      amount: subscription.feeAmount,
      cycle: subscription.billingCycle,
      startedOn: subscription.startedOn,
      endedOn: subscription.endedOn,
      serviceName: subscription.serviceName,
    })
    .from(subscription)
    .where(and(eq(subscription.memberId, memberId), isNotNull(subscription.feeAmount))) as Promise<SubRow[]>;
}

/**
 * 결제 횟수 — 시작월 포함, 끝월까지. 연간은 달력 연도가 아니라 **시작월 기준 12개월 간격**
 * (월별 추이의 펼침 규칙과 같아야 두 통계의 구독 총액이 맞는다)
 */
function billingCount(cycle: string, from: string, to: string): bigint {
  const months = BigInt(ym(to) - ym(from));
  return cycle === "YEARLY" ? months / 12n + 1n : months + 1n;
}

/** 구독료 합계 — 통화별 */
function subscriptionTotals(subs: SubRow[]) {
  const t = today();
  const byCurrency = new Map<string, bigint>();
  for (const s of subs) {
    const until = s.endedOn === null || s.endedOn > t ? t : s.endedOn;
    if (until < s.startedOn) continue;
    const total = toCents(scale2(s.amount)) * billingCount(s.cycle, s.startedOn, until);
    byCurrency.set(s.currency as string, (byCurrency.get(s.currency as string) ?? 0n) + total);
  }
  return [...byCurrency.entries()]
    .map(([currency, total]) => ({ currency, total: amountJson(fromCents(total)) }))
    .sort((a, b) => cmp(a.currency, b.currency));
}

/** 지출 2축 (FR-STAT-04). 구매와 구독을 합치지 않고, 통화도 합치지 않는다 */
routes.get("/api/stats/spending", async (c) => {
  const memberId = c.get("memberId");
  const d = db();
  const found = await d
    .select({ currency: acquisition.priceCurrency, sum: sql<string>`sum(${acquisition.priceAmount})` })
    .from(acquisition)
    .innerJoin(backlogEntry, eq(acquisition.backlogEntryId, backlogEntry.id))
    .where(and(eq(backlogEntry.memberId, memberId), isNull(backlogEntry.deletedAt), isNotNull(acquisition.priceAmount)))
    .groupBy(acquisition.priceCurrency);

  const purchases = found
    .map((r) => ({ currency: r.currency as string, total: amountJson(scale2(r.sum)) }))
    .sort((a, b) => cmp(a.currency, b.currency));
  return c.json({ purchases, subscriptions: subscriptionTotals(await subscriptionRows(memberId)) });
});

/**
 * 월별 지출 추이 (FR-STAT-07). 취득은 `acquiredOn`의 달에 꽂고, 구독은 기간을 주기 단위로 펼친다.
 * 이름(items)은 구독이 먼저, 그다음 게임 — 각각 이름순·중복 없음
 */
routes.get("/api/stats/spending/monthly", async (c) => {
  const memberId = c.get("memberId");
  const d = db();

  // period -> currency -> 센트
  const buckets = new Map<string, Map<string, bigint>>();
  const currencies = new Set<string>();
  const gameNames = new Map<string, Set<string>>();
  const subNames = new Map<string, Set<string>>();

  const add = (period: string, currency: string, cents: bigint) => {
    currencies.add(currency);
    let m = buckets.get(period);
    if (!m) buckets.set(period, (m = new Map()));
    m.set(currency, (m.get(currency) ?? 0n) + cents);
  };
  const addName = (map: Map<string, Set<string>>, period: string, name: string) => {
    let s = map.get(period);
    if (!s) map.set(period, (s = new Set()));
    s.add(name);
  };

  // 0원은 지출이 아니다 — 금액도 이름도 싣지 않는다
  const purchases = await d
    .select({
      acquiredOn: acquisition.acquiredOn,
      currency: acquisition.priceCurrency,
      amount: acquisition.priceAmount,
      name: backlogEntry.displayName,
    })
    .from(acquisition)
    .innerJoin(backlogEntry, eq(acquisition.backlogEntryId, backlogEntry.id))
    .where(and(
      eq(backlogEntry.memberId, memberId),
      isNull(backlogEntry.deletedAt),
      gt(acquisition.priceAmount, "0"),
      isNotNull(acquisition.acquiredOn),
    ));
  for (const p of purchases) {
    const period = p.acquiredOn!.slice(0, 7);
    add(period, p.currency as string, toCents(scale2(p.amount as string)));
    addName(gameNames, period, p.name);
  }

  // 구독 펼치기 — 월간은 매달, 연간은 시작 월에서 12개월 간격
  const t = today();
  const thisMonth = ym(t);
  for (const s of await subscriptionRows(memberId)) {
    if (s.startedOn > t) continue; // 아직 시작 안 한 구독은 세지 않는다 (/spending과 총액이 맞게)
    let until = s.endedOn === null ? thisMonth : ym(s.endedOn);
    if (until > thisMonth) until = thisMonth;
    const step = s.cycle === "YEARLY" ? 12 : 1;
    const cents = toCents(scale2(s.amount));
    for (let cursor = ym(s.startedOn); cursor <= until; cursor += step) {
      const period = ymString(cursor);
      add(period, s.currency as string, cents);
      // (구독)을 붙여 게임과 구별한다
      addName(subNames, period, `${s.serviceName}(구독)`);
    }
  }

  const months = [...buckets.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([period, amounts]) => ({
      period,
      amounts: Object.fromEntries(
        [...amounts.entries()].sort(([a], [b]) => cmp(a, b)).map(([cur, v]) => [cur, amountJson(fromCents(v))])),
      items: [...[...(subNames.get(period) ?? [])].sort(cmp), ...[...(gameNames.get(period) ?? [])].sort(cmp)],
    }));

  // 연 평균 — 분모는 12개월 고정. 반올림은 HALF_UP, scale 2 (나머지 ×2 ≥ 12면 올림)
  const byYear = new Map<number, Map<string, bigint>>();
  for (const [period, amounts] of buckets) {
    const year = Number(period.slice(0, 4));
    let target = byYear.get(year);
    if (!target) byYear.set(year, (target = new Map()));
    for (const [cur, v] of amounts) target.set(cur, (target.get(cur) ?? 0n) + v);
  }
  const yearlyAverages = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, totals]) => ({
      year,
      amounts: Object.fromEntries(
        [...totals.entries()].sort(([a], [b]) => cmp(a, b)).map(([cur, total]) => {
          const q = total / 12n;
          const avg = (total % 12n) * 2n >= 12n ? q + 1n : q;
          return [cur, amountJson(fromCents(avg))];
        })),
    }));

  return c.json({ currencies: [...currencies].sort(cmp), months, yearlyAverages });
});
