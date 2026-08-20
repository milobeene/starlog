package com.milobeene.gamebacklog.common.util;

import java.util.List;
import java.util.Objects;

/** 문자열·문자열 컬렉션 정규화. Game과 BacklogEntry가 같은 규칙을 쓴다 */
public final class TextValues {

    private TextValues() {}

    /** strip 후 빈 문자열은 null로 수렴 (CLAUDE.md 일반 원칙) */
    public static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String stripped = value.strip();
        return stripped.isEmpty() ? null : stripped;
    }

    /**
     * 컬렉션 "인스턴스"를 유지한 채 내용만 교체.
     * 새 List로 갈아끼우면 @ElementCollection 추적이 끊겨 전체 DELETE 후 재INSERT가 나간다.
     */
    public static void replaceAll(List<String> target, List<String> values) {
        target.clear();
        if (values == null) {
            return;
        }
        values.stream()
                .map(TextValues::normalize)
                .filter(Objects::nonNull)
                .forEach(target::add);
    }
}
