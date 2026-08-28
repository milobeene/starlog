package com.milobeene.starlog.member.service;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.service.DefaultCatalogSeeder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이 설치본의 **주인**을 정한다 (v1.0).
 *
 * ## 왜 필요한가
 *
 * v1.0에는 로그인이 없다. 그런데 스키마의 거의 모든 테이블이 `member_id`를 들고 있다
 * (지우려면 80파일 584줄을 뜯어야 해서 남기기로 했다 — architecture §8).
 * 그래서 "그 값이 무엇이냐"를 정해 줄 누군가가 필요하고, 그게 여기다.
 *
 * ## 없으면 만든다
 *
 * 새 기계에서 처음 켜거나 빈 DB에 붙었을 때 **아무것도 안 해도 앱이 떠야 한다.**
 * 회원이 하나도 없으면 주인을 만들고, 있으면 가장 먼저 만들어진 것을 주인으로 본다.
 *
 * ⚠️ **기본 선택지 시드도 여기서 돈다.** 예전에는 가입할 때 `DefaultCatalogSeeder`가
 * 돌았는데 가입이 사라졌다 — 여기가 안 받으면 플랫폼·입력방식 목록이 텅 빈 채로 시작한다.
 *
 * ## 기동 훅이 아니라 첫 요청에 만드는 이유
 *
 * `ApplicationRunner`로 하면 `DataInitializer`(dev 시드)와 순서를 다퉈야 한다 —
 * 먼저 돌면 주인이 "나"가 되고 시드 계정은 두 번째가 되어, 실데이터를 가진 쪽이
 * 주인이 아니게 된다. 첫 조회 때 정하면 그 순서 문제가 아예 없다.
 *
 * ## 값을 캐싱하지 않는다
 *
 * 주인은 앱이 도는 동안 안 바뀌지만 **DB를 갈아끼우면 바뀐다**(세이브파일 ↔ 클라우드).
 * 지금은 백엔드를 다시 띄우므로 캐싱해도 안전하지만, 그 전제가 조용히 깨지면
 * 남의 DB의 id로 내 DB를 읽는 사고가 난다. 조회 한 번이 그보다 싸다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OwnerService {

    private final MemberRepository memberRepository;
    private final OwnerCreator ownerCreator;

    public Long ownerId() {
        return memberRepository.findFirstByOrderByIdAsc()
                .map(Member::getId)
                .orElseGet(ownerCreator::create);
    }

    /**
     * 별도 빈이어야 한다 — `@Transactional`은 프록시 기반이라 같은 객체 안에서 부르면
     * 트랜잭션이 안 걸린다 (설계 원칙 11). 위가 readOnly이므로 쓰기는 반드시 밖으로 나가야 하고,
     * 안 그러면 PostgreSQL이 read-only 트랜잭션이라며 25006으로 거부한다
     */
    @Slf4j
    @Component
    @RequiredArgsConstructor
    static class OwnerCreator {

        /** 로그인이 없으니 비밀번호 자리에 넣을 것이 없다. 뜻만 남긴다 */
        private static final String NO_PASSWORD = "(no-login)";

        private final MemberRepository memberRepository;
        private final DefaultCatalogSeeder defaultCatalogSeeder;

        @Transactional
        public Long create() {
            /*
             * 닉네임은 `Scribe` (사용자 결정 2026-08-28). 이메일은 로그인이 없어진 뒤로
             * **아무 뜻도 없는 자리표시자**라 화면에서는 안 보여준다 — 컬럼이 `not null`이라
             * 값이 필요할 뿐이다
             */
            Member owner = Member.signUpWithEmail("owner@starlog.local", NO_PASSWORD, "Scribe");
            memberRepository.persist(owner);
            defaultCatalogSeeder.seed(owner);   // 플랫폼·입력방식 기본값
            log.info("주인 계정을 새로 만들었습니다. id={}", owner.getId());
            return owner.getId();
        }
    }
}
