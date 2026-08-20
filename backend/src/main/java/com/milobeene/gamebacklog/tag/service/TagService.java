package com.milobeene.gamebacklog.tag.service;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.BacklogEntryTag;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryTagRepository;
import com.milobeene.gamebacklog.backlog.service.BacklogEntryFinder;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.tag.domain.Tag;
import com.milobeene.gamebacklog.tag.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TagService {

    private final TagRepository tagRepository;
    private final BacklogEntryTagRepository backlogEntryTagRepository;
    private final BacklogEntryFinder entryFinder;

    /**
     * 항목의 태그 전체 교체 (FR-TAG-01).
     * 등록 절차가 없다 — 목록에 없는 이름은 여기서 만들어진다 (§6.7 사전 메커니즘)
     */
    @Transactional
    public void replaceTags(Long memberId, Long entryId, List<String> names) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);
        Set<String> wanted = normalizeNames(names);

        List<BacklogEntryTag> existing = backlogEntryTagRepository.findByBacklogEntryId(entryId);

        // 뗄 것 — 연결만 지운다. 사전 행은 그대로 두고 조회에서 거른다 (§6.7 v1.5)
        existing.stream()
                .filter(link -> !wanted.contains(link.getTag().getName()))
                .forEach(backlogEntryTagRepository::delete);

        // 붙일 것 — 사전에 없으면 만든다
        Set<String> current = existing.stream()
                .map(link -> link.getTag().getName())
                .collect(Collectors.toSet());

        wanted.stream()
                .filter(name -> !current.contains(name))
                .forEach(name -> backlogEntryTagRepository.persist(
                        new BacklogEntryTag(entry, findOrCreate(entry.getMember(), name))));
    }

    /** 이 항목에 붙은 태그 이름들 */
    public List<String> findTagNames(Long memberId, Long entryId) {
        entryFinder.findOwned(memberId, entryId);
        return backlogEntryTagRepository.findByBacklogEntryId(entryId).stream()
                .map(link -> link.getTag().getName())
                .sorted()
                .toList();
    }

    /** 사전 목록 (자동완성·필터 옵션). 아무 항목에도 안 붙은 태그는 안 나온다 */
    public List<Tag> findDictionary(Long memberId) {
        return tagRepository.findUsedByMemberId(memberId);
    }

    /** 이름 변경 (FR-TAG-02). 같은 이름이 이미 있으면 예외 — 병합하지 않는다 */
    @Transactional
    public void rename(Long memberId, Long tagId, String newName) {
        Tag tag = findOwnedTag(memberId, tagId);
        String normalized = TextValues.normalize(newName);
        if (normalized == null) {
            throw new IllegalArgumentException("태그 이름은 비울 수 없습니다");
        }

        tagRepository.findByMemberIdAndName(memberId, normalized)
                .filter(other -> !other.getId().equals(tagId))
                .ifPresent(other -> {
                    throw new IllegalStateException("이미 있는 태그 이름입니다: " + normalized);
                });

        tag.rename(normalized);
    }

    /** 태그 삭제 (FR-TAG-02) — 연결까지 함께 지운다. Tag는 물리 삭제 대상이다 (§7.4) */
    @Transactional
    public void delete(Long memberId, Long tagId) {
        Tag tag = findOwnedTag(memberId, tagId);

        // 연결을 먼저 지운다. 벌크 대신 하나씩 지우는 이유 —
        // 벌크는 영속성 컨텍스트를 우회해서 아래 delete(tag)와 상태가 어긋난다
        backlogEntryTagRepository.findByTagId(tagId)
                .forEach(backlogEntryTagRepository::delete);

        tagRepository.delete(tag);
    }

    private Tag findOrCreate(Member member, String name) {
        return tagRepository.findByMemberIdAndName(member.getId(), name)
                .orElseGet(() -> {
                    Tag tag = new Tag(member, name);
                    tagRepository.persist(tag);
                    return tag;
                });
    }

    private Tag findOwnedTag(Long memberId, Long tagId) {
        Tag tag = tagRepository.findById(tagId)
                .orElseThrow(() -> new IllegalArgumentException("태그를 찾을 수 없습니다. id=" + tagId));

        // 태그는 회원 소유다. 다른 회원과 공유하지 않는다 (§6.7)
        if (!tag.getMember().getId().equals(memberId)) {
            throw new IllegalStateException("내 태그가 아닙니다. id=" + tagId);
        }

        return tag;
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
