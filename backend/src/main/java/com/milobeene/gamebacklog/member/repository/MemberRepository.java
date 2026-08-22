package com.milobeene.gamebacklog.member.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.member.domain.Member;

/**
 * 인터페이스만 선언하면 스프링이 런타임에 구현체를 만들어 빈으로 등록한다.
 * @Repository도 필요 없다 — Repository 상속 자체가 등록 신호다
 */
public interface MemberRepository extends BaseRepository<Member, Long> {

    /**
     * 메서드 이름만으로 쿼리가 만들어진다 (파생 쿼리).
     * `deletedAt`을 조건에 넣지 않는 것이 의도다 — 탈퇴 유예 중인 이메일도
     * 재사용을 막아야 한다 (BR-AUTH-02)
     */
    boolean existsByEmail(String email);

    /** 로그인 시 시큐리티가 이 경로로 회원을 찾는다 (MemberDetailsService) */
    java.util.Optional<Member> findByEmail(String email);

    /**
     * 관리자 회원 목록 (FR-ADM-03).
     * findAll(Pageable)이 아니라 findAllBy인 이유 — BaseRepository의 findAll()과 이름이 겹치면
     * 파생 쿼리로 안 잡힌다. `By` 뒤에 조건이 없으면 전체가 대상이다
     */
    org.springframework.data.domain.Page<Member> findAllBy(org.springframework.data.domain.Pageable pageable);

    /** 구글 로그인 — sub로 찾는다 (FR-AUTH-07) */
    java.util.Optional<Member> findByGoogleSubject(String googleSubject);
}
