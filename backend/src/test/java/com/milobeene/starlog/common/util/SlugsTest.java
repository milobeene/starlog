package com.milobeene.starlog.common.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 스크린샷 폴더 이름 (architecture §10-1).
 *
 * **사람이 탐색기로 열어볼 폴더**라 읽히는 게 목적이다. 그래서 보통의 slug와 달리
 * 한글을 버리지 않는다 — 대신 경로를 벗어나게 하는 문자는 반드시 걷어낸다
 */
class SlugsTest {

    @Test
    void 공백과_기호는_하이픈이_된다() {
        assertThat(Slugs.of("Hollow Knight")).isEqualTo("hollow-knight");
        assertThat(Slugs.of("Ratchet & Clank: Rift Apart"))
                .isEqualTo("ratchet-clank-rift-apart");
    }

    @Test
    void 악센트는_기본_글자로_떨어진다() {
        //given //when //then — 결합 문자를 그냥 지우면 `pokmon`이 된다. 분해 후 지워야 `pokemon`이다
        assertThat(Slugs.of("Pokémon Legends")).isEqualTo("pokemon-legends");
    }

    @Test
    void 한글은_그대로_남는다() {
        //given //when //then — ASCII만 남기면 한글 이름이 통째로 빈 문자열이 된다
        assertThat(Slugs.of("젤다의 전설")).isEqualTo("젤다의-전설");
    }

    @Test
    void 경로_구분자가_섞여도_폴더를_못_벗어난다() {
        /*
         * ⚠️ 게임 이름은 IGDB에서 오거나 사용자가 직접 넣는다.
         * `../`가 그대로 폴더 이름이 되면 **데이터 루트 밖에 파일을 쓴다**
         */
        assertThat(Slugs.of("../../etc/passwd")).doesNotContain("/", "..");
        assertThat(Slugs.of("a/b\\c")).isEqualTo("a-b-c");
    }

    @Test
    void 남는_글자가_없으면_untitled() {
        //given //when //then — 폴더 이름이 빈 문자열이면 media/ 자체를 가리킨다
        assertThat(Slugs.of("///")).isEqualTo("untitled");
        assertThat(Slugs.of(null)).isEqualTo("untitled");
    }
}
