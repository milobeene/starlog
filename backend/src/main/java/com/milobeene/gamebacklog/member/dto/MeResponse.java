package com.milobeene.gamebacklog.member.dto;

import com.milobeene.gamebacklog.common.dto.MoneyResponse;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.platform.domain.MemberDevice;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import com.milobeene.gamebacklog.subscription.domain.BillingCycle;
import com.milobeene.gamebacklog.subscription.domain.Subscription;

import java.time.LocalDate;
import java.util.List;

/** 프로필 / 설정 화면 (화면 4, API 설계서 §1.4) */
public record MeResponse(
        Profile profile,
        List<PlatformAccountItem> platformAccounts,
        List<DeviceItem> devices,
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

    public record DeviceRef(Long deviceId, String name) {}

    public record PlatformAccountItem(Long accountId, String label, PlatformRef platform) {

        static PlatformAccountItem from(PlatformAccount account) {
            return new PlatformAccountItem(account.getId(), account.getAccountLabel(),
                    new PlatformRef(account.getPlatform().getId(), account.getPlatform().getName()));
        }
    }

    public record DeviceItem(Long memberDeviceId, String label, String memo, DeviceRef device) {

        static DeviceItem from(MemberDevice memberDevice) {
            return new DeviceItem(memberDevice.getId(), memberDevice.getLabel(), memberDevice.getMemo(),
                    new DeviceRef(memberDevice.getDevice().getId(), memberDevice.getDevice().getName()));
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
                                List<PlatformAccount> accounts,
                                List<MemberDevice> devices,
                                List<Subscription> subscriptions) {
        return new MeResponse(
                Profile.from(member),
                accounts.stream().map(PlatformAccountItem::from).toList(),
                devices.stream().map(DeviceItem::from).toList(),
                subscriptions.stream().map(SubscriptionItem::from).toList());
    }
}
