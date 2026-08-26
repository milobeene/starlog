package com.milobeene.starlog.common.quota;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;

import java.time.LocalDate;

/**
 * 오늘의 첫 사용 행을 만든다. **별도 빈 + REQUIRES_NEW인 이유가 전부다.**
 *
 * 예전에는 `DbQuotaGuard.consume` 안에서 `persist()`를 try/catch로 감싸 제약 위반을
 * 잡으려 했는데 **그 catch는 한 번도 안 돌았다.** `UsageQuota`는 `@EmbeddedId`(할당 식별자)라
 * Hibernate가 id를 받으려고 DB를 칠 필요가 없고, 그래서 `persist()`는 액션 큐에만 넣고
 * INSERT를 flush까지 미룬다. `consume()` 안에는 persist 뒤에 flush를 부르는 것이 없으니
 * 실제 INSERT는 **커밋 시점**, 즉 try 블록을 이미 빠져나간 뒤에 나간다.
 * (`QuotaRaceProofTest`가 이걸 못 박아 둔다.)
 *
 * 그렇다고 try 안에서 `flush()`를 부르면 더 나쁘다 — flush 실패는 하이버네이트 세션을
 * 오염시키고 트랜잭션을 rollback-only로 표시해서, catch가 돌아도 커밋이
 * `UnexpectedRollbackException`으로 터진다. `SystemStatusService`에서 밟았던 그 함정이다.
 *
 * **그래서 트랜잭션을 갈라야 한다.** 안쪽이 실패해도 바깥이 안 더러워지는 유일한 방법이고,
 * `@Transactional`은 프록시 기반이라(CLAUDE.md 11번) 반드시 별도 빈이어야 한다.
 */
@Profile("!local-app")
@Service
@RequiredArgsConstructor
public class UsageQuotaInitializer {

    private final UsageQuotaRepository repository;
    private final EntityManager em;

    /**
     * 오늘 첫 사용 행을 `used = 1`로 만든다. **실패하면 던진다 — 여기서 잡지 않는다.**
     *
     * 잡는 위치가 중요하다. `@Transactional` 메서드 **안에서** 잡으면 스프링은 정상 반환으로 보고
     * 커밋을 시도하는데, 그때 이미 세션이 오염돼 있어 `UnexpectedRollbackException`이 난다.
     * 잡는 건 트랜잭션 경계 **밖**, 즉 호출부여야 한다 — 그래야 이 트랜잭션만 조용히 롤백되고
     * 바깥은 멀쩡하다. REQUIRES_NEW가 그 격리를 만든다
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createFirstUse(Long memberId, LocalDate date, QuotaKind kind) {
        repository.persist(UsageQuota.firstUse(memberId, date, kind));
        // **여기서 밀어야 한다.** 안 밀면 커밋 때 터지는데, 그건 잡을 수 있는 자리가 아니다
        em.flush();
    }
}
