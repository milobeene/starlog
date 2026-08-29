package com.milobeene.starlog.backlog.repository;

import com.querydsl.core.BooleanBuilder;
import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.QAcquisition;
import com.milobeene.starlog.backlog.domain.QBacklogEntry;
import com.milobeene.starlog.backlog.domain.QBacklogEntryGenre;
import com.milobeene.starlog.backlog.domain.QPlaythrough;
import com.milobeene.starlog.backlog.dto.BacklogSearchCondition;
import com.milobeene.starlog.backlog.dto.BacklogSort;
import com.milobeene.starlog.game.domain.QGame;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.core.types.dsl.StringPath;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;

import java.util.List;

/**
 * 목록 검색·필터 (L-1, FR-QRY-01~04).
 *
 * 클래스 이름이 `BacklogEntryRepositoryImpl`이어야 하는 이유 — Spring Data가
 * `<리포지토리 인터페이스명>Impl`을 규칙으로 찾는다. 이름을 바꾸면 조용히 안 붙는다.
 *
 * **필터를 join이 아니라 exists 서브쿼리로 짠 것이 이 클래스의 핵심 결정이다.**
 * 태그·장르·기기·계정은 전부 자식 테이블 경유라 join하면 행이 증폭된다.
 * distinct로 덮으면 count 쿼리가 틀어져 페이징이 깨지고, ~ToOne fetch join과 섞이면 더 나빠진다.
 * exists는 행을 안 늘리고 조건만 건다
 */
@RequiredArgsConstructor
public class BacklogEntryRepositoryImpl implements BacklogEntryRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<BacklogEntry> search(Long memberId, BacklogSearchCondition condition,
                                     BacklogSort sort, Pageable pageable) {
        QBacklogEntry entry = QBacklogEntry.backlogEntry;
        QPlaythrough last = new QPlaythrough("lastPlaythrough");

        /*
         * ~ToOne만 fetch join 한다 (§6.8). 컬렉션을 fetch join하면 행이 증폭돼
         * 페이징이 불가능해지고, Hibernate가 전체를 메모리에서 자른다.
         * 개인 장르·마스터 장르는 batch size로 묶여 각각 한 방씩 나간다
         */
        List<BacklogEntry> content = queryFactory
                .selectFrom(entry)
                .join(entry.game).fetchJoin()
                .leftJoin(entry.tag).fetchJoin()
                .leftJoin(entry.lastPlaythrough, last).fetchJoin()
                .leftJoin(last.device).fetchJoin()
                .leftJoin(last.emulator).fetchJoin()
                .where(predicates(entry, memberId, condition))
                .orderBy(sort.toOrderSpecifiers(entry))
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        JPAQuery<Long> countQuery = queryFactory
                .select(entry.count())
                .from(entry)
                .where(predicates(entry, memberId, condition));

        /*
         * PageableExecutionUtils — 마지막 페이지이거나 첫 페이지가 다 안 찼으면
         * count 쿼리를 아예 안 날린다. 개인 규모에서는 대부분 여기 걸린다
         */
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }

    /**
     * 전부. 조건도 페이지도 없다 — 사이드바·폴더가 쓴다.
     *
     * `search`와 같은 fetch join을 그대로 태운다. 카드가 태그와 마지막 회차를 그리므로
     * 빼면 항목 수만큼 쿼리가 더 나간다 (JPA 원칙 4번). 정렬은 이름순 하나면 된다 —
     * 폴더는 받아서 태그별로 다시 나누므로 그 안의 순서만 정해지면 그만이다
     */
    @Override
    public List<BacklogEntry> findAllCards(Long memberId) {
        QBacklogEntry entry = QBacklogEntry.backlogEntry;
        QPlaythrough last = new QPlaythrough("lastPlaythroughForAll");

        return queryFactory
                .selectFrom(entry)
                .join(entry.game).fetchJoin()
                .leftJoin(entry.tag).fetchJoin()
                .leftJoin(entry.lastPlaythrough, last).fetchJoin()
                .leftJoin(last.device).fetchJoin()
                .leftJoin(last.emulator).fetchJoin()
                .where(entry.member.id.eq(memberId), entry.deletedAt.isNull())
                .orderBy(BacklogSort.NAME.toOrderSpecifiers(entry))
                .fetch();
    }

    /** null은 QueryDSL이 알아서 무시한다 — 조건 없음이 곧 필터 없음이다 */
    private BooleanExpression[] predicates(QBacklogEntry entry, Long memberId,
                                           BacklogSearchCondition condition) {
        return new BooleanExpression[]{
                entry.member.id.eq(memberId),
                entry.deletedAt.isNull(),
                nameContains(entry, condition),
                statusIn(entry, condition),
                hasTag(entry, condition),
                hasGenre(entry, condition),
                hasResolvedGenre(entry, condition),
                developedBy(entry, condition),
                releasedInYear(entry, condition),
                matchesPlaythrough(entry, condition),
                matchesAcquisition(entry, condition),
                null
        };
    }

    /**
     * 검색 대상은 displayName이다 (§6.8). 오버라이드와 마스터를 매번 합성하지 않는 이유는
     * COALESCE 조인이 되어 인덱스를 못 타기 때문이고, 그래서 비정규화 컬럼을 뒀다.
     *
     * 다만 `like '%x%'`는 그 인덱스도 못 탄다 — 스펙이 "필터링·정렬 > 검색" 우선순위로
     * 감수하기로 한 부분이다 (§6.8)
     */
    private BooleanExpression nameContains(QBacklogEntry entry, BacklogSearchCondition condition) {
        return condition.hasKeyword() ? entry.displayName.containsIgnoreCase(condition.keyword()) : null;
    }

    private BooleanExpression statusIn(QBacklogEntry entry, BacklogSearchCondition condition) {
        return condition.hasStatuses() ? entry.status.in(condition.statuses()) : null;
    }

    /** 태그만 exists가 아니다 — 항목당 하나라 FK가 backlog_entry에 직접 있다 (§6.7 v1.6) */
    private BooleanExpression hasTag(QBacklogEntry entry, BacklogSearchCondition condition) {
        return condition.tagId() != null ? entry.tag.id.eq(condition.tagId()) : null;
    }

    private BooleanExpression hasGenre(QBacklogEntry entry, BacklogSearchCondition condition) {
        if (condition.genreId() == null) {
            return null;
        }
        QBacklogEntryGenre link = QBacklogEntryGenre.backlogEntryGenre;

        return JPAExpressions.selectOne()
                .from(link)
                .where(link.backlogEntry.eq(entry), link.genre.id.eq(condition.genreId()))
                .exists();
    }

    /**
     * 장르 필터 — **표시값(resolved) 기준**이다 (Phase 8).
     *
     * 개인 장르는 마스터를 덮어쓴다: 개인 장르가 하나라도 있으면 그것만, 없으면 마스터 것(§6.7).
     * 그래서 조건도 두 갈래다 — 개인 장르에서 이름이 맞거나, **개인 장르가 아예 없으면서**
     * 마스터 장르에서 맞거나. 뒤쪽의 "개인 장르가 없을 때"를 빼면 덮어쓰기 규칙이 깨져
     * 화면에 안 보이는 마스터 장르로도 항목이 걸린다
     */
    private BooleanExpression hasResolvedGenre(QBacklogEntry entry, BacklogSearchCondition condition) {
        if (condition.genreName() == null) {
            return null;
        }
        QBacklogEntryGenre link = QBacklogEntryGenre.backlogEntryGenre;

        BooleanExpression personalMatch = JPAExpressions.selectOne()
                .from(link)
                .where(link.backlogEntry.eq(entry),
                        link.genre.name.equalsIgnoreCase(condition.genreName()))
                .exists();

        BooleanExpression hasNoPersonal = JPAExpressions.selectOne()
                .from(link)
                .where(link.backlogEntry.eq(entry))
                .notExists();

        return personalMatch.or(hasNoPersonal.and(masterGenreMatches(entry, condition.genreName())));
    }

    /** 마스터 장르는 Game의 @ElementCollection이라 별도 서브쿼리로 훑는다 */
    private BooleanExpression masterGenreMatches(QBacklogEntry entry, String genreName) {
        QGame game = new QGame("gameForGenre");
        StringPath masterGenre = Expressions.stringPath("masterGenre");

        return JPAExpressions.selectOne()
                .from(game)
                .join(game.masterGenres, masterGenre)
                .where(game.eq(entry.game), masterGenre.equalsIgnoreCase(genreName))
                .exists();
    }

    /**
     * 개발사 필터 — 장르와 같은 덮어쓰기 규칙을 탄다.
     * 개인 오버라이드가 있으면 거기서, 비어 있으면 마스터에서 찾는다 (§7.1)
     */
    private BooleanExpression developedBy(QBacklogEntry entry, BacklogSearchCondition condition) {
        if (condition.developer() == null) {
            return null;
        }
        String keyword = condition.developer();

        QBacklogEntry self = new QBacklogEntry("entryForDeveloper");
        StringPath override = Expressions.stringPath("developerOverride");

        BooleanExpression overrideMatch = JPAExpressions.selectOne()
                .from(self)
                .join(self.developerOverrides, override)
                .where(self.eq(entry), override.containsIgnoreCase(keyword))
                .exists();

        QGame game = new QGame("gameForDeveloper");
        StringPath masterDeveloper = Expressions.stringPath("masterDeveloper");

        BooleanExpression masterMatch = JPAExpressions.selectOne()
                .from(game)
                .join(game.developers, masterDeveloper)
                .where(game.eq(entry.game), masterDeveloper.containsIgnoreCase(keyword))
                .exists();

        return overrideMatch.or(entry.developerOverrides.isEmpty().and(masterMatch));
    }

    /**
     * 출시 연도 — 비정규화 컬럼을 쓴다.
     * `releasedOnResolved`는 오버라이드가 이미 반영된 값이라 여기서 다시 합성할 필요가 없다.
     * 함수(year)를 씌우면 인덱스를 못 타지만, 범위 조건으로 바꿀 만큼 데이터가 크지 않다
     */
    private BooleanExpression releasedInYear(QBacklogEntry entry, BacklogSearchCondition condition) {
        return condition.releaseYear() == null ? null
                : entry.releasedOnResolved.year().eq(condition.releaseYear());
    }

    /**
     * 회차 축 — "언제 무엇으로 했나" (v1.1).
     *
     * 조인이 아니라 **exists 서브쿼리**다. 조인하면 회차가 셋인 게임이 결과에 세 번 나온다.
     *
     * ⚠️ **한 회차가 조건을 모두 만족해야 한다.** 조건마다 서브쿼리를 따로 만들면
     * "스위치로 한 회차가 있고, 2026년에 한 회차가 있다"가 통과해 버린다 —
     * 물어본 것은 "2026년에 스위치로 한 적이 있나"다.
     *
     * 날짜는 **기간 겹침**이다(사용자 결정). 진행 중(종료일 없음)인 회차도 살아 있는 것으로 본다
     */
    private BooleanExpression matchesPlaythrough(QBacklogEntry entry,
                                                 BacklogSearchCondition condition) {
        if (!condition.hasPlaythroughFilter()) {
            return null;
        }
        QPlaythrough playthrough = QPlaythrough.playthrough;
        BooleanBuilder where = new BooleanBuilder(playthrough.backlogEntry.eq(entry));

        if (condition.ptDeviceId() != null) {
            where.and(playthrough.device.id.eq(condition.ptDeviceId()));
        }
        if (condition.ptPlatformId() != null) {
            where.and(playthrough.platform.id.eq(condition.ptPlatformId()));
        }
        if (condition.ptEmulatorId() != null) {
            where.and(playthrough.emulator.id.eq(condition.ptEmulatorId()));
        }
        if (condition.ptAccountId() != null) {
            where.and(playthrough.platformAccount.id.eq(condition.ptAccountId()));
        }
        // 겹침: 시작이 검색 끝보다 늦지 않고, 끝이 검색 시작보다 이르지 않다
        if (condition.ptTo() != null) {
            where.and(playthrough.startedOn.loe(condition.ptTo()));
        }
        if (condition.ptFrom() != null) {
            where.and(playthrough.finishedOn.isNull()
                    .or(playthrough.finishedOn.goe(condition.ptFrom())));
        }

        return JPAExpressions.selectOne().from(playthrough).where(where).exists();
    }

    /**
     * 취득 축 — "어떻게 손에 넣었나" (v1.1).
     *
     * ⚠️ **가격은 통화를 먼저 고른다.** 환율 변환이 범위 밖이라(§6.6) 통화 없이
     * amount만 비교하면 ₩10,000과 $10,000이 같은 줄에 선다
     */
    private BooleanExpression matchesAcquisition(QBacklogEntry entry,
                                                 BacklogSearchCondition condition) {
        if (!condition.hasAcquisitionFilter()) {
            return null;
        }
        QAcquisition acquisition = new QAcquisition("acquisitionForFilter");
        BooleanBuilder where = new BooleanBuilder(acquisition.backlogEntry.eq(entry));

        if (condition.acqMethod() != null) {
            where.and(acquisition.method.eq(condition.acqMethod()));
        }
        if (condition.acqPlatformId() != null) {
            where.and(acquisition.platform.id.eq(condition.acqPlatformId()));
        }
        if (condition.acqAccountId() != null) {
            where.and(acquisition.platformAccount.id.eq(condition.acqAccountId()));
        }
        if (condition.acqCurrency() != null) {
            where.and(acquisition.price.currency.eq(condition.acqCurrency()));
        }
        if (condition.acqMinPrice() != null) {
            where.and(acquisition.price.amount.goe(condition.acqMinPrice()));
        }
        if (condition.acqMaxPrice() != null) {
            where.and(acquisition.price.amount.loe(condition.acqMaxPrice()));
        }
        if (condition.acqFrom() != null) {
            where.and(acquisition.acquiredOn.goe(condition.acqFrom()));
        }
        if (condition.acqTo() != null) {
            where.and(acquisition.acquiredOn.loe(condition.acqTo()));
        }

        return JPAExpressions.selectOne().from(acquisition).where(where).exists();
    }
}
