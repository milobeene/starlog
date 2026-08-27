package com.milobeene.starlog.system.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 외부 API 호출 한 건 (v1.0 8단계).
 *
 * ## 왜 카운터가 아니라 행인가
 *
 * 예전에는 인메모리 카운터였다. 그런데 **외부 API의 한도는 "초당 4회", "월 X회"처럼
 * 전부 기간당 횟수**라, 누적 숫자 하나로는 한도에 가까운지 알 수가 없다.
 * 게다가 프로세스가 죽으면 0으로 돌아가서 숫자가 뜻을 잃었다.
 *
 * 호출을 한 줄씩 남기면 **어떤 창(1분·24시간·30일)으로든 세어볼 수 있다.**
 * 혼자 쓰는 앱이라 하루 수십~수백 행이고, 오래된 것은 기동할 때 지운다.
 *
 * ## 회원을 안 붙인다
 *
 * 한 설치 = 한 사람이라 "누가 불렀나"가 항상 같은 답이다.
 * `member_id`를 붙이면 조회마다 조인이 하나 늘 뿐이다
 */
@Getter
@Entity
@Table(name = "api_call_log")
public class ApiCallLog extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApiProvider provider;

    /** 어떤 종류의 호출인지. 한도가 종류별로 다른 API를 대비한다 */
    @Column(nullable = false, length = 50)
    private String operation;

    /**
     * 호출 시각.
     *
     * `createdAt`(BaseEntity)이 있는데 따로 두는 이유 — 세는 기준이 감사(언제 행이 생겼나)가 아니라
     * **호출 시점**이고, 인덱스도 이 컬럼에 건다. 둘이 사실상 같더라도 **세는 컬럼은 이름이 그렇게
     * 생겨야** 나중에 읽는 사람이 헷갈리지 않는다
     */
    @Column(nullable = false)
    private LocalDateTime calledAt;

    /** 성공 여부. 실패도 대개 한도를 소모하므로 함께 센다 */
    @Column(nullable = false)
    private boolean success;

    protected ApiCallLog() {}

    public static ApiCallLog of(ApiProvider provider, String operation,
                                LocalDateTime calledAt, boolean success) {
        ApiCallLog log = new ApiCallLog();
        log.provider = provider;
        log.operation = operation;
        log.calledAt = calledAt;
        log.success = success;
        return log;
    }
}
