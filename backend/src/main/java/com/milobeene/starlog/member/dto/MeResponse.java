package com.milobeene.starlog.member.dto;

import com.milobeene.starlog.common.dto.MoneyResponse;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.domain.MemberRole;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Emulator;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.subscription.domain.BillingCycle;
import com.milobeene.starlog.subscription.domain.Subscription;

import java.time.LocalDate;
import java.util.List;

/**
 * 프로필 / 설정 화면 (화면 4, API 설계서 §1.4).
 *
 * 선택지 다섯 종이 전부 여기 실린다 — 화면 하나에서 다 고칠 수 있어야 하기 때문이다.
 * 삭제된 것은 빠진다
 */
public record MeResponse(
        Profile profile,
        List<PlatformItem> platforms,
        List<PlatformAccountItem> platformAccounts,
        List<DeviceItem> devices,
        List<EmulatorItem> emulators,
        List<InputMethodItem> inputMethods,
        List<SubscriptionItem> subscriptions
) {

    /**
     * `googleLinked`가 필요한 이유 — 화면이 "연결"과 "해제" 중 무엇을 보여줄지 정해야 한다.
     * `googleSubject` 자체를 내리지 않는 건 구글 계정 식별자라 밖에 나갈 값이 아니기 때문
     */
    public record Profile(Long memberId, String email, String nickname, String memo,
                          boolean googleLinked, boolean hasPassword, MemberRole role,
                          List<String> backgroundColors) {

        /**
         * `role`은 화면이 관리자 메뉴를 보일지 정하는 데만 쓴다 — **방어선이 아니다.**
         * /api/admin/** 는 서버가 hasRole("ADMIN")으로 막는다. 여기 값을 조작해도
         * 메뉴가 보일 뿐 호출은 403이다 (AUTH-P2)
         */
        static Profile from(Member member) {
            // **null이면 빈 리스트가 아니라 null로 내린다** — "기본값을 따른다"와
            // "다섯 칸이 비었다"는 다른 뜻이고, 화면은 그 차이로 기본 팔레트를 고른다
            String colors = member.getBackgroundColors();
            return new Profile(member.getId(), member.getEmail(),
                    member.getNickname(), member.getMemo(),
                    member.getGoogleSubject() != null,
                    member.hasPassword(),
                    member.getRole(),
                    colors == null ? null : List.of(colors.split(",")));
        }
    }

    /**
     * 필드명이 `platformId`가 아니라 `id`인 이유 — 프론트가 공통 `NamedRef({id, name})`로 읽고
     * 설정의 계정 수정 다이얼로그가 `edit.platform.id`를 쓴다. `OptionsResponse.Ref`와도 같은 모양이다
     */
    public record PlatformRef(Long id, String name) {}

    public record PlatformItem(Long platformId, String name) {

        static PlatformItem from(Platform platform) {
            return new PlatformItem(platform.getId(), platform.getName());
        }
    }

    /**
     * 계정 하나 (v1.1에서 에뮬레이터도 담는다).
     *
     * `platform`은 플랫폼 계정일 때만, `emulator`는 에뮬 계정일 때만 채워진다 —
     * 화면은 **둘 중 채워진 쪽을 소속으로 그린다**(`(Steam) Beene`).
     * 하나로 합쳐 `owner` 하나만 줄 수도 있지만, 그러면 편집 화면이 "지금 어느 쪽인가"를
     * 되물을 방법이 없어진다 (토글의 초기값을 못 정한다)
     */
    public record PlatformAccountItem(Long accountId, String label,
                                      PlatformRef platform, PlatformRef emulator) {

        static PlatformAccountItem from(PlatformAccount account) {
            return new PlatformAccountItem(
                    account.getId(), account.getAccountLabel(),
                    account.getPlatform() == null ? null
                            : new PlatformRef(account.getPlatform().getId(), account.getPlatform().getName()),
                    account.getEmulator() == null ? null
                            : new PlatformRef(account.getEmulator().getId(), account.getEmulator().getName()));
        }
    }

    /** deviceType은 "Windows PC" 같은 유형, label은 "메인 윈도우" 같은 내 별칭 */
    public record DeviceItem(Long deviceId, String deviceType, String label, String memo) {

        static DeviceItem from(Device device) {
            return new DeviceItem(device.getId(), device.getDeviceType(),
                    device.getLabel(), device.getMemo());
        }
    }

    public record EmulatorItem(Long emulatorId, String name, String memo) {

        static EmulatorItem from(Emulator emulator) {
            return new EmulatorItem(emulator.getId(), emulator.getName(), emulator.getMemo());
        }
    }

    public record InputMethodItem(Long inputMethodId, String name) {

        static InputMethodItem from(InputMethod inputMethod) {
            return new InputMethodItem(inputMethod.getId(), inputMethod.getName());
        }
    }

    public record SubscriptionItem(
            Long subscriptionId,
            String serviceName,
            LocalDate startedOn,
            LocalDate endedOn,
            MoneyResponse fee,
            BillingCycle billingCycle,
            boolean active
    ) {

        static SubscriptionItem from(Subscription subscription) {
            return new SubscriptionItem(subscription.getId(), subscription.getServiceName(),
                    subscription.getStartedOn(), subscription.getEndedOn(),
                    MoneyResponse.from(subscription.getFee()), subscription.getBillingCycle(),
                    subscription.isActive());
        }
    }

    public static MeResponse of(Member member,
                                List<Platform> platforms,
                                List<PlatformAccount> accounts,
                                List<Device> devices,
                                List<Emulator> emulators,
                                List<InputMethod> inputMethods,
                                List<Subscription> subscriptions) {
        return new MeResponse(
                Profile.from(member),
                platforms.stream().map(PlatformItem::from).toList(),
                accounts.stream().map(PlatformAccountItem::from).toList(),
                devices.stream().map(DeviceItem::from).toList(),
                emulators.stream().map(EmulatorItem::from).toList(),
                inputMethods.stream().map(InputMethodItem::from).toList(),
                subscriptions.stream().map(SubscriptionItem::from).toList());
    }
}
