package com.milobeene.starlog.stats.service;

import com.milobeene.starlog.backlog.domain.QAcquisition;
import com.milobeene.starlog.backlog.domain.QBacklogEntry;
import com.milobeene.starlog.backlog.domain.QBacklogEntryGenre;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.stats.dto.CompletionCount;
import com.milobeene.starlog.stats.dto.GenreDistribution;
import com.milobeene.starlog.stats.dto.MonthlySpending;
import com.milobeene.starlog.stats.dto.PlaytimeStats;
import com.milobeene.starlog.stats.dto.SpendingStats;
import com.milobeene.starlog.subscription.domain.BillingCycle;
import com.milobeene.starlog.subscription.domain.QSubscription;
import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQueryFactory;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.Set;

/**
 * 통계 (L-5, FR-STAT-01~04).
 *
 * 조회 전용이라 BacklogQueryService와 나란한 자리다. 별도 패키지로 뺀 이유 —
 * 통계는 backlog·subscription을 가로질러 읽고, 어느 한쪽 소유가 아니다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StatsQueryService {

    private static final int MAX_TOP = 50;

    private final JPAQueryFactory queryFactory;

    /** @ElementCollection 조인 등 Q타입으로 표현이 어색한 두 곳에서만 쓴다 */
    private final EntityManager em;

    /**
     * 장르별 분포 (FR-STAT-01).
     *
     * **한 방으로 못 낸다.** §6.7의 폴백이 "개인 장르가 1개라도 있으면 개인 것만,
     * 하나도 없으면 마스터 것"이라 항목마다 분기가 갈린다. SQL의 group by는 그런 분기를 못 한다.
     * 그래서 두 집합을 따로 세고 합친다 — 쿼리 2방
     */
    public List<GenreDistribution> genreDistribution(Long memberId) {
        QBacklogEntry entry = QBacklogEntry.backlogEntry;
        QBacklogEntryGenre link = QBacklogEntryGenre.backlogEntryGenre;

        // ① 개인 장르가 있는 항목 — 개인 장르로 센다
        List<Tuple> personal = queryFactory
                .select(link.genre.name, link.backlogEntry.countDistinct())
                .from(link)
                .join(link.backlogEntry, entry)
                .where(entry.member.id.eq(memberId), entry.deletedAt.isNull())
                .groupBy(link.genre.name)
                .fetch();

        /*
         * ② 개인 장르가 하나도 없는 항목 — 마스터 장르로 센다.
         * @ElementCollection이라 조인 대상이 엔티티가 아니어서 QueryDSL로 표현이 까다롭다.
         * 이 한 곳만 JPQL을 직접 쓴다 — 억지로 Q타입을 맞추는 것보다 읽기 쉽다
         */
        List<Object[]> master = em.createQuery("""
                        select mg, count(distinct b.id)
                        from BacklogEntry b
                          join b.game g
                          join g.masterGenres mg
                        where b.member.id = :memberId
                          and b.deletedAt is null
                          and not exists (
                            select 1 from BacklogEntryGenre l where l.backlogEntry = b)
                        group by mg
                        """, Object[].class)
                .setParameter("memberId", memberId)
                .getResultList();

        Map<String, Long> merged = new LinkedHashMap<>();
        for (Tuple row : personal) {
            merged.merge(row.get(link.genre.name), row.get(link.backlogEntry.countDistinct()), Long::sum);
        }
        for (Object[] row : master) {
            merged.merge((String) row[0], (Long) row[1], Long::sum);
        }

        return merged.entrySet().stream()
                .map(e -> new GenreDistribution(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(GenreDistribution::count).reversed()
                        .thenComparing(GenreDistribution::genre))
                .toList();
    }

    /**
     * 기간별 완료 수 (FR-STAT-02).
     *
     * 완료의 정의는 **종료일이 있는 COMPLETED 회차**다. 항목의 상태를 쓰지 않는 이유 —
     * 항목 상태는 최신 회차만 반영하므로, 3회차까지 깬 게임이 1로만 세어진다.
     * 회차 기준이면 "2026년에 몇 번 끝냈나"가 맞게 나온다
     */
    public List<CompletionCount> completions(Long memberId, String unit) {
        boolean monthly = resolveMonthly(unit);

        List<Object[]> rows = em.createQuery("""
                        select extract(year from p.finishedOn), extract(month from p.finishedOn), count(p)
                        from Playthrough p
                        where p.backlogEntry.member.id = :memberId
                          and p.backlogEntry.deletedAt is null
                          and p.finishedOn is not null
                          and p.status = com.milobeene.starlog.backlog.domain.PlaythroughStatus.COMPLETED
                        group by extract(year from p.finishedOn), extract(month from p.finishedOn)
                        order by extract(year from p.finishedOn), extract(month from p.finishedOn)
                        """, Object[].class)
                .setParameter("memberId", memberId)
                .getResultList();

        Map<String, Long> buckets = new LinkedHashMap<>();
        for (Object[] row : rows) {
            int year = ((Number) row[0]).intValue();
            int month = ((Number) row[1]).intValue();
            String period = monthly ? "%d-%02d".formatted(year, month) : String.valueOf(year);
            buckets.merge(period, ((Number) row[2]).longValue(), Long::sum);
        }

        return buckets.entrySet().stream()
                .map(e -> new CompletionCount(e.getKey(), e.getValue()))
                .toList();
    }

    /** 총 플레이 시간 + 게임별 순위 (FR-STAT-03) */
    public PlaytimeStats playtime(Long memberId, int limit) {
        QBacklogEntry entry = QBacklogEntry.backlogEntry;

        // QueryDSL 7은 sum()을 타입별(sumLong·sumBigDecimal·sumAggregate)로 쪼갰다.
        // 5.x의 sum()을 그대로 쓰면 컴파일이 안 된다.
        // V4에서 컬럼이 numeric(7,2)이 되면서 sumLong → sumBigDecimal로 옮겼다
        Tuple totals = queryFactory
                .select(entry.playTimeHours.sumBigDecimal(), entry.count())
                .from(entry)
                .where(entry.member.id.eq(memberId), entry.deletedAt.isNull(),
                        entry.playTimeHours.isNotNull())
                .fetchOne();

        BigDecimal summed = totals == null ? null : totals.get(entry.playTimeHours.sumBigDecimal());
        // 합계도 두 자리로 고정한다 — 안 하면 DB마다 scale이 달라져 화면에 0.00과 0이 섞인다
        BigDecimal totalHours = summed == null
                ? BigDecimal.ZERO.setScale(2) : summed.setScale(2, RoundingMode.HALF_UP);
        long recorded = totals == null || totals.get(entry.count()) == null
                ? 0L : totals.get(entry.count());

        List<PlaytimeStats.Entry> top = queryFactory
                .select(entry.id, entry.displayName, entry.playTimeHours)
                .from(entry)
                .where(entry.member.id.eq(memberId), entry.deletedAt.isNull(),
                        entry.playTimeHours.isNotNull())
                // 동점 tie-break가 없으면 순위가 요청마다 흔들린다 (BR-QRY-01과 같은 이유)
                .orderBy(entry.playTimeHours.desc(), entry.id.desc())
                .limit(Math.clamp(limit, 1, MAX_TOP))
                .fetch()
                .stream()
                .map(row -> new PlaytimeStats.Entry(
                        row.get(entry.id), row.get(entry.displayName), row.get(entry.playTimeHours)))
                .toList();

        return new PlaytimeStats(totalHours, recorded, top);
    }

    /**
     * 지출 (FR-STAT-04, BR-ACQ-01).
     *
     * 두 축을 합치지 않고, 통화도 합치지 않는다 — 환산에는 환율이 필요하고 범위 밖이다
     */
    public SpendingStats spending(Long memberId) {
        QAcquisition acquisition = QAcquisition.acquisition;
        QSubscription subscription = QSubscription.subscription;

        List<SpendingStats.AmountByCurrency> purchases = queryFactory
                .select(acquisition.price.currency, acquisition.price.amount.sumBigDecimal())
                .from(acquisition)
                .where(acquisition.backlogEntry.member.id.eq(memberId),
                        acquisition.backlogEntry.deletedAt.isNull(),
                        acquisition.price.amount.isNotNull())
                .groupBy(acquisition.price.currency)
                .fetch()
                .stream()
                .map(row -> new SpendingStats.AmountByCurrency(
                        row.get(acquisition.price.currency),
                        row.get(acquisition.price.amount.sumBigDecimal())))
                .sorted(Comparator.comparing(SpendingStats.AmountByCurrency::currency))
                .toList();

        return new SpendingStats(purchases, subscriptionTotals(memberId));
    }

    /**
     * 구독료 합계.
     *
     * **스펙이 계산 규칙을 안 정해서 여기서 정한다** — 결제 횟수는
     * `시작월(또는 시작연) 포함, 종료일(없으면 오늘)까지의 주기 수`다.
     * 6월 시작·8월 종료 월간 구독이면 6·7·8 세 번으로 센다.
     *
     * SQL로 못 하는 이유 — 기간을 주기로 나누는 계산이라 행마다 다르고, 종료일 null 분기가 있다.
     * 구독은 개인당 몇 건이라 애플리케이션에서 도는 비용이 무시할 만하다
     */
    private List<SpendingStats.AmountByCurrency> subscriptionTotals(Long memberId) {
        QSubscription subscription = QSubscription.subscription;

        List<Tuple> rows = queryFactory
                .select(subscription.fee.currency, subscription.fee.amount,
                        subscription.billingCycle, subscription.startedOn, subscription.endedOn)
                .from(subscription)
                .where(subscription.member.id.eq(memberId), subscription.fee.amount.isNotNull())
                .fetch();

        Map<String, BigDecimal> byCurrency = new LinkedHashMap<>();
        LocalDate today = LocalDate.now();

        for (Tuple row : rows) {
            LocalDate startedOn = row.get(subscription.startedOn);
            LocalDate endedOn = row.get(subscription.endedOn);
            LocalDate until = (endedOn == null || endedOn.isAfter(today)) ? today : endedOn;
            if (startedOn == null || until.isBefore(startedOn)) {
                continue;
            }

            long cycles = billingCount(row.get(subscription.billingCycle), startedOn, until);
            BigDecimal total = row.get(subscription.fee.amount).multiply(BigDecimal.valueOf(cycles));

            byCurrency.merge(row.get(subscription.fee.currency), total, BigDecimal::add);
        }

        return byCurrency.entrySet().stream()
                .map(e -> new SpendingStats.AmountByCurrency(e.getKey(), e.getValue()))
                .sorted(Comparator.comparing(SpendingStats.AmountByCurrency::currency))
                .toList();
    }

    /**
     * 월별 지출 추이 (FR-STAT-07).
     *
     * 취득과 구독의 성질이 달라 처리가 갈린다:
     *   취득 — `acquiredOn`이 있어 그 달에 바로 꽂힌다
     *   구독 — **날짜가 없다.** 기간을 결제 주기 단위로 **월별로 펼쳐야** 한다
     *
     * 통화는 합치지 않는다. 환산에 환율이 필요하고 범위 밖이다 (§6.6)
     */
    public MonthlySpending monthlySpending(Long memberId) {
        QAcquisition acquisition = QAcquisition.acquisition;

        // period -> currency -> amount. TreeMap이라 월 순서가 저절로 맞는다
        Map<String, Map<String, BigDecimal>> buckets = new TreeMap<>();
        Set<String> currencies = new TreeSet<>();

        /*
         * 이름은 금액과 **따로 모은다.** 한 맵에 섞으면 구독을 앞세우는 순서를 못 지킨다.
         * LinkedHashSet이라 같은 달에 같은 항목을 두 번 사도(본편+DLC) 이름은 한 번만 남는다 —
         * 영수증이 아니라 "무엇에 썼나"를 보여주는 줄이라 중복은 고장으로 보인다
         */
        Map<String, Set<String>> gameNames = new TreeMap<>();
        Map<String, Set<String>> subscriptionNames = new TreeMap<>();

        List<Tuple> purchases = queryFactory
                .select(acquisition.acquiredOn, acquisition.price.currency, acquisition.price.amount,
                        acquisition.backlogEntry.displayName)
                .from(acquisition)
                .where(acquisition.backlogEntry.member.id.eq(memberId),
                        acquisition.backlogEntry.deletedAt.isNull(),
                        acquisition.price.amount.isNotNull(),
                        acquisition.acquiredOn.isNotNull())
                .fetch();

        for (Tuple row : purchases) {
            YearMonth month = YearMonth.from(row.get(acquisition.acquiredOn));
            add(buckets, currencies, month,
                    row.get(acquisition.price.currency),
                    row.get(acquisition.price.amount));

            /*
             * 0원은 이름도 안 싣는다. 무료 배포·선물을 `0 KRW`로 적어두면 금액은 그대로인데
             * 이름만 늘어, 툴팁의 "이만큼 쓴 이유"가 흐려진다
             */
            BigDecimal amount = row.get(acquisition.price.amount);
            String name = row.get(acquisition.backlogEntry.displayName);
            if (name != null && amount != null && amount.signum() > 0) {
                gameNames.computeIfAbsent(month.toString(), m -> new TreeSet<>()).add(name);
            }
        }

        spreadSubscriptions(memberId, buckets, currencies, subscriptionNames);

        List<MonthlySpending.Bucket> months = buckets.entrySet().stream()
                .map(e -> new MonthlySpending.Bucket(e.getKey(), e.getValue(),
                        itemsOf(subscriptionNames.get(e.getKey()), gameNames.get(e.getKey()))))
                .toList();

        return new MonthlySpending(List.copyOf(currencies), months,
                yearlyAverages(buckets, currencies));
    }

    /**
     * 구독료를 월별로 펼친다.
     *
     * 월간이면 매달, 연간이면 **시작 월에 한 번씩** 꽂는다 — 연간 요금을 12로 나눠 흩뿌리면
     * "그 달에 실제로 나간 돈"이 아니게 되고, 꺾은선의 뜻이 지출에서 상각으로 바뀐다
     */
    private void spreadSubscriptions(Long memberId, Map<String, Map<String, BigDecimal>> buckets,
                                     Set<String> currencies, Map<String, Set<String>> names) {
        QSubscription subscription = QSubscription.subscription;

        List<Tuple> rows = queryFactory
                .select(subscription.fee.currency, subscription.fee.amount,
                        subscription.billingCycle, subscription.startedOn, subscription.endedOn,
                        subscription.serviceName)
                .from(subscription)
                .where(subscription.member.id.eq(memberId), subscription.fee.amount.isNotNull())
                .fetch();

        YearMonth today = YearMonth.from(LocalDate.now());

        for (Tuple row : rows) {
            LocalDate startedOn = row.get(subscription.startedOn);
            if (startedOn == null) {
                continue;
            }
            /*
             * **아직 시작 안 한 구독은 세지 않는다.** `/api/stats/spending`은 LocalDate로,
             * 여기는 YearMonth로 경계를 봐서, 이달 말이 시작일인 구독을 미리 등록하면
             * 한쪽만 세어 **두 통계의 구독 총액이 어긋났다.** billingCount 주석이 경고한 그 상황이다
             */
            if (startedOn.isAfter(LocalDate.now())) {
                continue;
            }

            LocalDate endedOn = row.get(subscription.endedOn);
            YearMonth until = (endedOn == null) ? today : YearMonth.from(endedOn);
            if (until.isAfter(today)) {
                until = today;
            }

            YearMonth cursor = YearMonth.from(startedOn);
            int step = row.get(subscription.billingCycle) == BillingCycle.YEARLY ? 12 : 1;

            String serviceName = row.get(subscription.serviceName);
            while (!cursor.isAfter(until)) {
                add(buckets, currencies, cursor,
                        row.get(subscription.fee.currency), row.get(subscription.fee.amount));
                if (serviceName != null) {
                    // (구독)을 붙여 게임과 구별한다 — 이름만으로는 둘이 안 갈린다
                    names.computeIfAbsent(cursor.toString(), m -> new TreeSet<>())
                            .add(serviceName + "(구독)");
                }
                cursor = cursor.plusMonths(step);
            }
        }
    }

    /** **분모가 12개월 고정이다.** 데이터 있는 달만으로 나누면 연초에 몰아 산 해가 부풀어 해끼리 비교가 안 된다 */
    private List<MonthlySpending.YearlyAverage> yearlyAverages(
            Map<String, Map<String, BigDecimal>> buckets, Set<String> currencies) {

        Map<Integer, Map<String, BigDecimal>> byYear = new TreeMap<>();
        buckets.forEach((period, amounts) -> {
            int year = Integer.parseInt(period.substring(0, 4));
            Map<String, BigDecimal> target = byYear.computeIfAbsent(year, y -> new TreeMap<>());
            amounts.forEach((currency, amount) -> target.merge(currency, amount, BigDecimal::add));
        });

        return byYear.entrySet().stream()
                .map(e -> {
                    Map<String, BigDecimal> averages = new TreeMap<>();
                    e.getValue().forEach((currency, total) -> averages.put(currency,
                            total.divide(BigDecimal.valueOf(12), 2, java.math.RoundingMode.HALF_UP)));
                    return new MonthlySpending.YearlyAverage(e.getKey(), averages);
                })
                .toList();
    }

    private void add(Map<String, Map<String, BigDecimal>> buckets, Set<String> currencies,
                     YearMonth month, String currency, BigDecimal amount) {
        currencies.add(currency);
        buckets.computeIfAbsent(month.toString(), m -> new TreeMap<>())
                .merge(currency, amount, BigDecimal::add);
    }

    /** 구독 먼저, 그다음 게임. 각 무리 안에서는 이름순(TreeSet)이라 순서가 흔들리지 않는다 */
    private List<String> itemsOf(Set<String> subscriptions, Set<String> games) {
        List<String> items = new ArrayList<>();
        if (subscriptions != null) {
            items.addAll(subscriptions);
        }
        if (games != null) {
            items.addAll(games);
        }
        return items;
    }

    private long billingCount(BillingCycle cycle, LocalDate from, LocalDate to) {
        if (cycle == BillingCycle.YEARLY) {
            // 달력 연도 경계(YEARS.between)가 아니라 **시작월 기준 12개월 간격**이다 —
            // spreadSubscriptions(월별 추이)가 이 규칙이라, 갈라지면 두 통계의 구독 총액이 어긋난다
            return ChronoUnit.MONTHS.between(from.withDayOfMonth(1), to.withDayOfMonth(1)) / 12 + 1;
        }
        return ChronoUnit.MONTHS.between(from.withDayOfMonth(1), to.withDayOfMonth(1)) + 1;
    }

    private boolean resolveMonthly(String unit) {
        if (unit == null || unit.isBlank() || unit.equalsIgnoreCase("month")) {
            return true;
        }
        if (unit.equalsIgnoreCase("year")) {
            return false;
        }
        throw new InvalidInputException("지원하지 않는 단위입니다: " + unit + " (month, year)");
    }
}
