package com.milobeene.starlog.subscription.service;

import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.subscription.domain.Subscription;
import com.milobeene.starlog.subscription.domain.SubscriptionCommand;
import com.milobeene.starlog.subscription.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final MemberRepository memberRepository;

    /** 구독 등록 (FR-ACQ-04) */
    @Transactional
    public Long register(Long memberId, SubscriptionCommand command) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));

        Subscription subscription = Subscription.of(member, command);
        subscriptionRepository.persist(subscription);

        return subscription.getId();
    }

    @Transactional
    public void update(Long memberId, Long subscriptionId, SubscriptionCommand command) {
        findOwned(memberId, subscriptionId).update(command);
    }

    /**
     * 물리 삭제 (§7.4). 취득이 이 구독을 참조 중이면 FK 위반이 난다 —
     * 앱에서 막지 않고 DB 제약에 맡긴다. 진짜 방어선은 DB다
     */
    @Transactional
    public void delete(Long memberId, Long subscriptionId) {
        subscriptionRepository.delete(findOwned(memberId, subscriptionId));
    }

    public List<Subscription> findAll(Long memberId) {
        return subscriptionRepository.findByMemberIdOrderByStartedOnDesc(memberId);
    }

    /** 취득이 구독을 연결할 때 소유권을 확인하는 통로 */
    public Subscription findOwned(Long memberId, Long subscriptionId) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new NotFoundException("구독을 찾을 수 없습니다. id=" + subscriptionId));

        if (!subscription.getMember().getId().equals(memberId)) {
            throw new NotFoundException("구독을 찾을 수 없습니다. id=" + subscriptionId);
        }

        return subscription;
    }
}
