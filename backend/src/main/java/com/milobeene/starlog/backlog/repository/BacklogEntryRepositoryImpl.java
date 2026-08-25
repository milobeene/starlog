package com.milobeene.starlog.backlog.repository;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.QAcquisition;
import com.milobeene.starlog.backlog.domain.QBacklogEntry;
import com.milobeene.starlog.backlog.domain.QBacklogEntryGenre;
import com.milobeene.starlog.backlog.domain.QBacklogEntryTag;
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
                playedOnDevice(entry, condition),
                acquiredOnPlatform(entry, condition),
                acquiredWithAccount(entry, condition)
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

    private BooleanExpression hasTag(QBacklogEntry entry, BacklogSearchCondition condition) {
        if (condition.tagId() == null) {
            return null;
        }
        QBacklogEntryTag link = QBacklogEntryTag.backlogEntryTag;

        return JPAExpressions.selectOne()
                .from(link)
                .where(link.backlogEntry.eq(entry), link.tag.id.eq(condition.tagId()))
                .exists();
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

    /** 기기는 **회차** 기준이다 — "그때 무엇으로 플레이했나" */
    private BooleanExpression playedOnDevice(QBacklogEntry entry, BacklogSearchCondition condition) {
        if (condition.deviceId() == null) {
            return null;
        }
        QPlaythrough playthrough = QPlaythrough.playthrough;

        return JPAExpressions.selectOne()
                .from(playthrough)
                .where(playthrough.backlogEntry.eq(entry),
                        playthrough.device.id.eq(condition.deviceId()))
                .exists();
    }

    /** 플랫폼(Steam·Nintendo…)도 취득 기준이다. 계정과 달리 마스터 값이라 여러 계정에 걸친다 */
    private BooleanExpression acquiredOnPlatform(QBacklogEntry entry,
                                                 BacklogSearchCondition condition) {
        if (condition.platformId() == null) {
            return null;
        }
        QAcquisition acquisition = new QAcquisition("acquisitionForPlatform");

        return JPAExpressions.selectOne()
                .from(acquisition)
                .where(acquisition.backlogEntry.eq(entry),
                        acquisition.platform.id.eq(condition.platformId()))
                .exists();
    }

    /**
     * 계정은 **취득** 기준이다 — "그 계정으로 가진 게임".
     * 회차에도 계정이 붙지만 뜻이 다르고, facets 카운트도 취득 기준이라 맞췄다 (API 설계서 §1.2)
     */
    private BooleanExpression acquiredWithAccount(QBacklogEntry entry,
                                                  BacklogSearchCondition condition) {
        if (condition.platformAccountId() == null) {
            return null;
        }
        QAcquisition acquisition = QAcquisition.acquisition;

        return JPAExpressions.selectOne()
                .from(acquisition)
                .where(acquisition.backlogEntry.eq(entry),
                        acquisition.platformAccount.id.eq(condition.platformAccountId()))
                .exists();
    }
}
