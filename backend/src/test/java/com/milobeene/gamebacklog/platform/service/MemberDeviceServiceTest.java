package com.milobeene.gamebacklog.platform.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.service.MemberService;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.MemberDevice;
import com.milobeene.gamebacklog.platform.repository.DeviceRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class MemberDeviceServiceTest {

    @Autowired MemberDeviceService memberDeviceService;
    @Autowired MemberService memberService;
    @Autowired DeviceRepository deviceRepository;
    @Autowired EntityManager em;

    private Long memberId;

    @Test
    public void 보유_기기를_등록할_수_있다() {
        //given
        Device pc = givenDevice("Windows PC");

        //when
        memberDeviceService.register(memberId, pc.getId(), "한성컴퓨터 조립 PC", "  RTX 4070  ");

        em.flush();
        em.clear();

        //then
        MemberDevice found = memberDeviceService.findAll(memberId).get(0);
        assertThat(found.getLabel()).isEqualTo("한성컴퓨터 조립 PC");
        assertThat(found.getMemo()).isEqualTo("RTX 4070");
    }

    @Test
    public void 같은_기종을_라벨만_다르게_여러_대_등록할_수_있다() {
        //given — 유니크가 (member, device, label)
        Device switchDevice = givenDevice("Nintendo Switch");

        //when
        memberDeviceService.register(memberId, switchDevice.getId(), "거실용", null);
        memberDeviceService.register(memberId, switchDevice.getId(), "휴대용", null);

        em.flush();
        em.clear();

        //then
        assertThat(memberDeviceService.findAll(memberId))
                .extracting(MemberDevice::getLabel)
                .containsExactly("거실용", "휴대용");
    }

    @Test
    public void 같은_라벨로_다시_등록하면_예외가_발생한다() {
        //given
        Device pc = givenDevice("Windows PC");
        memberDeviceService.register(memberId, pc.getId(), "메인", null);

        //when & then
        assertThatThrownBy(() -> memberDeviceService.register(memberId, pc.getId(), "메인", null))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    public void 라벨을_비우면_빈_문자열로_수렴한다() {
        //given — 유니크 제약 컬럼이라 null이면 DB가 중복을 못 잡는다
        Device pc = givenDevice("Windows PC");

        //when
        memberDeviceService.register(memberId, pc.getId(), "   ", null);

        em.flush();
        em.clear();

        //then
        assertThat(memberDeviceService.findAll(memberId).get(0).getLabel()).isEqualTo("");
    }

    @Test
    public void 기기는_물리_삭제된다() {
        //given — 회차가 참조하는 건 Device 마스터라 보존할 이유가 없다 (§7.4)
        Device pc = givenDevice("Windows PC");
        Long memberDeviceId = memberDeviceService.register(memberId, pc.getId(), "메인", null);

        //when
        memberDeviceService.delete(memberId, memberDeviceId);

        em.flush();
        em.clear();

        //then
        assertThat(memberDeviceService.findAll(memberId)).isEmpty();
    }

    @Test
    public void 프로필을_수정할_수_있다() {
        //given
        givenDevice("Windows PC");

        //when — FR-AUTH-11의 데이터 부분
        memberService.updateProfile(memberId, "  밀로  ", "  게임 많이 삼  ");

        em.flush();
        em.clear();

        //then
        Member found = memberService.findOne(memberId);
        assertThat(found.getNickname()).isEqualTo("밀로");
        assertThat(found.getMemo()).isEqualTo("게임 많이 삼");
    }

    @Test
    public void 닉네임을_비우면_예외가_발생한다() {
        //given
        givenDevice("Windows PC");

        //when & then
        assertThatThrownBy(() -> memberService.updateProfile(memberId, "   ", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ── 헬퍼

    private Device givenDevice(String name) {
        memberId = saveMember("test@example.com").getId();
        Device device = Device.of(name);
        deviceRepository.persist(device);
        return device;
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }
}
