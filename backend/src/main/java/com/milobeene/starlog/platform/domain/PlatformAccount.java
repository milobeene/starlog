package com.milobeene.starlog.platform.domain;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.domain.MemberOwnedEntity;
import jakarta.persistence.*;
import lombok.Getter;

/**
 * 플랫폼 계정 (FR-PLT-01, 02).
 *
 * 플랫폼이 있어야 존재할 수 있는 유일한 선택지다 — 나머지 넷은 이름만 있으면 선다.
 * 플랫폼 이름이 바뀌면 여기도 따라 바뀐다 (FK라 이름을 복사해두지 않았다)
 */
@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_platform_account",
        columnNames = {"member_id", "owner_key", "account_label"}))
public class PlatformAccount extends MemberOwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /*
     * ⚠️ **플랫폼과 에뮬레이터 중 하나만 채워진다** (v1.1). 에뮬레이터에도 계정이 있는
     * 경우가 있어서(닌텐도 계정을 넣고 쓰는 식) 자리를 열었다.
     * 둘 다이거나 둘 다 아닌 상태는 DB의 CHECK가 막는다 — 여기 검증은 최선 노력이다
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "platform_id")
    private Platform platform;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emulator_id")
    private Emulator emulator;

    /**
     * 유니크 제약용 소유자 키 — `P12` 또는 `E3`.
     *
     * ⚠️ **nullable 컬럼으로는 유니크를 못 건다.** PostgreSQL도 H2도 NULL을 서로 다른
     * 값으로 보기 때문에 같은 (플랫폼, 라벨)이 두 번 들어간다. 부분 유니크 인덱스는
     * H2가 지원하지 않아 dev/prod가 갈린다. 한 칸으로 모으면 **한 제약으로 둘 다 막힌다.**
     *
     * 값 자체는 뜻이 없다 — 오직 제약을 세우기 위한 것이라 밖으로 안 내보낸다
     */
    @Column(name = "owner_key", nullable = false, length = 24)
    private String ownerKey;

    @Column(name = "account_label", nullable = false, length = 50)
    private String accountLabel;

    /**
     * JPA 전용 기본 생성자
     */
    protected PlatformAccount() {}

    private PlatformAccount(Member member, Platform platform, Emulator emulator, String label) {
        super(member);
        if ((platform == null) == (emulator == null)) {
            throw new InvalidInputException("플랫폼이나 에뮬레이터 중 하나만 골라 주세요");
        }
        this.platform = platform;
        this.emulator = emulator;
        this.accountLabel = requireLabel(label);
        this.ownerKey = keyOf(platform, emulator);
    }

    public static PlatformAccount onPlatform(Member member, Platform platform, String label) {
        return new PlatformAccount(member, platform, null, label);
    }

    public static PlatformAccount onEmulator(Member member, Emulator emulator, String label) {
        return new PlatformAccount(member, null, emulator, label);
    }

    /** 소속을 옮긴다. `ownerKey`가 따라가야 유니크가 제 몫을 한다 */
    public void moveTo(Platform platform, Emulator emulator) {
        if ((platform == null) == (emulator == null)) {
            throw new InvalidInputException("플랫폼이나 에뮬레이터 중 하나만 골라 주세요");
        }
        this.platform = platform;
        this.emulator = emulator;
        this.ownerKey = keyOf(platform, emulator);
    }

    /** 화면에 보이는 소속 이름. 플랫폼이든 에뮬이든 하나다 */
    public String ownerName() {
        return platform != null ? platform.getName() : emulator.getName();
    }

    /**
     * 고른 소속의 계정인가 (v1.2).
     *
     * 화면이 소속을 바꿀 때 계정을 비우지만 **서버는 클라이언트를 믿지 않는다** —
     * `platformId=스팀 + platformAccountId=닌텐도계정`이 그대로 저장되면
     * 눈으로는 못 알아채는 모순이 남는다. 프록시라 id만 본다
     */
    public boolean belongsTo(Platform platform, Emulator emulator) {
        Long ownerId = (this.platform != null) ? this.platform.getId() : this.emulator.getId();
        Long askedId = (platform != null) ? platform.getId()
                : (emulator != null) ? emulator.getId() : null;
        return ownerId.equals(askedId);
    }

    /** 소속 키를 밖에서도 만든다 — 서비스가 "이미 있나"를 물을 때 필요하다 */
    public static String ownerKeyOf(Platform platform, Emulator emulator) {
        return keyOf(platform, emulator);
    }

    private static String keyOf(Platform platform, Emulator emulator) {
        return platform != null ? "P" + platform.getId() : "E" + emulator.getId();
    }

    /** 라벨은 표시용 별칭이다. 실제 플랫폼 계정과 연동하지 않는다 (§6.5) */
    public void rename(String accountLabel) {
        this.accountLabel = requireLabel(accountLabel);
    }

    @Override
    public String displayName() {
        return accountLabel;
    }

    private static String requireLabel(String accountLabel) {
        return TextValues.require(accountLabel, "계정 라벨은 비울 수 없습니다");
    }
}
