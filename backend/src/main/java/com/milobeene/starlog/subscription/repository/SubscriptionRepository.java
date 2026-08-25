package com.milobeene.starlog.subscription.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.subscription.domain.Subscription;

import java.util.List;

public interface SubscriptionRepository extends BaseRepository<Subscription, Long> {

    /** 구독은 물리 삭제라 소프트 삭제 조건이 없다 (§7.4) */
    List<Subscription> findByMemberIdOrderByStartedOnDesc(Long memberId);
}
