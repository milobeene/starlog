package com.milobeene.starlog.tag.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.service.BacklogEntryFinder;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.tag.domain.Tag;
import com.milobeene.starlog.tag.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TagService {

    private final TagRepository tagRepository;
    private final BacklogEntryRepository backlogEntryRepository;
    private final BacklogEntryFinder entryFinder;

    /**
     * 항목의 태그 교체 (FR-TAG-01). **항목당 하나다** — null·빈 문자열이면 뗀다.
     * 등록 절차가 없다: 목록에 없는 이름은 여기서 만들어진다 (§6.7 사전 메커니즘)
     */
    @Transactional
    public void changeTag(Long memberId, Long entryId, String name) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);
        String normalized = TextValues.normalize(name);

        // 뗄 때 사전 행은 안 지운다. 연결이 0인 태그는 조회에서 걸러진다 (§6.7 v1.5)
        entry.changeTag(normalized == null ? null : findOrCreate(entry.getMember(), normalized));
    }

    /** 이 항목에 붙은 태그 이름. 없으면 null */
    public String findTagName(Long memberId, Long entryId) {
        Tag tag = entryFinder.findOwned(memberId, entryId).getTag();
        return tag == null ? null : tag.getName();
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
            throw new InvalidInputException("태그 이름은 비울 수 없습니다");
        }

        tagRepository.findByMemberIdAndName(memberId, normalized)
                .filter(other -> !other.getId().equals(tagId))
                .ifPresent(other -> {
                    throw new ConflictException("이미 있는 태그 이름입니다: " + normalized);
                });

        tag.rename(normalized);
    }

    /** 태그 삭제 (FR-TAG-02) — 붙어 있던 항목에서도 떨어진다. Tag는 물리 삭제 대상이다 (§7.4) */
    @Transactional
    public void delete(Long memberId, Long tagId) {
        findOwnedTag(memberId, tagId);   // 소유 검증만. 아래에서 컨텍스트가 비워지므로 참조는 안 들고 간다

        // FK가 backlog_entry에 직접 있으므로 붙어 있는 항목부터 떼야 Tag를 지울 수 있다
        backlogEntryRepository.clearTag(tagId, LocalDateTime.now());

        // 다시 읽는 이유 — clearTag가 clearAutomatically로 영속성 컨텍스트를 통째로 비운다.
        // 위에서 잡아둔 Tag는 그 순간 준영속이 되고, 준영속 엔티티에 delete()를 부르면
        // 스프링이 remove 전에 merge를 돌린다 (설계 원칙 5번 위반)
        tagRepository.findById(tagId).ifPresent(tagRepository::delete);
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
                .orElseThrow(() -> new NotFoundException("태그를 찾을 수 없습니다. id=" + tagId));

        // 태그는 회원 소유다 (§6.7). 남의 것은 없는 것처럼 답한다
        if (!tag.getMember().getId().equals(memberId)) {
            throw new NotFoundException("태그를 찾을 수 없습니다. id=" + tagId);
        }

        return tag;
    }
}
