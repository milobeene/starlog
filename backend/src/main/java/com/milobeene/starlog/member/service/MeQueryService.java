package com.milobeene.starlog.member.service;

import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.dto.MeResponse;
import com.milobeene.starlog.member.dto.OptionsResponse;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.service.DeviceService;
import com.milobeene.starlog.platform.service.EmulatorService;
import com.milobeene.starlog.platform.service.InputMethodService;
import com.milobeene.starlog.platform.service.PlatformAccountService;
import com.milobeene.starlog.platform.service.PlatformService;
import com.milobeene.starlog.subscription.repository.SubscriptionRepository;
import com.milobeene.starlog.tag.domain.Genre;
import com.milobeene.starlog.tag.domain.Tag;
import com.milobeene.starlog.tag.repository.GenreRepository;
import com.milobeene.starlog.tag.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 화면 4(프로필·설정)와 편집 폼 선택지의 조회 전용 서비스.
 *
 * 여러 피처의 서비스를 가로질러 쓴다. 패키지 바이 피처 위반이 아니라
 * API 설계서 §0이 정한 "조합 지점은 화면 단위 조회 전용 서비스"다 —
 * 화면 하나가 여섯 도메인을 걸치는데 리소스별로 쪼개면 호출이 폭발한다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MeQueryService {

    private final MemberRepository memberRepository;
    private final PlatformService platformService;
    private final PlatformAccountService platformAccountService;
    private final DeviceService deviceService;
    private final EmulatorService emulatorService;
    private final InputMethodService inputMethodService;
    private final SubscriptionRepository subscriptionRepository;
    private final TagRepository tagRepository;
    private final GenreRepository genreRepository;

    public MeResponse findMe(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));

        return MeResponse.of(
                member,
                platformService.findSelectable(memberId),
                platformAccountService.findSelectable(memberId),
                deviceService.findSelectable(memberId),
                emulatorService.findSelectable(memberId),
                inputMethodService.findSelectable(memberId),
                subscriptionRepository.findByMemberIdOrderByStartedOnDesc(memberId));
    }

    /**
     * 선택지 여섯 종은 삭제 안 된 내 것만, 사전 둘은 이름만.
     * 태그·장르 사전은 어느 항목에도 안 붙었으면 안 나온다 (§6.7 자동 소멸)
     */
    public OptionsResponse findOptions(Long memberId) {
        return new OptionsResponse(
                platformService.findSelectable(memberId).stream()
                        .map(p -> new OptionsResponse.Ref(p.getId(), p.getName())).toList(),
                // 기기만 이름을 합성한다 — 라벨("거실 스위치")만으로는 어떤 기종인지 모른다
                deviceService.findSelectable(memberId).stream()
                        .map(d -> new OptionsResponse.Ref(d.getId(), d.optionLabel())).toList(),
                emulatorService.findSelectable(memberId).stream()
                        .map(e -> new OptionsResponse.Ref(e.getId(), e.getName())).toList(),
                inputMethodService.findSelectable(memberId).stream()
                        .map(i -> new OptionsResponse.Ref(i.getId(), i.getName())).toList(),
                // 계정만 소속 플랫폼을 함께 싣는다 — 라벨이 겹쳐도 화면이 구별할 수 있게
                platformAccountService.findSelectable(memberId).stream()
                        .map(a -> new OptionsResponse.AccountRef(
                                a.getId(), a.getAccountLabel(),
                                a.getPlatform().getId(), a.getPlatform().getName())).toList(),
                subscriptionRepository.findByMemberIdOrderByStartedOnDesc(memberId).stream()
                        .map(s -> new OptionsResponse.Ref(s.getId(), s.getServiceName())).toList(),
                tagRepository.findUsedByMemberId(memberId).stream().map(Tag::getName).toList(),
                genreRepository.findUsedByMemberId(memberId).stream().map(Genre::getName).toList());
    }
}
