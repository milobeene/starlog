package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.util.TextValues;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Map;

/**
 * 커버 업로드 검증 (K-3).
 *
 * **presigned 업로드에서는 서버가 파일 바이트를 한 번도 안 거친다.** 그래서 세 겹으로 막는다:
 *
 *   1. 발급 시 — 확장자·MIME·선언 크기 화이트리스트 (여기)
 *   2. 서명 — Content-Type·Content-Length를 서명에 포함해 **스토리지가 거부**하게 (FileStoragePort)
 *   3. 확정 시 — 실제 크기 재확인 + **매직 넘버 검사** (여기)
 *
 * 3번이 "이미지로 위장한 파일 차단"의 실체다. 확장자와 헤더는 클라이언트가 마음대로 쓸 수 있으므로
 * 파일 첫 바이트를 봐야 한다. 1·2번만으로는 .jpg 이름표를 단 HTML을 못 막는다
 */
@Component
public class CoverImageValidator {

    /** 매직 넘버를 아는 형식만 허용한다. 검사할 수 없는 형식을 허용하면 3번 방어가 무의미해진다 */
    private static final Map<String, String> ALLOWED = Map.of(
            "jpg", "image/jpeg",
            "jpeg", "image/jpeg",
            "png", "image/png",
            "webp", "image/webp");

    /** WebP까지 판별하려면 12바이트가 필요하다 (RIFF....WEBP) */
    public static final int MAGIC_LENGTH = 12;

    /** 발급 단계 — 클라이언트가 "선언한" 값을 본다 */
    public String validateAndResolveContentType(String fileName, long declaredSize, long maxBytes) {
        String normalized = TextValues.normalize(fileName);
        if (normalized == null) {
            throw new InvalidInputException("파일 이름은 필수입니다");
        }

        int dot = normalized.lastIndexOf('.');
        if (dot < 0 || dot == normalized.length() - 1) {
            throw new InvalidInputException("확장자가 없는 파일은 올릴 수 없습니다: " + fileName);
        }

        String extension = normalized.substring(dot + 1).toLowerCase(Locale.ROOT);
        String contentType = ALLOWED.get(extension);
        if (contentType == null) {
            throw new InvalidInputException(
                    "지원하지 않는 형식입니다: " + extension + " (jpg, png, webp만 가능)");
        }

        if (declaredSize <= 0) {
            throw new InvalidInputException("파일 크기가 올바르지 않습니다");
        }
        if (declaredSize > maxBytes) {
            throw new InvalidInputException(
                    "파일이 너무 큽니다. 최대 %dMB".formatted(maxBytes / 1024 / 1024));
        }

        return contentType;
    }

    /**
     * 확정 단계 — 스토리지가 실제로 갖고 있는 것을 본다.
     *
     * 선언 크기를 다시 안 믿는 이유: 서명에 Content-Length가 들어가 있어도
     * 스토리지 구현에 따라 느슨할 수 있고, 어차피 HEAD 한 번이면 확인되는 값이다
     */
    public void validateStored(long actualSize, long maxBytes, byte[] head, String contentType) {
        if (actualSize <= 0) {
            throw new InvalidInputException("업로드된 파일이 비어 있습니다");
        }
        if (actualSize > maxBytes) {
            throw new InvalidInputException(
                    "파일이 너무 큽니다. 최대 %dMB".formatted(maxBytes / 1024 / 1024));
        }
        if (!matchesMagic(head, contentType)) {
            throw new InvalidInputException("이미지 파일이 아닙니다");
        }
    }

    /**
     * 파일 첫 바이트로 실제 형식을 판정한다.
     *
     * JPEG  FF D8 FF
     * PNG   89 50 4E 47 0D 0A 1A 0A
     * WebP  "RIFF" + 4바이트 크기 + "WEBP"  ← 크기 4바이트를 건너뛰므로 위치 검사가 두 군데다
     */
    private boolean matchesMagic(byte[] head, String contentType) {
        if (head == null) {
            return false;
        }

        return switch (contentType) {
            case "image/jpeg" -> startsWith(head, 0xFF, 0xD8, 0xFF);
            case "image/png" -> startsWith(head, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            case "image/webp" -> startsWith(head, 0x52, 0x49, 0x46, 0x46)          // RIFF
                    && head.length >= 12
                    && head[8] == 0x57 && head[9] == 0x45                          // WE
                    && head[10] == 0x42 && head[11] == 0x50;                       // BP
            default -> false;
        };
    }

    private boolean startsWith(byte[] head, int... expected) {
        if (head.length < expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if ((head[i] & 0xFF) != expected[i]) {
                return false;
            }
        }
        return true;
    }
}
