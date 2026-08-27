package com.milobeene.starlog.common.util;

/**
 * 이름 정렬 키 (v1.0, architecture §10-5).
 *
 * ## 왜 DB에 안 맡기나
 *
 * "영문 먼저, 그다음 한글"은 **DB 콜레이션으로 못 맞춘다.** H2와 PostgreSQL이 다르고,
 * 클라우드 모드는 사용자가 아무 PostgreSQL이나 고르므로 서버 로케일도 보장할 수 없다.
 * 같은 라이브러리가 기계마다 다른 순서로 뜨는 게 최악이라, **앱이 계산해서 칸에 넣는다.**
 *
 * <pre>
 *   8-Bit Adventures  →  0|8-bit adventures
 *   .hack             →  0|.hack
 *   Zelda             →  1|zelda
 *   apple             →  1|apple
 *   가디언             →  2|가디언
 *   ペルソナ            →  3|ペルソナ
 * </pre>
 *
 * 그룹 번호를 **앞에 붙여** 한 컬럼에 담는 이유 — 컬럼을 둘로 나누면 정렬할 때마다
 * `order by group, key`를 두 곳(목록·검색)에서 똑같이 써야 하고, 한 곳이 빠지면 조용히 어긋난다.
 * 문자열 하나면 어디서 정렬해도 같은 순서가 나온다.
 */
public final class SortKeys {

    private SortKeys() {
    }

    /** 숫자·기호 */
    private static final char OTHERS_FIRST = '0';
    /** 영문 */
    private static final char LATIN = '1';
    /** 한글 */
    private static final char HANGUL = '2';
    /** 그 밖의 문자 (일본어·중국어 등). 맨 뒤로 보낸다 */
    private static final char REST = '3';

    /**
     * @param displayName 화면에 보이는 이름. null이면 null을 돌려준다 —
     *                    비정규화 칸이라 원본이 없으면 키도 없는 게 맞다
     */
    public static String of(String displayName) {
        if (displayName == null) {
            return null;
        }
        String normalized = displayName.strip();
        if (normalized.isEmpty()) {
            return null;
        }

        /*
         * **소문자로 낮춘다.** 안 그러면 ASCII 순서상 대문자가 전부 소문자보다 앞서서
         * `Zelda`가 `apple`보다 먼저 온다 — 사람이 기대하는 순서가 아니다
         */
        return group(normalized.codePointAt(0)) + "|" + normalized.toLowerCase();
    }

    private static char group(int codePoint) {
        if (Character.isDigit(codePoint) || !Character.isLetter(codePoint)) {
            return OTHERS_FIRST;
        }
        if (codePoint < 0x80) {
            return LATIN;
        }
        // 한글 음절(가~힣) + 자모. `ㄱ`으로 시작하는 이름도 한글 무리에 둔다
        if ((codePoint >= 0xAC00 && codePoint <= 0xD7A3)
                || (codePoint >= 0x3131 && codePoint <= 0x318E)) {
            return HANGUL;
        }
        return REST;
    }
}
