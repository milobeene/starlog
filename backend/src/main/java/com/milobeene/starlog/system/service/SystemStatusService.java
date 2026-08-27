package com.milobeene.starlog.system.service;

import com.milobeene.starlog.backlog.repository.CoverImageRepository;
import com.milobeene.starlog.common.storage.StorageProperties;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.system.domain.ApiProvider;
import com.milobeene.starlog.system.dto.SystemStatusResponse;
import com.milobeene.starlog.system.repository.ApiCallLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * 시스템 현황 (v1.0 8단계에서 `admin/`을 대체).
 *
 * ## 무엇이 바뀌었나
 *
 * 예전에는 **남의 사용량**(회원별 일일 쿼터)이 절반이었다. 1인 앱에서 그건 뜻이 없어 사라졌고,
 * 대신 **내 키가 한도에 얼마나 가까운지**가 남았다 — 내 IGDB 키, 내 버킷, 내 DB다.
 *
 * ## 클래스 레벨 `@Transactional`을 일부러 안 붙였다
 *
 * DB 크기 조회가 PostgreSQL 전용이라 H2에서는 반드시 실패하는데, **실패한 쿼리는 잡아도
 * 트랜잭션을 rollback-only로 표시한다.** 하나로 묶으면 커밋 시점에
 * `UnexpectedRollbackException`이 터져 화면 전체가 죽는다(실제로 그렇게 났다).
 * 읽기뿐이라 각 리포지토리 호출이 제 트랜잭션에서 돌면 충분하다
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SystemStatusService {

    /** 호출 기록 보존 기간. 30일이면 "월 한도"까지 볼 수 있다 */
    public static final int RETENTION_DAYS = 30;

    private final ApiCallLogRepository apiCallLogRepository;
    private final CoverImageRepository coverImageRepository;
    private final StorageProperties storageProperties;
    private final JdbcTemplate jdbc;

    public SystemStatusResponse status() {
        LocalDateTime now = AppClock.now();

        List<SystemStatusResponse.ApiUsage> usage = Arrays.stream(ApiProvider.values())
                .map(provider -> usageOf(provider, now))
                .toList();

        return new SystemStatusResponse(
                usage,
                new SystemStatusResponse.StorageStatus(
                        coverImageRepository.countAll(),
                        coverImageRepository.totalSizeBytes(),
                        storageProperties.hasCredentials()),
                new SystemStatusResponse.DatabaseStatus(productName(), databaseSize()),
                RETENTION_DAYS);
    }

    /**
     * 창 넷을 각각 센다.
     *
     * **누적 한 숫자로는 한도를 못 본다.** 외부 API 한도는 "초당 4회", "월 X회"처럼
     * 전부 기간당 횟수라, 세는 창이 한도의 창과 같아야 비교가 성립한다
     */
    private SystemStatusResponse.ApiUsage usageOf(ApiProvider provider, LocalDateTime now) {
        return new SystemStatusResponse.ApiUsage(
                provider.name(),
                apiCallLogRepository.countSince(provider, now.minusMinutes(1)),
                apiCallLogRepository.countSince(provider, now.minusHours(1)),
                apiCallLogRepository.countSince(provider, now.minusDays(1)),
                apiCallLogRepository.countSince(provider, now.minusDays(RETENTION_DAYS)),
                apiCallLogRepository.countFailedSince(provider, now.minusDays(1)),
                apiCallLogRepository.oldestOf(provider));
    }

    private String productName() {
        try {
            return jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<String>) conn ->
                    conn.getMetaData().getDatabaseProductName());
        } catch (RuntimeException e) {
            return "알 수 없음";
        }
    }

    /**
     * DB 크기.
     *
     * PostgreSQL은 `pg_database_size`가 있고, H2(로컬 모드)는 없다 —
     * 대신 세이브파일의 실제 크기를 물어본다. **둘 다 실패하면 null**이고 화면은 `—`를 그린다
     */
    private Long databaseSize() {
        try {
            return jdbc.queryForObject(
                    "select pg_database_size(current_database())", Long.class);
        } catch (RuntimeException ignored) {
            // PostgreSQL이 아니다. H2 파일 크기를 시도한다
        }
        try {
            return jdbc.queryForObject(
                    "select cast(setting_value as bigint) from information_schema.settings"
                            + " where setting_name = 'info.FILE_SIZE'", Long.class);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
