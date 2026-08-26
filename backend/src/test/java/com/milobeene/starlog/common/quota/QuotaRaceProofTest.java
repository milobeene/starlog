package com.milobeene.starlog.common.quota;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;

/**
 * 리뷰 검증용 — `persist()`가 INSERT를 정말 미루는가?
 *
 * `UsageQuota`는 `@EmbeddedId`(할당 식별자)라 Hibernate가 id를 받으려고 DB를 칠 필요가 없다.
 * 그래서 `persist()`가 액션 큐에만 넣고 **flush까지 INSERT를 미룬다**는 것이 가설이다.
 * 사실이면 `DbQuotaGuard.consume`의 `catch (DataIntegrityViolationException)`은
 * 영영 안 돈다 — try 블록을 빠져나간 뒤에야 INSERT가 나가기 때문이다.
 */
class QuotaRaceProofTest extends ControllerTestSupport {

    @Autowired UsageQuotaRepository repository;

    @Test
    public void persist_직후에는_DB에_행이_없다() {
        //given
        Member member = saveMember();
        em.flush();
        LocalDate today = LocalDate.now();

        //when — persist만 하고 flush는 안 한다
        repository.persist(UsageQuota.firstUse(member.getId(), today, QuotaKind.GAME_SEARCH));

        /*
         * **조회가 스스로 flush를 부르지 않게 막는다.** 기본 FlushMode.AUTO에서는
         * 네이티브 쿼리 직전에 하이버네이트가 컨텍스트를 밀어버려서, 그걸로 재면
         * "persist가 즉시 INSERT했다"는 잘못된 결론이 나온다 (첫 시도에서 실제로 그랬다)
         */
        em.unwrap(org.hibernate.Session.class)
                .setHibernateFlushMode(org.hibernate.FlushMode.MANUAL);

        //then — 네이티브 쿼리로 DB를 직접 본다
        Object count = em.createNativeQuery(
                        "select count(*) from usage_quota where member_id = " + member.getId())
                .getSingleResult();

        assertThat(((Number) count).intValue())
                .as("persist 직후 DB에 행이 있으면 INSERT가 즉시 나간 것이고, "
                        + "0이면 flush까지 미뤄진 것이다 — 후자면 catch가 안 돈다")
                .isZero();
    }
}
