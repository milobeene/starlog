package com.milobeene.starlog.member.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.common.exception.InvalidInputException;
import org.junit.jupiter.api.Test;

/**
 * 배경 팔레트 검증 (엔티티 단위).
 *
 * 스프링을 안 띄운다 — 규칙이 엔티티 안에 있어서 컨테이너가 필요 없다.
 * **이 값은 그대로 셰이더 uniform이 된다** — 잘못된 문자열이 새면 화면이 검게 죽으므로
 * 컨트롤러의 @Pattern과 별개로 여기서도 막는다 (검증 두 겹)
 */
class MemberPaletteTest {

    private static final String VALID = "#E8975A,#F7D6A0,#9BAAB8,#7A9448,#1E262B";

    @Test
    public void 색_다섯_개면_저장된다() {
        //given
        Member member = newMember();

        //when
        member.changeBackgroundColors(VALID);

        //then
        assertThat(member.getBackgroundColors()).isEqualTo(VALID);
    }

    @Test
    public void 소문자로_넣어도_대문자로_통일된다() {
        //given — 프론트의 input[type=color]는 소문자로 준다. 저장 형태가 갈리면 비교가 어긋난다
        Member member = newMember();

        //when
        member.changeBackgroundColors("#e8975a,#f7d6a0,#9baab8,#7a9448,#1e262b");

        //then
        assertThat(member.getBackgroundColors()).isEqualTo(VALID);
    }

    @Test
    public void null이면_기본_팔레트로_돌아간다() {
        //given
        Member member = newMember();
        member.changeBackgroundColors(VALID);

        //when
        member.changeBackgroundColors(null);

        //then — 빈 문자열이 아니라 null이어야 한다. "기본값을 따른다"와 "비었다"는 다른 뜻이다
        assertThat(member.getBackgroundColors()).isNull();
    }

    @Test
    public void 공백만_있으면_null과_같이_다룬다() {
        //given — 화면의 "기본값으로"가 빈 문자열을 보낸다
        Member member = newMember();
        member.changeBackgroundColors(VALID);

        //when
        member.changeBackgroundColors("   ");

        //then
        assertThat(member.getBackgroundColors()).isNull();
    }

    @Test
    public void 개수가_모자라면_거부한다() {
        //given
        Member member = newMember();

        //when //then
        assertThatThrownBy(() -> member.changeBackgroundColors("#E8975A,#F7D6A0"))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void hex가_아니면_거부한다() {
        //given — 여기가 진짜 이유다. 셰이더에 들어갈 수 없는 값을 막는다
        Member member = newMember();

        //when //then
        assertThatThrownBy(() -> member.changeBackgroundColors(
                "red,#F7D6A0,#9BAAB8,#7A9448,#1E262B"))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 여섯_개면_거부한다() {
        //given
        Member member = newMember();

        //when //then
        assertThatThrownBy(() -> member.changeBackgroundColors(VALID + ",#000000"))
                .isInstanceOf(InvalidInputException.class);
    }

    private Member newMember() {
        return Member.signUpWithEmail("palette@example.com", "encoded", "밀로");
    }
}
