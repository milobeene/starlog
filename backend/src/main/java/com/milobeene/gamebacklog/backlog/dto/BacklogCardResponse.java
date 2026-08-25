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
        LastPlaythrough lastPlaythrough,
        /** 마스터 커버 id (IGDB). 개인 커버가 없을 때의 폴백 (§6.10) */
        String coverImageId
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
                    playthrough.getDevice() == null ? null : playthrough.getDevice().getLabel(),
                    playthrough.getEmulator() == null ? null : playthrough.getEmulator().getName()
            );
        }
    }

    /**
     * 반드시 트랜잭션 안에서 부른다. resolvedGenres()가 LAZY 컬렉션 두 개를 건드린다 —
     * 개인 장르(genreLinks)와 마스터 장르(game.masterGenres).
     * 컬렉션 복사는 엔티티의 resolved*·getter가 책임진다 (BacklogEntry 주석 참고)
     *
     * **커버를 서버가 하나로 합치지 않는 이유** (K-5) — 마스터 커버는 자리마다 크기가 달라야 해서
     * (목록은 t_cover_small, 상세는 t_cover_big_2x) 서버가 URL을 박으면 크기가 고정된다.
     * 개인 URL과 마스터 id를 둘 다 내리고 `개인 ?? 마스터 ?? 기본` 폴백은 화면이 한다 (§6.10).
     *
     * coverUrl을 인자로 받는 이유 — CoverImage는 엔티티에 역방향 필드가 없다.
     * 목록은 entryId를 모아 한 번에 읽고(N+1 차단) 그 결과를 여기로 넘긴다
     */
    public static BacklogCardResponse from(BacklogEntry entry, String coverUrl) {
        return new BacklogCardResponse(
                entry.getId(),
                coverUrl,
                entry.getDisplayName(),
                entry.resolvedGenres(),
                entry.getRating(),
                entry.getStatus(),
                LastPlaythrough.from(entry.getLastPlaythrough()),
                entry.getGame().getCoverImageId()
        );
    }
}
