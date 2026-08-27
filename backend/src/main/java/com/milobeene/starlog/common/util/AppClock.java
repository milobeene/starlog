package com.milobeene.starlog.common.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 서비스의 "오늘"을 정하는 곳.
 *
 * **`LocalDate.now()`를 그냥 쓰면 안 되는 이유** — 그건 JVM 기본 타임존을 따르는데,
 * 예전 배포(Render)는 UTC라 **일일 쿼터가 한국 시간 오전 9시에 초기화됐다.**
 * 화면에는 "자정에 채워집니다"라고 적혀 있으니 말과 동작이 달랐다.
 *
 * **쿼터는 v1.0에서 사라졌지만 이 곳은 남는다.** 실행 환경(로컬 맥, CI, 일렉트론)마다
 * 기본 타임존이 다른데, "최근 24시간"이나 "이번 달"의 경계를 환경이 정하면 안 된다.
 * 지금은 API 사용량 집계가 이 시계를 쓴다.
 */
public final class AppClock {

    /** 이 서비스는 한국에서 쓴다. 사용자별 타임존은 범위 밖이다 */
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private AppClock() {
    }

    /** 하루를 세는 기준 */
    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    /** 지금. API 사용량이 "최근 N분/시간"을 자를 때 쓴다 */
    public static LocalDateTime now() {
        return LocalDateTime.now(ZONE);
    }
}
