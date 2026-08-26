package com.milobeene.starlog.common.util;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 서비스의 "오늘"을 정하는 곳.
 *
 * **`LocalDate.now()`를 그냥 쓰면 안 되는 이유** — 그건 JVM 기본 타임존을 따르는데,
 * Render 컨테이너는 UTC라 **일일 쿼터가 한국 시간 오전 9시에 초기화됐다.**
 * 화면에는 "자정에 채워집니다"라고 적혀 있으니 말과 동작이 달랐다.
 *
 * 도커 이미지에도 `TZ=Asia/Seoul`을 박아뒀지만 여기서 한 번 더 못 박는다 —
 * 실행 환경(로컬 맥, CI, 일렉트론)마다 기본 타임존이 다른데, 쿼터가 언제 풀리는지는
 * 환경이 정할 일이 아니다.
 */
public final class AppClock {

    /** 이 서비스는 한국에서 쓴다. 사용자별 타임존은 범위 밖이다 */
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private AppClock() {
    }

    /** 쿼터가 하루를 세는 기준 */
    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }
}
