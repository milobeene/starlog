package com.milobeene.starlog.member.dto;

import com.milobeene.starlog.common.dto.MoneyResponse;
import com.milobeene.starlog.member.domain.Member;
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
                          boolean googleLinked, boolean hasPassword) {

        static Profile from(Member member) {
            return new Profile(member.getId(), member.getEmail(),
                    member.getNickname(), member.getMemo(),
                    member.getGoogleSubject() != null,
                    member.hasPassword());
        }
    }

    public record PlatformRef(Long platformId, String name) {}

    public record PlatformItem(Long platformId, String name) {

        static PlatformItem from(Platform platform) {
            return new PlatformItem(platform.getId(), platform.getName());
        }
    }

    public record PlatformAccountItem(Long accountId, String label, PlatformRef platform) {

        static PlatformAccountItem from(PlatformAccount account) {
            return new PlatformAccountItem(account.getId(), account.getAccountLabel(),
                    new PlatformRef(account.getPlatform().getId(), account.getPlatform().getName()));
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
