package com.milobeene.starlog.backlog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.common.exception.InvalidInputException;
import org.junit.jupiter.api.Test;

/**
 * 위장 파일 판정 (K-3). 스프링 없이 도는 순수 로직이라 단위 테스트로 충분하다.
 *
 * 컨트롤러 테스트(CoverImageTest)가 전체 흐름을 보고, 여기서는 **바이트 패턴 경계**를 훑는다
 */
class CoverImageValidatorTest {

    private static final long MAX = 5L * 1024 * 1024;

    private final CoverImageValidator validator = new CoverImageValidator();

    @Test
    public void 확장자로_contentType을_정한다() {
        //when //then — 클라이언트가 보낸 헤더가 아니라 확장자가 기준이다
        assertThat(validator.validateAndResolveContentType("a.JPG", 100, MAX)).isEqualTo("image/jpeg");
        assertThat(validator.validateAndResolveContentType("a.jpeg", 100, MAX)).isEqualTo("image/jpeg");
        assertThat(validator.validateAndResolveContentType("a.png", 100, MAX)).isEqualTo("image/png");
        assertThat(validator.validateAndResolveContentType("a.webp", 100, MAX)).isEqualTo("image/webp");
    }

    @Test
    public void 확장자가_없거나_모르는_형식이면_거부한다() {
        //when //then
        assertThatThrownBy(() -> validator.validateAndResolveContentType("cover", 100, MAX))
                .isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> validator.validateAndResolveContentType("cover.", 100, MAX))
                .isInstanceOf(InvalidInputException.class);
        // gif·svg는 매직 넘버 검사를 안 붙였으므로 허용 목록에서 뺐다. svg는 스크립트를 품을 수 있다
        assertThatThrownBy(() -> validator.validateAndResolveContentType("cover.svg", 100, MAX))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void JPEG_매직넘버를_판정한다() {
        //given
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0, 0, 0, 0, 0, 0, 0, 0, 0};

        //when //then
        assertThatCode(() -> validator.validateStored(12, MAX, jpeg, "image/jpeg"))
                .doesNotThrowAnyException();
    }

    @Test
    public void PNG_매직넘버를_판정한다() {
        //given
        byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};

        //when //then
        assertThatCode(() -> validator.validateStored(12, MAX, png, "image/png"))
                .doesNotThrowAnyException();
    }

    @Test
    public void WebP는_RIFF와_WEBP를_둘_다_본다() {
        //given — RIFF + 크기 4바이트 + WEBP. 가운데 4바이트는 건너뛴다
        byte[] webp = {0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50};
        byte[] riffOnly = {0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20};  // AVI

        //when //then — RIFF만 보고 통과시키면 AVI·WAV가 새어 들어온다
        assertThatCode(() -> validator.validateStored(12, MAX, webp, "image/webp"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validateStored(12, MAX, riffOnly, "image/webp"))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 확장자만_이미지인_파일은_거부한다() {
        //given — .jpg 이름표를 단 HTML
        byte[] html = "<html><scrip".getBytes();

        //when //then
        assertThatThrownBy(() -> validator.validateStored(12, MAX, html, "image/jpeg"))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("이미지 파일이 아닙니다");
    }

    @Test
    public void 형식이_서로_어긋나면_거부한다() {
        //given — PNG 바이트인데 jpg로 올린 경우
        byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};

        //when //then
        assertThatThrownBy(() -> validator.validateStored(12, MAX, png, "image/jpeg"))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 헤더가_모자라면_거부한다() {
        //given — 2바이트짜리 파일. 배열 범위를 넘기며 터지면 안 된다
        byte[] tooShort = {(byte) 0xFF, (byte) 0xD8};

        //when //then
        assertThatThrownBy(() -> validator.validateStored(2, MAX, tooShort, "image/jpeg"))
                .isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> validator.validateStored(2, MAX, null, "image/jpeg"))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 빈_파일과_초과_용량을_거부한다() {
        //given
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0, 0, 0, 0, 0, 0, 0, 0, 0};

        //when //then
        assertThatThrownBy(() -> validator.validateStored(0, MAX, jpeg, "image/jpeg"))
                .isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> validator.validateStored(MAX + 1, MAX, jpeg, "image/jpeg"))
                .isInstanceOf(InvalidInputException.class);
    }
}
