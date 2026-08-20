package com.milobeene.gamebacklog.tag.service;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.BacklogEntryGenre;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryGenreRepository;
import com.milobeene.gamebacklog.backlog.service.BacklogEntryFinder;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.tag.domain.Genre;
import com.milobeene.gamebacklog.tag.repository.GenreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 태그와 메커니즘은 같고 용도가 다르다 (§6.7).
 * TagService와 묶지 않은 이유 — 장르에만 마스터 폴백이 있어 대칭이 깨진다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GenreService {

    private final GenreRepository genreRepository;
    private final BacklogEntryGenreRepository backlogEntryGenreRepository;
    private final BacklogEntryFinder entryFinder;

    /** 항목의 개인 장르 전체 교체 (FR-TAG-05) */
    @Transactional
    public void replaceGenres(Long memberId, Long entryId, List<String> names) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);
        Set<String> wanted = normalizeNames(names);

        List<BacklogEntryGenre> existing = backlogEntryGenreRepository.findByBacklogEntryId(entryId);

        // 뗄 것 — 연결만 지운다. 사전 행은 조회에서 거른다 (§6.7 v1.5)
        existing.stream()
                .filter(link -> !wanted.contains(link.getGenre().getName()))
                .forEach(link -> {
                    backlogEntryGenreRepository.delete(link);
                    entry.removeGenreLink(link);
                });

        Set<String> current = existing.stream()
                .map(link -> link.getGenre().getName())
                .collect(Collectors.toSet());

        wanted.stream()
                .filter(name -> !current.contains(name))
                .forEach(name -> {
                    BacklogEntryGenre link =
                            new BacklogEntryGenre(entry, findOrCreate(entry.getMember(), name));
                    backlogEntryGenreRepository.persist(link);
                    // 태그엔 없는 줄. resolvedGenres()가 방금 붙인 장르를 바로 보게 한다
                    entry.addGenreLink(link);
                });
    }

    /** 표시·집계용 장르 — 개인이 있으면 개인, 없으면 마스터 (§6.7 폴백) */
    public List<String> findResolvedGenres(Long memberId, Long entryId) {
        return entryFinder.findOwned(memberId, entryId).resolvedGenres();
    }

    /** 사전 목록. 아무 항목에도 안 붙은 장르는 안 나온다 */
    public List<Genre> findDictionary(Long memberId) {
        return genreRepository.findUsedByMemberId(memberId);
    }

    /** 이름 변경. 같은 이름이 이미 있으면 예외 — 병합하지 않는다 */
    @Transactional
    public void rename(Long memberId, Long genreId, String newName) {
        Genre genre = findOwnedGenre(memberId, genreId);
        String normalized = TextValues.normalize(newName);
        if (normalized == null) {
            throw new IllegalArgumentException("장르 이름은 비울 수 없습니다");
        }

        genreRepository.findByMemberIdAndName(memberId, normalized)
                .filter(other -> !other.getId().equals(genreId))
                .ifPresent(other -> {
                    throw new IllegalStateException("이미 있는 장르 이름입니다: " + normalized);
                });

        genre.rename(normalized);
    }

    /** 장르 삭제 — 연결까지 함께 지운다. Genre는 물리 삭제 대상이다 (§7.4) */
    @Transactional
    public void delete(Long memberId, Long genreId) {
        Genre genre = findOwnedGenre(memberId, genreId);

        backlogEntryGenreRepository.findByGenreId(genreId).forEach(link -> {
            link.getBacklogEntry().removeGenreLink(link);
            backlogEntryGenreRepository.delete(link);
        });

        genreRepository.delete(genre);
    }

    private Genre findOrCreate(Member member, String name) {
        return genreRepository.findByMemberIdAndName(member.getId(), name)
                .orElseGet(() -> {
                    Genre genre = new Genre(member, name);
                    genreRepository.persist(genre);
                    return genre;
                });
    }

    private Genre findOwnedGenre(Long memberId, Long genreId) {
        Genre genre = genreRepository.findById(genreId)
                .orElseThrow(() -> new IllegalArgumentException("장르를 찾을 수 없습니다. id=" + genreId));

        if (!genre.getMember().getId().equals(memberId)) {
            throw new IllegalStateException("내 장르가 아닙니다. id=" + genreId);
        }

        return genre;
    }

    /** LinkedHashSet — 입력 순서를 유지하면서 중복을 제거한다 */
    private Set<String> normalizeNames(List<String> names) {
        if (names == null) {
            return Set.of();
        }
        return names.stream()
                .map(TextValues::normalize)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }
}
