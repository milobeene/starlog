package com.milobeene.starlog.backlog.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Emulator;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_playthrough_sequence",
        columnNames = {"backlog_entry_id", "sequence_no"}))
public class Playthrough extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "backlog_entry_id", nullable = false)
    private BacklogEntry backlogEntry;

    @Column(name = "sequence_no", nullable = false)
    private int sequenceNo;

    @Column(nullable = false)
    private LocalDate startedOn;

    private LocalDate finishedOn;     // null = 진행 중

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private PlaythroughStatus status;

    @Column(length = 100)
    private String label;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id")
    private Device device;

    /**
     * 어디서 했나 (v1.1).
     *
     * 예전에는 계정이나 에뮬레이터만 들고 있어서 "스팀에서 했다"를 적으려면 계정을
     * 반드시 만들어야 했고, 실물 패키지처럼 계정이라는 개념이 없는 경우는 적을 자리가 없었다.
     *
     * ⚠️ **에뮬레이터와 동시에 채워지지 않는다** — 화면의 토글이 하나를 고르게 한다.
     * DB 제약을 안 거는 이유: 기존 데이터에 계정 없이 에뮬만 있는 행이 있고,
     * 그걸 CHECK로 막으면 마이그레이션이 통째로 실패한다
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "platform_id")
    private Platform platform;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "platform_account_id")
    private PlatformAccount platformAccount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emulator_id") //nullable: 에뮬 안 쓴 회차가 대부분
    private Emulator emulator;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "input_method_id")
    private InputMethod inputMethod;

    /**
     * JPA 전용 기본 생성자
     */
    protected Playthrough() {}

    public static Playthrough of(BacklogEntry entry, int sequenceNo, PlaythroughCommand command) {
        Playthrough pt = new Playthrough();
        pt.backlogEntry = entry;
        pt.sequenceNo = sequenceNo;
        pt.apply(command);
        return pt;
    }

    /** 기간·상태·속성 전체 교체 (B-5) */
    public void update(PlaythroughCommand command) {
        apply(command);
    }

    /**
     * 참조 연결. 엔티티는 리포지토리를 모르므로 서비스가 조회해서 넘긴다.
     * 넷 다 회원이 소유한 선택지라 서비스가 소유권까지 확인한 뒤 넘겨준다
     */
    public void assignReferences(Device device, Platform platform, PlatformAccount platformAccount,
                                 Emulator emulator, InputMethod inputMethod) {
        /*
         * ⚠️ **플랫폼과 에뮬은 함께 오지 않는다** (v1.1). 화면의 토글이 하나를 고르게 하지만
         * 서버는 클라이언트를 믿지 않는다 — 둘 다 오면 에뮬 쪽을 버린다.
         * 예외를 던지지 않는 이유: 예전 데이터에는 에뮬만 있는 회차가 있고,
         * 그걸 수정할 때 플랫폼을 새로 고르면 잠깐 둘 다인 상태가 자연스럽게 생긴다
         */
        this.device = device;
        this.platform = platform;
        this.platformAccount = platformAccount;
        this.emulator = platform != null ? null : emulator;
        this.inputMethod = inputMethod;
    }

    /** §7.6의 "최신 회차" 판정 기준 — COALESCE(종료일, 시작일) */
    public LocalDate lastActivityOn() {
        return (finishedOn != null) ? finishedOn : startedOn;
    }

    /**
     * 기간을 아직 안 닫은 회차. BR-PT-03과 겹침 판정의 기준이 상태가 아니라 종료일이다.
     * 종료일을 적은 PAUSED는 시간을 점유하지 않으므로 새 회차를 막지 않는다
     */
    public boolean isOngoing() {
        return finishedOn == null;
    }

    /**
     * BR-PT-02 기간 겹침. 닫힌 구간이라 하루라도 닿으면 겹친 것으로 본다.
     * 진행 중 회차는 종료일이 없으므로 시작일부터 무한대까지 점유한다.
     *
     * ⚠️ **other의 값은 반드시 getter로 읽는다.** 필드로 직접 읽으면(`other.startedOn`)
     * 같은 클래스라 컴파일은 되지만, other가 하이버네이트 **프록시일 때 항상 null이 나온다** —
     * 프록시는 메서드 호출만 가로채고 자기 필드는 채우지 않는다.
     * `BacklogEntry.lastPlaythrough`가 LAZY라 실제로 이 자리에 프록시가 들어온다:
     * findOwned가 프록시를 만들고, 뒤이은 형제 조회가 같은 id의 그 프록시를 그대로 돌려준다
     */
    public boolean overlaps(Playthrough other) {
        LocalDate otherStartedOn = other.getStartedOn();
        LocalDate otherFinishedOn = other.getFinishedOn();
        LocalDate otherOccupiedUntil = (otherFinishedOn != null) ? otherFinishedOn : LocalDate.MAX;

        return !startedOn.isAfter(otherOccupiedUntil)
                && !otherStartedOn.isAfter(this.occupiedUntil());
    }

    /** this 전용이다. 다른 인스턴스에 대고 부르면 위 프록시 함정에 걸린다 */
    private LocalDate occupiedUntil() {
        return (finishedOn != null) ? finishedOn : LocalDate.MAX;
    }

    private void apply(PlaythroughCommand command) {
        LocalDate startedOn = command.startedOn();
        LocalDate finishedOn = command.finishedOn();
        PlaythroughStatus status = command.status();

        if (startedOn == null) {
            throw new InvalidInputException("시작일은 필수입니다");
        }
        if (status == null) {
            throw new InvalidInputException("회차 상태는 필수입니다");
        }
        // BR-PT-01 (BR-PT-04: 당일 완료도 유효하므로 isBefore로 판정)
        if (finishedOn != null && finishedOn.isBefore(startedOn)) {
            throw new InvalidInputException(
                    "종료일은 시작일 이후여야 합니다: " + startedOn + " ~ " + finishedOn);
        }
        // 종료일과 상태의 짝 (불변식 3줄). PAUSED만 양쪽이 다 허용된다
        if (status.mustBeOpen() && finishedOn != null) {
            throw new InvalidInputException(
                    "PLAYING 회차에는 종료일을 둘 수 없습니다. 멈춘 날을 적으려면 PAUSED로 두세요");
        }
        if (status.mustBeClosed() && finishedOn == null) {
            throw new InvalidInputException("종료된(" + status + ") 회차에는 종료일이 필요합니다");
        }

        this.startedOn = startedOn;
        this.finishedOn = finishedOn;
        this.status = status;
        this.label = TextValues.normalize(command.label());
    }
}