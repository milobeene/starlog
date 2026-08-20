package com.milobeene.gamebacklog.backlog.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.Emulator;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "platform_account_id")
    private PlatformAccount platformAccount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emulator_id") //nullable: 에뮬 안 쓴 회차가 대부분
    private Emulator emulator;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(length = 20)
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
     * 기기는 마스터 전체에서 고를 수 있다 — 보유 기기 목록은 제약이 아니다 (BR-PT-05)
     */
    public void assignReferences(Device device, PlatformAccount platformAccount, Emulator emulator) {
        this.device = device;
        this.platformAccount = platformAccount;
        this.emulator = emulator;
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
     * 진행 중 회차는 종료일이 없으므로 시작일부터 무한대까지 점유한다
     */
    public boolean overlaps(Playthrough other) {
        return !startedOn.isAfter(other.occupiedUntil())
                && !other.startedOn.isAfter(this.occupiedUntil());
    }

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
        this.inputMethod = command.inputMethod();
        this.label = TextValues.normalize(command.label());
    }
}