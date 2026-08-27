package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.util.TextValues;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;

/**
 * 스크린샷·영상 검증 (v1.0 7단계 + 영상 확장).
 *
 * ## 커버(`CoverImageValidator`)와 왜 나눴나
 *
 * 커버는 **한 장을 대표로 세우는 것**이라 이미지여야 하고 5MB면 넉넉하다.
 * 여기는 **모아두는 것**이라 영상이 들어오고 크기 단위가 두 자릿수 MB로 다르다.
 * 한 클래스에서 분기하면 "이 검증이 어느 쪽 규칙이지"가 매번 헷갈린다.
 *
 * ## 매직 넘버를 아는 형식만 받는다
 *
 * 확장자는 이름표일 뿐이라 `.mp4`로 바꾼 실행 파일을 못 막는다. 첫 바이트를 본다.
 * MP4·MOV는 **4번째 바이트부터** `ftyp`이 오는 구조(ISO BMFF)라 앞 네 바이트를 건너뛴다
 */
@Component
public class MediaFileValidator {

    private static final Map<String, String> IMAGES = Map.of(
            "jpg", "image/jpeg",
            "jpeg", "image/jpeg",
            "png", "image/png",
            "webp", "image/webp");

    /**
     * 영상 (2026-08-28 추가).
     *
     * **스팀은 jpg, 닌텐도 스위치는 jpg + mp4**를 뱉는다. mov는 맥 화면 녹화다.
     * webm은 매직 넘버가 EBML이라 확실히 가려낼 수 있어 함께 받는다
     */
    private static final Map<String, String> VIDEOS = Map.of(
            "mp4", "video/mp4",
            "mov", "video/quicktime",
            "webm", "video/webm");

    /** WebP는 12바이트, ISO BMFF의 `ftyp`은 8바이트면 보인다 */
    public static final int MAGIC_LENGTH = 12;

    /**
     * 확장자 → MIME 타입. **DB에 행이 없어서** 저장해둔 곳이 없으니 이름에서 되돌린다.
     *
     * 저장할 때 확장자와 매직 넘버를 대조했으므로 확장자를 믿어도 된다.
     * 안 주면 `application/octet-stream`으로 나가서 브라우저가 영상을 못 재생한다
     */
    public static String contentTypeOf(String fileName) {
        String ext = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String found = IMAGES.get(ext);
        return found != null ? found : VIDEOS.getOrDefault(ext, "application/octet-stream");
    }

    public boolean isVideo(String contentType) {
        return contentType != null && contentType.startsWith("video/");
    }

    /**
     * 확장자에서 형식을 정하고 크기를 본다.
     *
     * @param maxImageBytes 이미지 상한
     * @param maxVideoBytes 영상 상한. 영상은 자릿수가 달라 따로 받는다
     */
    public String resolveContentType(String fileName, long size,
                                     long maxImageBytes, long maxVideoBytes) {
        String normalized = TextValues.normalize(fileName);
        if (normalized == null) {
            throw new InvalidInputException("파일 이름은 필수입니다");
        }

        int dot = normalized.lastIndexOf('.');
        if (dot < 0 || dot == normalized.length() - 1) {
            throw new InvalidInputException("확장자가 없는 파일은 올릴 수 없습니다: " + fileName);
        }
        String extension = normalized.substring(dot + 1).toLowerCase(Locale.ROOT);

        String contentType = IMAGES.get(extension);
        long limit = maxImageBytes;
        if (contentType == null) {
            contentType = VIDEOS.get(extension);
            limit = maxVideoBytes;
        }
        if (contentType == null) {
            throw new InvalidInputException("지원하지 않는 형식입니다: " + extension
                    + " (jpg · png · webp · mp4 · mov · webm)");
        }

        if (size <= 0) {
            throw new InvalidInputException("파일 크기가 올바르지 않습니다");
        }
        if (size > limit) {
            throw new InvalidInputException(
                    "파일이 너무 큽니다. 최대 %dMB".formatted(limit / 1024 / 1024));
        }
        return contentType;
    }

    /** 첫 바이트가 확장자와 맞는지. 이름표를 바꾼 파일을 여기서 막는다 */
    public void validateMagic(byte[] head, String contentType) {
        boolean ok = switch (contentType) {
            case "image/jpeg" -> startsWith(head, 0xFF, 0xD8, 0xFF);
            case "image/png" -> startsWith(head, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            case "image/webp" -> startsWith(head, 0x52, 0x49, 0x46, 0x46)
                    && startsWithAt(head, 8, 0x57, 0x45, 0x42, 0x50);
            /*
             * ISO BMFF — 앞 4바이트는 박스 길이라 값이 제각각이고, 5~8바이트가 `ftyp`이다.
             * mp4와 mov가 같은 컨테이너라 여기서는 구분하지 않는다 — 재생기(브라우저)가 판단한다
             */
            case "video/mp4", "video/quicktime" -> startsWithAt(head, 4, 0x66, 0x74, 0x79, 0x70);
            case "video/webm" -> startsWith(head, 0x1A, 0x45, 0xDF, 0xA3);   // EBML
            default -> false;
        };

        if (!ok) {
            throw new InvalidInputException("파일 내용이 형식과 맞지 않습니다");
        }
    }

    private static boolean startsWith(byte[] head, int... expected) {
        return startsWithAt(head, 0, expected);
    }

    private static boolean startsWithAt(byte[] head, int offset, int... expected) {
        if (head == null || head.length < offset + expected.length) {
            return false;
        }
        return Arrays.equals(
                Arrays.copyOfRange(head, offset, offset + expected.length),
                toBytes(expected));
    }

    private static byte[] toBytes(int... values) {
        byte[] bytes = new byte[values.length];
        for (int i = 0; i < values.length; i++) {
            bytes[i] = (byte) values[i];
        }
        return bytes;
    }
}
