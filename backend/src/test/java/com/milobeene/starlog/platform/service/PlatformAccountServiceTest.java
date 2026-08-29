package com.milobeene.starlog.platform.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.platform.exception.RevivableAccountException;
import com.milobeene.starlog.platform.repository.PlatformRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PlatformAccountServiceTest {

    @Autowired PlatformAccountService platformAccountService;
    @Autowired PlatformRepository platformRepository;
    @Autowired EntityManager em;

    private Long memberId;

    @Test
    public void 같은_플랫폼에_계정을_여러_개_등록할_수_있다() {
        //given — FR-PLT-02. 유니크가 (member, platform, label)이라 라벨만 다르면 된다
        Platform steam = givenPlatform("Steam");

        //when
        platformAccountService.register(memberId, steam.getId(), null, "본계정");
        platformAccountService.register(memberId, steam.getId(), null, "부계정");

        em.flush();
        em.clear();

        //then
        assertThat(platformAccountService.findSelectable(memberId))
                .extracting(PlatformAccount::getAccountLabel)
                .containsExactly("본계정", "부계정");
    }

    @Test
    public void 같은_라벨을_다시_등록하면_예외가_발생한다() {
        //given
        Platform steam = givenPlatform("Steam");
        platformAccountService.register(memberId, steam.getId(), null, "본계정");

        //when & then
        assertThatThrownBy(() -> platformAccountService.register(memberId, steam.getId(), null, "본계정"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 삭제해도_행은_남고_선택지에서만_빠진다() {
        //given — 회차·취득이 참조하므로 보존한다 (§6.5)
        Platform steam = givenPlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");

        //when
        platformAccountService.delete(memberId, accountId);

        em.flush();
        em.clear();

        //then — 선택지에는 안 나오지만 findOne으로는 여전히 보인다
        assertThat(platformAccountService.findSelectable(memberId)).isEmpty();

        PlatformAccount found = platformAccountService.findOne(memberId, accountId);
        assertThat(found.isDeleted()).isTrue();
        assertThat(found.getAccountLabel()).isEqualTo("본계정");
    }

    @Test
    public void 삭제된_라벨을_다시_등록하면_되살리기_안내가_온다() {
        //given
        Platform steam = givenPlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");
        platformAccountService.delete(memberId, accountId);

        //when & then — 삭제된 행도 유니크에 걸리므로 A-5와 같은 3분기 (§7.4)
        assertThatThrownBy(() -> platformAccountService.register(memberId, steam.getId(), null, "본계정"))
                .isInstanceOf(RevivableAccountException.class)
                .extracting(e -> ((RevivableAccountException) e).getAccountId())
                .isEqualTo(accountId);
    }

    @Test
    public void 되살리면_다시_선택지에_나온다() {
        //given
        Platform steam = givenPlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");
        platformAccountService.delete(memberId, accountId);

        //when
        platformAccountService.revive(memberId, accountId);

        em.flush();
        em.clear();

        //then
        assertThat(platformAccountService.findSelectable(memberId))
                .extracting(PlatformAccount::getAccountLabel)
                .containsExactly("본계정");
    }

    @Test
    public void 라벨을_변경할_수_있다() {
        //given
        Platform steam = givenPlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");

        //when
        platformAccountService.rename(memberId, accountId, "  메인계정  ");

        em.flush();
        em.clear();

        //then
        assertThat(platformAccountService.findOne(memberId, accountId).getAccountLabel())
                .isEqualTo("메인계정");
    }

    @Test
    public void 이미_있는_라벨로_변경하면_예외가_발생한다() {
        //given
        Platform steam = givenPlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");
        platformAccountService.register(memberId, steam.getId(), null, "부계정");

        //when & then
        assertThatThrownBy(() -> platformAccountService.rename(memberId, accountId, "부계정"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("이미 있는 계정 라벨");
    }

    @Test
    public void 삭제된_계정은_수정할_수_없다() {
        //given
        Platform steam = givenPlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");
        platformAccountService.delete(memberId, accountId);

        //when & then
        assertThatThrownBy(() -> platformAccountService.rename(memberId, accountId, "메인계정"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 남의_계정은_건드릴_수_없다() {
        //given
        Platform steam = givenPlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");
        Member stranger = saveMember("stranger@example.com");

        //when & then
        assertThatThrownBy(() -> platformAccountService.delete(stranger.getId(), accountId))
                .isInstanceOf(NotFoundException.class);   // 남의 것은 404
    }

    // ── 헬퍼

    private Platform givenPlatform(String name) {
        memberId = saveMember("test@example.com").getId();
        Platform platform = new Platform(em.getReference(Member.class, memberId), name);
        platformRepository.persist(platform);
        return platform;
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }
}
