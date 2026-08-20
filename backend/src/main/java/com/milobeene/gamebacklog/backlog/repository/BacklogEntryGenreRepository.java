package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntryGenre;
import com.milobeene.gamebacklog.common.repository.BaseRepository;

import java.util.List;

public interface BacklogEntryGenreRepository extends BaseRepository<BacklogEntryGenre, Long> {

    List<BacklogEntryGenre> findByBacklogEntryId(Long backlogEntryId);

    /** 장르를 명시적으로 삭제할 때 연결부터 정리하는 용도 */
    List<BacklogEntryGenre> findByGenreId(Long genreId);
}
