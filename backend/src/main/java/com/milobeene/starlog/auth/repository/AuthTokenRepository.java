package com.milobeene.starlog.auth.repository;

import com.milobeene.starlog.auth.domain.AuthToken;
import com.milobeene.starlog.auth.domain.TokenPurpose;
import com.milobeene.starlog.common.repository.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface AuthTokenRepository extends BaseRepository<AuthToken, Long> {

    /**
     * 해시로 찾는다. 원문은 DB에 없으므로 이 방법뿐이다.
     * BCrypt를 쓰면 salt 때문에 같은 토큰도 매번 다른 해시가 나와 **조회 자체가 불가능**하다.
     */
    Optional<AuthToken> findByTokenHash(String tokenHash);

    /** 재발송 스로틀 판단용 — 가장 최근 발급 건 (NFR-S9) */
    Optional<AuthToken> findFirstByMemberIdAndPurposeOrderByIdDesc(Long memberId, TokenPurpose purpose);

    /**
     * 남은 토큰 일괄 폐기.
     *
     * 벌크 연산은 영속성 컨텍스트를 우회한다 → flush·clear를 켜고, `updatedAt`은
     * @LastModifiedDate 콜백이 안 돌므로 SET 절에 직접 쓴다 (설계 원칙 13번)
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update AuthToken t
               set t.usedAt = :now, t.updatedAt = :now
             where t.member.id = :memberId
               and t.purpose = :purpose
               and t.usedAt is null
            """)
    int markAllUsed(@Param("memberId") Long memberId,
                    @Param("purpose") TokenPurpose purpose,
                    @Param("now") LocalDateTime now);

    /**
     * 만료됐거나 이미 쓴 토큰을 지운다 (I-12).
     *
     * 쓴 토큰을 바로 안 지우는 이유 — "이 링크 왜 안 되지"를 조사할 여지를 남긴다.
     * 지우는 게 아니라 **못 쓰게 하는 것**이 보안 요건이고, 정리는 용량 문제다
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            delete from AuthToken t
             where t.expiresAt < :threshold
                or (t.usedAt is not null and t.usedAt < :threshold)
            """)
    int deleteSettled(@Param("threshold") LocalDateTime threshold);
}
