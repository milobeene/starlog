package com.milobeene.starlog.game;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.support.ControllerTestSupport;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 긴 텍스트가 실제로 들어가는지 (v1.7). IGDB storyline 실측 최대가 20,764자다 */
class DdlProbeTest extends ControllerTestSupport {

    @Test
    public void summary와_storyline이_2만자를_받는다() {
        //given — varchar(2000)이었다면 여기서 터진다
        String longText = "x".repeat(21000);

        //when
        List<Object[]> types = em.createNativeQuery("""
                select column_name, data_type, character_maximum_length
                from information_schema.columns
                where table_name = 'GAME' and column_name in ('SUMMARY','STORYLINE')
                """).getResultList();

        //then
        assertThat(types).hasSize(2);
        assertThat(types).allSatisfy(row -> {
            Object maxLen = row[2];
            assertThat(maxLen == null || ((Number) maxLen).longValue() >= 21000)
                    .as("%s 컬럼이 %s (%s)", row[0], row[1], maxLen)
                    .isTrue();
        });

        // 실제로 넣어본다 — 타입만 보고 넘기면 방언 차이를 놓친다
        em.createNativeQuery("""
                        insert into game (name, source, summary, storyline, created_at, updated_at)
                        values ('Long Text Game', 'MANUAL', :text, :text, current_timestamp, current_timestamp)
                        """)
                .setParameter("text", longText)
                .executeUpdate();
        em.flush();
    }
}
