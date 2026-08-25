package com.milobeene.starlog.common.repository;

import org.springframework.data.repository.NoRepositoryBean;
import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.Optional;

/**
 * JpaRepository 대신 쓰는 공통 리포지토리. save()가 없다.
 *
 * Repository<T, ID>는 메서드가 하나도 없는 표식용 인터페이스다.
 * 여기 선언한 것만 노출되고, 구현은 스프링이 BaseRepositoryImpl에서 찾아 붙인다.
 * @NoRepositoryBean — 이건 상속용이지 실제 리포지토리가 아니라는 표시.
 * 없으면 스프링이 이것까지 빈으로 만들려다 실패한다.
 */
@NoRepositoryBean
public interface BaseRepository<T, ID> extends Repository<T, ID> {

    Optional<T> findById(ID id);

    List<T> findAll();

    void delete(T entity);

    /**
     * 신규 엔티티 저장. save()를 두지 않는 이유 —
     * SimpleJpaRepository.save()는 내부가 "새 엔티티면 persist, 아니면 merge"라서
     * 준영속 엔티티에 부르면 merge가 돈다 (설계 원칙 5번 위반).
     * 수정은 변경 감지, 벌크는 @Modifying + @Query.
     */
    void persist(T entity);
}
