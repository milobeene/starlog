package com.milobeene.starlog.backlog.domain;

import com.milobeene.starlog.common.entity.Money;

import java.time.LocalDate;
import java.util.List;

/**
 * 개인 오버라이드 입력값 묶음. 인자 6개를 늘어놓으면 두 개의 List<String>이
 * 나란히 붙어서 순서를 바꿔 넣어도 컴파일이 통과한다.
 */
public record OverrideCommand(
        String name,
        List<String> developers,
        List<String> publishers,
        LocalDate releasedOn,
        Money listPrice
) {
}
