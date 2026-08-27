package com.milobeene.starlog.common.util;

import java.text.Normalizer;
import java.util.Locale;

/**
 * 게임 이름 → 폴더 이름 (v1.0 7단계, architecture §10-1).
 *
 * <pre>
 *   Hollow Knight                    → hollow-knight
 *   Ratchet &amp; Clank: Rift Apart      → ratchet-clank-rift-apart
 *   Pokémon Legends                  → pokemon-legends
 *   젤다의 전설                        → 젤다의-전설
 * </pre>
 *
 * ## 사람이 열어볼 폴더다
 *
 * 게임 번호(`media/57/`)가 아니라 이름을 쓰는 건 **사용자 결정**이다. 스크린샷 폴더는
 * 탐색기로 직접 열어볼 물건이고, 숫자 폴더가 늘어선 화면에서는 뭘 찾을 수가 없다.
 *
 * ## 한글을 안 버린다
 *
 * 보통 slug는 ASCII만 남기는데, 그러면 한글 이름이 통째로 빈 문자열이 된다.
 * 여기서는 **폴더 이름**이라 사람이 읽는 게 목적이므로 한글을 그대로 둔다.
 * 대신 경로 구분자와 OS 금지문자는 반드시 걷어낸다 — 안 그러면 데이터 루트 밖으로 나간다
 */
public final class Slugs {

    /** 파일시스템이 감당하는 선. 넉넉하지만 무한하지는 않다 */
    private static final int MAX_LENGTH = 80;

    private Slugs() {
    }

    public static String of(String name) {
        if (name == null || name.isBlank()) {
            return "untitled";
        }

        /*
         * NFD로 분해하면 `é`가 `e` + 결합 악센트로 갈린다. 결합 문자를 지우면 `e`만 남아
         * **`Pokémon`이 `pokmon`이 아니라 `pokemon`이 된다.** 한글은 분해해도 자모가
         * 결합 문자로 분류되지 않아 아래에서 다시 합쳐진다
         */
        String decomposed = Normalizer.normalize(name.strip(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");

        String slug = Normalizer.normalize(decomposed, Normalizer.Form.NFC)
                .toLowerCase(Locale.ROOT)
                // 글자·숫자·한글만 남기고 나머지는 구분자로 (`:`·`/`·`\` 전부 여기서 사라진다)
                .replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}]+", "-")
                .replaceAll("^-+|-+$", "");

        if (slug.isEmpty()) {
            return "untitled";
        }
        return slug.length() > MAX_LENGTH ? slug.substring(0, MAX_LENGTH) : slug;
    }
}
