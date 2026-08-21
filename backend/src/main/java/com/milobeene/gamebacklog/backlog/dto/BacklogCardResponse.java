package com.milobeene.gamebacklog.backlog.dto;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.BacklogStatus;
import com.milobeene.gamebacklog.backlog.domain.Playthrough;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 목록 카드 (화면 1, API 설계서 §1.1).
 *
 * 태그는 일부러 없다 — 카드에 뿌리는 값이 아니라 폴더처럼 묶는 탐색 수단이다 (§6.7)
 */
public record BacklogCardResponse(
        Long entryId,
        String coverUrl,
        String displayName,
        List<String> genres,
        BigDecimal rating,
        BacklogStatus status,
        LastPlaythrough lastPlaythrough
) {

    /** 회차가 0개면 통째로 null이다 */
    public record LastPlaythrough(
            int sequenceNo,
            LocalDate startedOn,
            LocalDate finishedOn,
            String deviceName,
            String emulatorName
    ) {

        static LastPlaythrough from(Playthrough playthrough) {
            if (playthrough == null) {
                return null;
            }
            return new LastPlaythrough(
                    playthrough.getSequenceNo(),
                    playthrough.getStartedOn(),
                    playthrough.getFinishedOn(),
                    playthrough.getDevice() == null ? null : playthrough.getDevice().getName(),
                    playthrough.getEmulator() == null ? null : playthrough.getEmulator().getName()
            );
        }
    }

    /**
     * 반드시 트랜잭션 안에서 부른다. resolvedGenres()가 LAZY 컬렉션 두 개를 건드린다 —
     * 개인 장르(genreLinks)와 마스터 장르(game.masterGenres).
     * 컬렉션 복사는 엔티티의 resolved*·getter가 책임진다 (BacklogEntry 주석 참고)
     *
     * coverUrl이 항상 null인 이유 — CoverImage는 Phase 5(K)에서 업로드 경로가 생긴다.
     * 지금 조인을 붙여도 행이 없다. 기본 이미지 폴백도 K-5에서 채운다
     */
    public static BacklogCardResponse from(BacklogEntry entry) {
        return new BacklogCardResponse(
                entry.getId(),
                null,
                entry.getDisplayName(),
                entry.resolvedGenres(),
                entry.getRating(),
                entry.getStatus(),
                LastPlaythrough.from(entry.getLastPlaythrough())
        );
    }
}
