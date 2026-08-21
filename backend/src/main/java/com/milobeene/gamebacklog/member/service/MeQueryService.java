package com.milobeene.gamebacklog.member.service;

import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.dto.MeResponse;
import com.milobeene.gamebacklog.member.dto.OptionsResponse;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.Emulator;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import com.milobeene.gamebacklog.platform.repository.DeviceRepository;
import com.milobeene.gamebacklog.platform.repository.EmulatorRepository;
import com.milobeene.gamebacklog.platform.repository.MemberDeviceRepository;
import com.milobeene.gamebacklog.platform.repository.PlatformAccountRepository;
import com.milobeene.gamebacklog.platform.repository.PlatformRepository;
import com.milobeene.gamebacklog.subscription.domain.Subscription;
import com.milobeene.gamebacklog.subscription.repository.SubscriptionRepository;
import com.milobeene.gamebacklog.tag.domain.Genre;
import com.milobeene.gamebacklog.tag.domain.Tag;
import com.milobeene.gamebacklog.tag.repository.GenreRepository;
import com.milobeene.gamebacklog.tag.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 화면 4(프로필·설정)와 편집 폼 선택지의 조회 전용 서비스.
 *
 * 여러 피처의 리포지토리를 가로질러 쓴다. 패키지 바이 피처 위반이 아니라
 * API 설계서 §0이 정한 "조합 지점은 화면 단위 조회 전용 서비스"다 —
 * 화면 하나가 다섯 도메인을 걸치는데 리소스별로 쪼개면 호출이 폭발한다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MeQueryService {

    private final MemberRepository memberRepository;
    private final PlatformAccountRepository platformAccountRepository;
    private final MemberDeviceRepository memberDeviceRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PlatformRepository platformRepository;
    private final DeviceRepository deviceRepository;
    private final EmulatorRepository emulatorRepository;
    private final TagRepository tagRepository;
    private final GenreRepository genreRepository;

    public MeResponse findMe(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));

        return MeResponse.of(
                member,
                platformAccountRepository.findByMemberIdAndDeletedAtIsNullOrderByAccountLabelAsc(memberId),
                memberDeviceRepository.findByMemberIdOrderByLabelAsc(memberId),
                subscriptionRepository.findByMemberIdOrderByStartedOnDesc(memberId));
    }

    /**
     * 마스터 3종은 전체, 내 것 2종은 고를 수 있는 것만, 사전 2종은 이름만.
     * 태그·장르 사전은 어느 항목에도 안 붙었으면 안 나온다 (§6.7 자동 소멸)
     */
    public OptionsResponse findOptions(Long memberId) {
        return new OptionsResponse(
                platformRepository.findAll().stream()
                        .map(p -> new OptionsResponse.Ref(p.getId(), p.getName())).toList(),
                deviceRepository.findAll().stream()
                        .map(d -> new OptionsResponse.Ref(d.getId(), d.getName())).toList(),
                emulatorRepository.findAll().stream()
                        .map(e -> new OptionsResponse.Ref(e.getId(), e.getName())).toList(),
                platformAccountRepository
                        .findByMemberIdAndDeletedAtIsNullOrderByAccountLabelAsc(memberId).stream()
                        .map(a -> new OptionsResponse.Ref(a.getId(), a.getAccountLabel())).toList(),
                subscriptionRepository.findByMemberIdOrderByStartedOnDesc(memberId).stream()
                        .map(s -> new OptionsResponse.Ref(s.getId(), s.getServiceName())).toList(),
                tagRepository.findUsedByMemberId(memberId).stream().map(Tag::getName).toList(),
                genreRepository.findUsedByMemberId(memberId).stream().map(Genre::getName).toList());
    }
}
