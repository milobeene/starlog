package com.milobeene.gamebacklog.backlog.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import jakarta.persistence.*;
import lombok.Getter;

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

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private InputMethod inputMethod;

    /**
     * JPA 전용 기본 생성자
     */
    protected Playthrough() {}

    public static Playthrough start(BacklogEntry entry, int sequenceNo, LocalDate startedOn) {
        Playthrough pt = new Playthrough();
        pt.backlogEntry = entry;
        pt.sequenceNo = sequenceNo;
        pt.startedOn = startedOn;
        pt.status = PlaythroughStatus.PLAYING;
        return pt;
    }
}