package com.milobeene.starlog.common.web;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 로그인한 회원의 id를 주입받는다.
 *
 * <pre>
 * public PageResponse&lt;...&gt; list(@LoginMember Long memberId) { ... }
 * </pre>
 *
 * 컨트롤러는 이 id가 **어디서 왔는지 모른다.** 지금은 X-Member-Id 헤더고
 * Phase 3에서는 세션이 되는데, 바뀌는 건 리졸버 하나뿐이라 시그니처가 그대로 산다.
 *
 * RetentionPolicy.RUNTIME이어야 하는 이유 — 스프링이 실행 중에 리플렉션으로
 * 파라미터 애노테이션을 읽는다. 기본값(CLASS)이면 런타임에 사라져서 안 보인다
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface LoginMember {
}
