package com.milobeene.starlog.backlog.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.QBacklogEntry;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.querydsl.core.types.OrderSpecifier;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

/**
 * 정렬 계약 (FR-QRY-04, BR-QRY-01).
 *
 * **동작이 아니라 계약을 본다.** 목록 API로 정렬 안정성을 검증하려 했더니
 * tie-break(id desc)를 지워도 H2가 우연히 안정적인 순서를 줘서 통과했다 —
 * 변이 테스트로 확인했다. DB의 우연에 기대는 검증은 회귀를 못 막는다.
 *
 * 여기서는 order by 절이 실제로 몇 개 어떤 순서로 나가는지를 단언한다
 */
class BacklogSortTest {

    private static final QBacklogEntry ENTRY = QBacklogEntry.backlogEntry;

    @Test
    public void 모든_정렬은_2차_기준과_tie_break를_달고_나간다() {
        //given — BR-QRY-01. 2차 기준이 없으면 순서가 매 요청 흔들려 페이징이 깨진다

        //when //then
        for (BacklogSort sort : BacklogSort.values()) {
            String[] paths = pathsOf(sort);

            assertThat(paths)
                    .as("%s 의 order by", sort)
                    .endsWith("id");   // 마지막은 언제나 tie-break

            assertThat(paths)
                    .as("%s 에 2차 기준(lastPlayedOn)이 있어야 한다", sort)
                    .contains("lastPlayedOn");
        }
    }

    /** CASE식이라 컬럼 이름이 아니다. 경로 문자열이 이 모양으로 나온다 */
    private static final String PLAYING_FIRST = "status = PLAYING then 1 else 0 end";

    @Test
    public void 최근_플레이순은_진행_중을_맨_앞에_세운다() {
        //given — "지금 뭘 하고 있나"가 이 목록을 여는 이유다. 날짜만으로 세우면
        //        어제 끝낸 게임이 아직 붙들고 있는 게임보다 위로 온다

        //when
        String[] paths = pathsOf(BacklogSort.LAST_PLAYED);

        //then — 1차가 진행 중 여부, 그다음이 날짜. lastPlayedOn은 한 번만 나간다
        assertThat(paths).containsExactly(PLAYING_FIRST, "lastPlayedOn", "id");
        assertThat(directionsOf(BacklogSort.LAST_PLAYED)[0])
                .as("1이 위로 와야 진행 중이 앞이다")
                .isEqualTo("DESC");
    }

    @Test
    public void 다른_정렬에는_진행_중_우선이_안_붙는다() {
        //given — 평점·이름순은 사용자가 그 기준 하나로 줄을 세워 달라고 고른 것이다.
        //        상태가 끼어들면 기준이 흐려진다
        for (BacklogSort sort : BacklogSort.values()) {
            if (sort == BacklogSort.LAST_PLAYED) {
                continue;
            }
            assertThat(pathsOf(sort)).as("%s", sort).doesNotContain(PLAYING_FIRST);
        }
    }

    @Test
    public void 나머지_정렬은_1차_2차_tie_break_세_단계다() {
        //given //when //then
        assertThat(pathsOf(BacklogSort.RATING)).containsExactly("rating", "lastPlayedOn", "id");
        assertThat(pathsOf(BacklogSort.RELEASED_ON))
                .containsExactly("releasedOnResolved", "lastPlayedOn", "id");
        assertThat(pathsOf(BacklogSort.NAME)).containsExactly("displayName", "lastPlayedOn", "id");
        assertThat(pathsOf(BacklogSort.PLAYTIME))
                .containsExactly("playTimeHours", "lastPlayedOn", "id");
    }

    @Test
    public void 정렬_방향이_규칙대로다() {
        //given — 이름만 오름차순이다. 나머지는 "높은 것·최근 것이 위"

        //when //then
        assertThat(directionsOf(BacklogSort.NAME)[0]).isEqualTo("ASC");
        assertThat(directionsOf(BacklogSort.RATING)[0]).isEqualTo("DESC");
        assertThat(directionsOf(BacklogSort.RELEASED_ON)[0]).isEqualTo("DESC");
        assertThat(directionsOf(BacklogSort.PLAYTIME)[0]).isEqualTo("DESC");
        assertThat(directionsOf(BacklogSort.LAST_PLAYED)[0]).isEqualTo("DESC");
    }

    /**
     * nullable 컬럼만 nullsLast가 필요하다.
     * `displayName`은 `nullable = false`, `id`는 PK, 진행 중 여부는 CASE라 항상 0 아니면 1이다 —
     * 셋 다 NULL이 나올 수 없어 안 붙는 게 맞다
     */
    private static final java.util.Set<String> NOT_NULL_COLUMNS =
            java.util.Set.of("displayName", "id", PLAYING_FIRST);

    @Test
    public void nullable_컬럼은_전부_null을_뒤로_보낸다() {
        /*
         * given — NULL 위치는 DB마다 다르다 (H2는 가장 작게, PostgreSQL은 가장 크게).
         * 명시하지 않으면 dev와 prod의 정렬 결과가 갈린다.
         * 회차가 없으면 lastPlayedOn이, 평가 전이면 rating이, 기록 전이면 playTimeHours가 null이다
         */
        for (BacklogSort sort : BacklogSort.values()) {
            OrderSpecifier<?>[] orders = sort.toOrderSpecifiers(ENTRY);
            String[] paths = pathsOf(sort);

            //when //then
            for (int i = 0; i < orders.length; i++) {
                if (NOT_NULL_COLUMNS.contains(paths[i])) {
                    continue;
                }
                assertThat(orders[i].getNullHandling())
                        .as("%s 의 %s 는 nullable이라 nullsLast가 필요하다", sort, paths[i])
                        .isEqualTo(OrderSpecifier.NullHandling.NullsLast);
            }
        }
    }

    @Test
    public void 파라미터_문자열은_대소문자와_언더스코어를_흡수한다() {
        //when //then
        assertThat(BacklogSort.from("lastPlayed")).isEqualTo(BacklogSort.LAST_PLAYED);
        assertThat(BacklogSort.from("LAST_PLAYED")).isEqualTo(BacklogSort.LAST_PLAYED);
        assertThat(BacklogSort.from("releasedon")).isEqualTo(BacklogSort.RELEASED_ON);
        assertThat(BacklogSort.from(null)).isEqualTo(BacklogSort.LAST_PLAYED);
        assertThat(BacklogSort.from("  ")).isEqualTo(BacklogSort.LAST_PLAYED);
    }

    @Test
    public void 없는_정렬은_거부한다() {
        //when //then — 서버는 클라이언트를 믿지 않는다
        assertThatThrownBy(() -> BacklogSort.from("bogus"))
                .isInstanceOf(InvalidInputException.class);
    }

    private String[] pathsOf(BacklogSort sort) {
        return Arrays.stream(sort.toOrderSpecifiers(ENTRY))
                .map(order -> {
                    String target = order.getTarget().toString();
                    return target.substring(target.lastIndexOf('.') + 1);
                })
                .toArray(String[]::new);
    }

    private String[] directionsOf(BacklogSort sort) {
        return Arrays.stream(sort.toOrderSpecifiers(ENTRY))
                .map(order -> order.isAscending() ? "ASC" : "DESC")
                .toArray(String[]::new);
    }
}
