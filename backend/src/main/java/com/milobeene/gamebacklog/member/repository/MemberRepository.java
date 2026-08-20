package com.milobeene.gamebacklog.member.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.member.domain.Member;

/**
 * 인터페이스만 선언하면 스프링이 런타임에 구현체를 만들어 빈으로 등록한다.
 * @Repository도 필요 없다 — Repository 상속 자체가 등록 신호다
 */
public interface MemberRepository extends BaseRepository<Member, Long> {
}
