package com.milobeene.starlog.admin.service;

import com.milobeene.starlog.admin.dto.SystemStatusResponse;
import com.milobeene.starlog.backlog.repository.CoverImageRepository;
import com.milobeene.starlog.common.quota.QuotaProperties;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.common.quota.UsageQuota;
import com.milobeene.starlog.common.quota.UsageQuotaRepository;
import com.milobeene.starlog.game.client.GameCatalogClient;
import com.milobeene.starlog.game.client.HttpIgdbClient;
import com.milobeene.starlog.game.client.IgdbProperties;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.domain.MemberRole;
import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * WEB-ONLY: /admin 시스템 탭 (docs/web-only-inventory.md).
 *
 * 로컬 앱에는 남의 사용량을 볼 일이 없다 — `local-app` 프로파일에서는 이 빈이 안 뜬다.
 *
 * **클래스 레벨 @Transactional을 일부러 안 붙였다.** DB 크기 조회가 PostgreSQL 전용이라
 * H2에서는 반드시 실패하는데, 실패한 쿼리는 잡아도 **트랜잭션을 rollback-only로 표시**한다.
 * 하나로 묶으면 커밋 시점에 UnexpectedRollbackException이 터져 화면 전체가 죽는다
 * (실제로 그렇게 났다). 읽기뿐이라 각 리포지토리 호출이 제 트랜잭션에서 돌면 충분하다
 */
@Slf4j
@Profile("!local-app")
@Service
public class SystemStatusService {

    private final GameCatalogClient catalogClient;
    private final IgdbProperties igdbProperties;
    private final CoverImageRepository coverImageRepository;
    private final UsageQuotaRepository usageQuotaRepository;
    private final MemberRepository memberRepository;
    private final QuotaProperties quotaProperties;
    private final JdbcTemplate jdbc;

    public SystemStatusService(GameCatalogClient catalogClient, IgdbProperties igdbProperties,
                               CoverImageRepository coverImageRepository,
                               UsageQuotaRepository usageQuotaRepository,
                               MemberRepository memberRepository,
                               QuotaProperties quotaProperties, JdbcTemplate jdbc) {
        this.catalogClient = catalogClient;
        this.igdbProperties = igdbProperties;
        this.coverImageRepository = coverImageRepository;
        this.usageQuotaRepository = usageQuotaRepository;
        this.memberRepository = memberRepository;
        this.quotaProperties = quotaProperties;
        this.jdbc = jdbc;
    }

    public SystemStatusResponse status() {
        return new SystemStatusResponse(igdb(), storage(), database(), quotaToday());
    }

    /**
     * 카운터는 `HttpIgdbClient`가 들고 있다. 테스트에서는 스텁 구현이 끼므로
     * **타입을 확인하고 아니면 null**을 돌려준다 — 여기서 캐스팅 실패로 관리자 화면이 죽으면 안 된다
     */
    private SystemStatusResponse.Igdb igdb() {
        if (!(catalogClient instanceof HttpIgdbClient http)) {
            return null;
        }
        return new SystemStatusResponse.Igdb(http.callCount(), http.rejectedCount(),
                igdbProperties.maxConcurrent(), igdbProperties.minCallInterval().toMillis());
    }

    private SystemStatusResponse.Storage storage() {
        return new SystemStatusResponse.Storage(
                coverImageRepository.countAll(), coverImageRepository.totalSizeBytes());
    }

    /**
     * Neon 스토리지. `pg_database_size()`는 PostgreSQL 전용이라 H2(dev)에서는 **반드시 실패한다** —
     * 터뜨리지 않고 null로 접는다. 이 값 하나 때문에 화면 전체가 안 뜨면 손해다.
     *
     * EntityManager가 아니라 JdbcTemplate을 쓰는 이유 — 하이버네이트 세션으로 실패한 쿼리를
     * 날리면 세션이 오염돼, 잡아도 이후 커밋이 UnexpectedRollbackException으로 터진다.
     * JdbcTemplate은 풀에서 제 커넥션을 받아 쓰므로 실패가 여기서 끝난다
     */
    private SystemStatusResponse.Database database() {
        try {
            Long size = jdbc.queryForObject("select pg_database_size(current_database())", Long.class);
            return new SystemStatusResponse.Database("PostgreSQL", size);
        } catch (RuntimeException e) {
            log.debug("pg_database_size 조회 실패 — PostgreSQL이 아닌 것으로 본다", e);
            return new SystemStatusResponse.Database("unknown", null);
        }
    }

    /*
     * @Transactional을 붙이지 않는다 — status()가 같은 객체에서 부르므로 프록시를 안 타
     * 애노테이션이 아무 일도 안 한다 (설계 원칙 11). 있으면 걸린 줄 착각하게 만들 뿐이다.
     * 읽기 두 번이라 각자의 트랜잭션으로 충분하다
     */
    private List<SystemStatusResponse.QuotaRow> quotaToday() {
        List<UsageQuota> rows = usageQuotaRepository.findAllOn(AppClock.today());
        if (rows.isEmpty()) {
            return List.of();
        }

        // 닉네임·권한을 붙이려고 회원을 한 번에 읽는다 — 줄마다 findById면 그게 N+1이다
        Map<Long, Member> members = memberRepository.findAll().stream()
                .collect(Collectors.toMap(Member::getId, member -> member, (a, b) -> a));

        return rows.stream()
                .map(row -> {
                    Member member = members.get(row.getId().memberId());
                    // 관리자는 한도가 없다 → null. 세기는 세므로 used는 그대로 보인다
                    boolean unlimited = member != null && member.getRole() == MemberRole.ADMIN;
                    return new SystemStatusResponse.QuotaRow(
                            row.getId().memberId(),
                            member == null ? "(삭제됨)" : member.getNickname(),
                            row.getId().kind().name(),
                            row.getId().kind().label(),
                            row.getUsed(),
                            unlimited ? null : quotaProperties.limitOf(row.getId().kind()));
                })
                .toList();
    }
}
