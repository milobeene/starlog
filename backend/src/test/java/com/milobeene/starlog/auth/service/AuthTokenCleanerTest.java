package com.milobeene.starlog.auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.auth.domain.AuthToken;
import com.milobeene.starlog.auth.domain.TokenPurpose;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;

/** 만료 토큰 정리 배치 (I-12). 스케줄러를 거치지 않고 메서드를 직접 부른다 */
class AuthTokenCleanerTest extends ControllerTestSupport {

    @Autowired AuthTokenCleaner authTokenCleaner;

    @Test
    public void 만료된_토큰은_지워진다() throws Exception {
        //given
        Member member = saveMember();
        em.persist(token(member, LocalDateTime.now().minusDays(30), null));
        em.flush();

        //when
        int deleted = authTokenCleaner.purge(LocalDateTime.now().minusDays(7));

        //then
        assertThat(deleted).isEqualTo(1);
        assertThat(countTokens()).isZero();
    }

    @Test
    public void 살아있는_토큰은_남는다() throws Exception {
        //given
        Member member = saveMember();
        em.persist(token(member, LocalDateTime.now().plusHours(1), null));
        em.flush();

        //when
        authTokenCleaner.purge(LocalDateTime.now().minusDays(7));

        //then
        assertThat(countTokens()).isEqualTo(1);
    }

    @Test
    public void 방금_만료된_토큰은_유예기간_동안_남는다() throws Exception {
        //given — "링크가 왜 안 되지"를 조사할 여지를 남긴다
        Member member = saveMember();
        em.persist(token(member, LocalDateTime.now().minusHours(1), null));
        em.flush();

        //when
        authTokenCleaner.purge(LocalDateTime.now().minusDays(7));

        //then
        assertThat(countTokens()).isEqualTo(1);
    }

    @Test
    public void 오래전에_사용한_토큰도_지워진다() throws Exception {
        //given — 만료 전이지만 이미 쓴 토큰
        Member member = saveMember();
        em.persist(token(member, LocalDateTime.now().plusDays(30), LocalDateTime.now().minusDays(30)));
        em.flush();

        //when
        authTokenCleaner.purge(LocalDateTime.now().minusDays(7));

        //then
        assertThat(countTokens()).isZero();
    }

    private AuthToken token(Member member, LocalDateTime expiresAt, LocalDateTime usedAt) {
        AuthToken token = new AuthToken(member, TokenPurpose.EMAIL_VERIFICATION,
                "hash-" + System.nanoTime(), expiresAt);
        if (usedAt != null) {
            token.markUsed(usedAt);
        }
        return token;
    }

    private long countTokens() {
        em.clear();
        return em.createQuery("select count(t) from AuthToken t", Long.class).getSingleResult();
    }
}
