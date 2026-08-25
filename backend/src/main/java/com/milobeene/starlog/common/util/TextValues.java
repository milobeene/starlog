package com.milobeene.starlog.common.util;

import com.milobeene.starlog.common.exception.InvalidInputException;

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

    /** normalize 후에도 값이 남아야 하는 필수 입력. 유니크 제약이 걸린 이름에 쓴다 */
    public static String require(String value, String message) {
        String normalized = normalize(value);
        if (normalized == null) {
            throw new InvalidInputException(message);
        }
        return normalized;
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
