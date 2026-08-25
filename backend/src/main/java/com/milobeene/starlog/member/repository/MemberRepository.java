package com.milobeene.starlog.member.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.member.domain.Member;

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
     * **세 파라미터 전부 항상 바인딩한다 — `:param is null or …` 관용구 금지.**
     * PostgreSQL은 null 파라미터의 타입을 문맥으로 못 정하면 죽는다: concat 안이면
     * `lower(bytea)`, 단독 `? is null`이면 `could not determine data type`. H2는 둘 다
     * 관대해서 **테스트 전체가 초록불인 채로 prod에서만 터졌다** (Neon 실검증에서 발견).
     * 그래서 서비스가 "조건 없음"을 값으로 바꿔 넘긴다 — 이메일은 ''(like '%%' = 전건),
     * 날짜는 경계값(1970 / 9999년). created_at은 JPA Auditing이 항상 채우므로 손실 없다.
     *
     * 정렬은 **승인 대기를 맨 위로.** 관리자가 이 화면을 여는 이유가 대개 그것이다
     */
    @org.springframework.data.jpa.repository.Query(
            "select m from Member m"
                    + " where lower(m.email) like lower(concat('%', :email, '%'))"
                    + "   and m.createdAt >= :from"
                    + "   and m.createdAt < :to"
                    + " order by case when m.approvedAt is null then 0 else 1 end, m.id desc")
    org.springframework.data.domain.Page<Member> search(
            @org.springframework.data.repository.query.Param("email") String email,
            @org.springframework.data.repository.query.Param("from") java.time.LocalDateTime from,
            @org.springframework.data.repository.query.Param("to") java.time.LocalDateTime to,
            org.springframework.data.domain.Pageable pageable);

    /** 구글 로그인 — sub로 찾는다 (FR-AUTH-07) */
    java.util.Optional<Member> findByGoogleSubject(String googleSubject);
}
