package com.milobeene.starlog.admin.repository;

import com.milobeene.starlog.admin.domain.AuditLog;
import com.milobeene.starlog.common.repository.BaseRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface AuditLogRepository extends BaseRepository<AuditLog, Long> {

    /**
     * 최신순 목록. `join fetch`로 actor를 같이 끌어온다 — 없으면 행 수만큼 회원 조회가 나간다.
     * ~ToOne 페치 조인은 페이징을 깨지 않는다 (컬렉션이면 얘기가 다르다, §6.8)
     */
    @Query(value = "select l from AuditLog l join fetch l.actor order by l.id desc",
           countQuery = "select count(l) from AuditLog l")
    Page<AuditLog> findPageWithActor(Pageable pageable);

    /** 보존 기간 만료분 정리 (OI-08 — 1년) */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AuditLog l where l.createdAt < :threshold")
    int deleteOlderThan(@Param("threshold") LocalDateTime threshold);
}
