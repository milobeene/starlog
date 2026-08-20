package com.milobeene.gamebacklog.subscription.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.subscription.domain.Subscription;

import java.util.List;

public interface SubscriptionRepository extends BaseRepository<Subscription, Long> {

    /** 구독은 물리 삭제라 소프트 삭제 조건이 없다 (§7.4) */
    List<Subscription> findByMemberIdOrderByStartedOnDesc(Long memberId);
}
