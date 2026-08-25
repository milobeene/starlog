package com.milobeene.starlog.common.repository;

import jakarta.persistence.EntityManager;
import org.springframework.data.jpa.repository.support.JpaEntityInformation;
import org.springframework.data.jpa.repository.support.SimpleJpaRepository;

/**
 * 모든 리포지토리의 구현 본체. 스프링이 리포지토리 프록시를 만들 때 이걸 쓴다.
 *
 * SimpleJpaRepository를 상속하므로 내부적으로 save()를 가지고 있지만,
 * BaseRepository 인터페이스가 그걸 선언하지 않으므로 바깥에서는 부를 수 없다.
 * merge 차단은 "구현에 없어서"가 아니라 "타입에 안 보여서" 성립한다.
 */
public class BaseRepositoryImpl<T, ID> extends SimpleJpaRepository<T, ID>
        implements BaseRepository<T, ID> {

    private final EntityManager em;

    public BaseRepositoryImpl(JpaEntityInformation<T, ?> entityInformation, EntityManager em) {
        super(entityInformation, em);
        this.em = em;
    }

    @Override
    public void persist(T entity) {
        em.persist(entity);
    }
}
