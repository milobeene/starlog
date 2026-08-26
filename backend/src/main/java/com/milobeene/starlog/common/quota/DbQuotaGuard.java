package com.milobeene.starlog.common.quota;

import com.milobeene.starlog.common.exception.TooManyRequestsException;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.member.domain.MemberRole;
import com.milobeene.starlog.member.repository.MemberRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * DB에 세는 일일 쿼터.
 *
 * WEB-ONLY (docs/web-only-inventory.md §5). `local-app` 프로파일에서는 이 빈이 안 뜨고
 * `NoOpQuotaGuard`가 대신 붙는다.
 *
 * **인메모리로 세지 않는 이유** — Render 무료는 15분 무활동이면 프로세스를 내린다.
 * 카운터가 매번 0으로 돌아가면 쿼터가 아니라 장식이다.
 */
@Profile("!local-app")
@Service
@Transactional(readOnly = true)
public class DbQuotaGuard implements QuotaGuard {

    private final UsageQuotaRepository repository;
    private final QuotaProperties properties;
    private final MemberRepository memberRepository;

    public DbQuotaGuard(UsageQuotaRepository repository, QuotaProperties properties,
                        MemberRepository memberRepository) {
        this.repository = repository;
        this.properties = properties;
        this.memberRepository = memberRepository;
    }

    /**
     * 관리자는 한도가 없다.
     *
     * 쿼터의 목적은 **한 사람이 공용 IGDB 키를 다 쓰는 걸 막는 것**인데, 관리자는 마스터
     * 재동기화·병합처럼 원래 여러 건을 연달아 부르는 일을 한다. 거기서 막히면
     * 관리 작업이 중간에 끊긴다.
     *
     * **세기는 센다** — 무제한이라고 안 세면 /admin 시스템 탭에서 누가 얼마나 썼는지가
     * 빈칸이 되어, 정작 부하를 만든 사람만 안 보인다
     */
    private boolean unlimited(Long memberId) {
        return memberRepository.findById(memberId)
                .map(member -> member.getRole() == MemberRole.ADMIN)
                .orElse(false);
    }

    /**
     * 한 건 쓴다.
     *
     * 호출부가 **컨트롤러**라 이 트랜잭션은 서비스 트랜잭션과 겹치지 않는다.
     * 즉 뒤이은 작업이 실패해도 쿼터는 이미 세어진 채로 남는다.
     *
     * 그게 맞는 쪽이다 — 세는 대상이 "성공한 담기"가 아니라 **"IGDB를 부르게 만든 시도"**다.
     * 실패한 호출도 남의 초당 4건을 먹었다. 되돌려주면 실패를 반복해 한도를 무한히 우회한다
     */
    @Override
    @Transactional
    public void consume(Long memberId, QuotaKind kind) {
        LocalDate today = AppClock.today();
        boolean unlimited = unlimited(memberId);
        int limit = properties.limitOf(kind);

        /*
         * **세기 전에 본다.** 순서를 뒤집으면(올리고 나서 확인) 벌크 UPDATE가 영속성 컨텍스트를
         * 우회한 직후를 읽게 되어 옛 값을 볼 수 있다 (설계 원칙 13).
         *
         * 동시 요청 둘이 한도 직전에 같이 통과해 1을 넘길 수는 있다. 쿼터에서 하나 넘치는 건
         * 아무 의미가 없어 락을 걸지 않는다 — 락 비용이 얻는 것보다 크다
         */
        if (!unlimited && usedOf(memberId, today, kind) >= limit) {
            throw new TooManyRequestsException("QUOTA_EXCEEDED",
                    "오늘 %s 한도(%d회)를 모두 쓰셨습니다. 자정에 다시 채워집니다".formatted(kind.label(), limit));
        }

        if (repository.increment(memberId, today, kind) == 0) {
            /*
             * 오늘 첫 사용. 동시에 두 요청이 여기 닿으면 둘 다 INSERT를 시도하는데
             * **복합 PK가 진짜 방어선이다** (설계 원칙 7). 진 쪽은 제약 위반을 받고
             * UPDATE로 물러선다 — 그때는 상대가 이미 줄을 만들어 뒀다
             */
            try {
                repository.persist(UsageQuota.firstUse(memberId, today, kind));
            } catch (DataIntegrityViolationException e) {
                repository.increment(memberId, today, kind);
            }
        }
    }

    @Override
    public List<QuotaStatus> statusOf(Long memberId) {
        Map<QuotaKind, Integer> limits = properties.all();
        boolean unlimited = unlimited(memberId);
        List<DailyUsage> today = repository.findDay(memberId, AppClock.today());

        List<QuotaStatus> result = new ArrayList<>();
        for (QuotaKind kind : QuotaKind.values()) {
            int used = today.stream()
                    .filter(row -> row.kind() == kind)
                    .mapToInt(DailyUsage::used)
                    .findFirst()
                    .orElse(0);
            result.add(new QuotaStatus(kind, kind.label(), used,
                    unlimited ? null : limits.get(kind)));
        }
        return result;
    }

    private int usedOf(Long memberId, LocalDate date, QuotaKind kind) {
        return repository.findUsed(memberId, date, kind).orElse(0);
    }
}
