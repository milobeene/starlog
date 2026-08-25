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

    /**
     * 관리자 회원 검색 (FR-ADM-03). 이메일 부분 일치 + 가입일 범위.
     *
     * 파라미터가 null이면 그 조건을 건너뛴다 — 조합이 셋뿐이라 QueryDSL까지 갈 필요가 없다.
     * 조건이 더 늘면 그때 동적 쿼리로 옮긴다.
     *
     * 정렬은 **승인 대기를 맨 위로.** 관리자가 이 화면을 여는 이유가 대개 그것이다
     */
    @org.springframework.data.jpa.repository.Query(
            "select m from Member m"
                    + " where (:email is null or lower(m.email) like lower(concat('%', :email, '%')))"
                    + "   and (:from is null or m.createdAt >= :from)"
                    + "   and (:to is null or m.createdAt < :to)"
                    + " order by case when m.approvedAt is null then 0 else 1 end, m.id desc")
    org.springframework.data.domain.Page<Member> search(
            @org.springframework.data.repository.query.Param("email") String email,
            @org.springframework.data.repository.query.Param("from") java.time.LocalDateTime from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDateTime to,
            org.springframework.data.domain.Pageable pageable);

    /** 구글 로그인 — sub로 찾는다 (FR-AUTH-07) */
    java.util.Optional<Member> findByGoogleSubject(String googleSubject);
}
