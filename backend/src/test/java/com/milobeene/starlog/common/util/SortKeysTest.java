package com.milobeene.starlog.common.util;

import org.junit.jupiter.api.Test;

import java.util.Comparator;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 정렬 키 (architecture §10-5).
 *
 * **DB 콜레이션에 안 맡기기로 한 결과물**이라, 여기가 규칙의 유일한 명세다.
 */
class SortKeysTest {

    @Test
    void 숫자와_기호가_맨_앞_영문_다음_한글() {
        //given — 문서에 적힌 예시 그대로
        List<String> names = List.of("Zelda", "가디언", "apple", "8-Bit Adventures", ".hack");

        //when — 키로 정렬한다. 실제 조회의 order by가 하는 일과 같다
        List<String> sorted = names.stream()
                .sorted(Comparator.comparing(SortKeys::of))
                .toList();

        //then
        assertThat(sorted).containsExactly(
                ".hack", "8-Bit Adventures", "apple", "Zelda", "가디언");
    }

    @Test
    void 대문자가_소문자보다_앞서지_않는다() {
        /*
         * ASCII 순서상 `Z`(90)가 `a`(97)보다 앞이다. 낮추지 않으면
         * **`Zelda`가 `apple`보다 먼저** 오는데, 사람이 기대하는 순서가 아니다
         */
        assertThat(SortKeys.of("Zelda")).isGreaterThan(SortKeys.of("apple"));
    }

    @Test
    void 한글이_아닌_외국어는_맨_뒤() {
        //given //when //then — 일본어·중국어는 우리 정렬 규칙에 자리가 없다. 뒤로 몬다
        assertThat(SortKeys.of("ペルソナ")).isGreaterThan(SortKeys.of("가디언"));
    }

    @Test
    void 자모로_시작해도_한글_무리에_둔다() {
        //given //when //then — `ㄱ`으로 시작하는 이름이 기호 무리로 새면 안 된다
        assertThat(SortKeys.of("ㄱ부터")).startsWith("2|");
    }

    @Test
    void 비어_있으면_키도_없다() {
        //given //when //then — 비정규화 칸이라 원본이 없으면 키도 없는 게 맞다
        assertThat(SortKeys.of(null)).isNull();
        assertThat(SortKeys.of("   ")).isNull();
    }
}
