package com.milobeene.gamebacklog.platform.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.service.MemberService;
import com.milobeene.gamebacklog.platform.domain.Device;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DeviceServiceTest {

    @Autowired DeviceService deviceService;
    @Autowired MemberService memberService;
    @Autowired EntityManager em;

    private Long memberId;

    @BeforeEach
    void setUp() {
        memberId = saveMember("test@example.com").getId();
    }

    @Test
    public void 기기를_유형과_라벨로_등록한다() {
        //when — 마스터에서 고르는 게 아니라 직접 적는다
        deviceService.register(memberId, "  Windows PC  ", "  한성컴퓨터 조립 PC  ", "  RTX 4070  ");

        em.flush();
        em.clear();

        //then
        Device found = deviceService.findSelectable(memberId).get(0);
        assertThat(found.getDeviceType()).isEqualTo("Windows PC");
        assertThat(found.getLabel()).isEqualTo("한성컴퓨터 조립 PC");
        assertThat(found.getMemo()).isEqualTo("RTX 4070");
    }

    @Test
    public void 같은_기종을_라벨만_다르게_여러_대_등록할_수_있다() {
        //when — 유니크가 (member, label)이라 기종이 겹쳐도 된다
        deviceService.register(memberId, "Nintendo Switch", "거실용", null);
        deviceService.register(memberId, "Nintendo Switch", "휴대용", null);

        em.flush();
        em.clear();

        //then
        assertThat(deviceService.findSelectable(memberId))
                .extracting(Device::getLabel)
                .containsExactly("거실용", "휴대용");
    }

    @Test
    public void 선택지_이름에_기종이_함께_붙는다() {
        //given — 라벨만으로는 어떤 기종인지 모른다
        deviceService.register(memberId, "Nintendo Switch", "거실용", null);
        deviceService.register(memberId, "Windows PC", "Windows PC", null);

        em.flush();
        em.clear();

        //then — 라벨과 기종이 같으면 반복하지 않는다
        assertThat(deviceService.findSelectable(memberId))
                .extracting(Device::optionLabel)
                .containsExactly("Windows PC", "거실용 (Nintendo Switch)");
    }

    @Test
    public void 같은_라벨로_다시_등록하면_예외가_발생한다() {
        //given
        deviceService.register(memberId, "Windows PC", "메인", null);

        //when & then
        assertThatThrownBy(() -> deviceService.register(memberId, "Windows PC", "메인", null))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 라벨을_비우면_예외가_발생한다() {
        //given — 라벨이 기기의 정체성이라 빈 값을 허용하지 않는다
        //when & then
        assertThatThrownBy(() -> deviceService.register(memberId, "Windows PC", "   ", null))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 다른_기기와_같은_라벨로_수정하면_예외가_발생한다() {
        //given
        deviceService.register(memberId, "Nintendo Switch", "거실용", null);
        Long target = deviceService.register(memberId, "Nintendo Switch", "휴대용", null);

        //when & then — register와 같은 검증
        assertThatThrownBy(() ->
                deviceService.update(memberId, target, "Nintendo Switch", "거실용", null))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("이미 있는 기기");
    }

    @Test
    public void 기기는_소프트_삭제된다() {
        //given — 회차가 이 기기를 직접 가리키므로 지우면 과거 기록이 빈다 (§7.4)
        Long deviceId = deviceService.register(memberId, "Windows PC", "메인", null);

        //when
        deviceService.delete(memberId, deviceId);

        em.flush();
        em.clear();

        //then — 선택지에서만 빠지고 행은 남는다
        assertThat(deviceService.findSelectable(memberId)).isEmpty();
        assertThat(deviceService.findOne(memberId, deviceId).isDeleted()).isTrue();
    }

    @Test
    public void 지웠던_라벨을_다시_등록하면_되살아난다() {
        //given — 유니크가 삭제된 행까지 포함하므로 새로 만들 수 없다.
        // 사용자가 기대하는 것도 "예전 기기가 돌아오는 것"이다 (과거 회차의 링크가 살아난다)
        Long deviceId = deviceService.register(memberId, "Windows PC", "메인", null);
        deviceService.delete(memberId, deviceId);

        //when
        Long revivedId = deviceService.register(memberId, "Windows PC", "메인", "새 메모");

        em.flush();
        em.clear();

        //then
        assertThat(revivedId).isEqualTo(deviceId);
        assertThat(deviceService.findOne(memberId, deviceId).getMemo()).isEqualTo("새 메모");
    }

    @Test
    public void 남의_기기는_보이지도_고쳐지지도_않는다() {
        //given — 404로 뭉갠다. 403을 주면 "그 id는 존재한다"가 새어나간다 (NFR-S7)
        Long otherId = saveMember("other@example.com").getId();
        Long othersDevice = deviceService.register(otherId, "Windows PC", "남의 PC", null);

        //when & then
        assertThatThrownBy(() -> deviceService.update(memberId, othersDevice, "PC", "내 것", null))
                .isInstanceOf(NotFoundException.class);
        assertThat(deviceService.findSelectable(memberId)).isEmpty();
    }

    @Test
    public void 프로필을_수정할_수_있다() {
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
        //when & then
        assertThatThrownBy(() -> memberService.updateProfile(memberId, "   ", null))
                .isInstanceOf(InvalidInputException.class);
    }

    // ── 헬퍼

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        em.flush();
        return member;
    }
}
