package com.milobeene.starlog.system.service;

import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.system.domain.ApiCallLog;
import com.milobeene.starlog.system.domain.ApiProvider;
import com.milobeene.starlog.system.repository.ApiCallLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 외부 API 호출을 한 줄 남긴다 (v1.0 8단계).
 *
 * ## `REQUIRES_NEW`인 이유
 *
 * 호출은 대개 **다른 트랜잭션 안에서** 일어난다(게임 담기 → IGDB 조회 → 저장).
 * 같은 트랜잭션에 얹으면 그 작업이 롤백될 때 **호출 기록도 함께 사라진다.**
 * 그런데 IGDB 입장에서는 이미 부른 것이고 한도도 이미 깎였다 — 기록이 사라지면
 * 화면의 사용량이 실제보다 적게 나온다. 별도 트랜잭션이라야 사실과 맞는다.
 *
 * ## 실패를 삼킨다
 *
 * **계측이 본체를 망가뜨리면 안 된다.** 사용량 기록이 안 됐다고 게임 검색이 실패하면
 * 본말전도다. 로그만 남기고 넘어간다
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApiCallRecorder {

    private final ApiCallLogRepository repository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(ApiProvider provider, String operation, boolean success) {
        try {
            repository.persist(ApiCallLog.of(provider, operation, AppClock.now(), success));
        } catch (RuntimeException e) {
            log.warn("API 호출 기록 실패 — 본체는 계속한다. provider={} operation={}",
                    provider, operation, e);
        }
    }
}
