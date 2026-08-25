package com.milobeene.starlog.auth.security;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.domain.MemberRole;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.Objects;

/**
 * 시큐리티가 이해하는 "현재 사용자" 표현. 세션에 들어가는 게 이 객체다.
 *
 * 엔티티(Member)를 그대로 넣지 않는 이유 — 세션에 직렬화되어 오래 남는데,
 * 그 안의 값이 DB와 어긋난 채 살아있게 된다. 필요한 최소 정보만 복사한다.
 */
@Getter
public class MemberPrincipal implements UserDetails {

    private final Long memberId;
    private final String email;
    private final String password;
    private final Collection<? extends GrantedAuthority> authorities;
    private final boolean active;
    private final boolean emailVerified;
    private final boolean approved;
    private final MemberRole role;

    private MemberPrincipal(Long memberId, String email, String password,
                            Collection<? extends GrantedAuthority> authorities,
                            boolean active, boolean emailVerified, boolean approved,
                            MemberRole role) {
        this.memberId = memberId;
        this.email = email;
        this.password = password;
        this.authorities = authorities;
        this.active = active;
        this.emailVerified = emailVerified;
        this.approved = approved;
        this.role = role;
    }

    public static MemberPrincipal from(Member member) {
        return new MemberPrincipal(
                member.getId(),
                member.getEmail(),
                // 소셜 전용 계정은 비밀번호가 null이다. 빈 문자열이면 어떤 입력과도 안 맞아 로그인만 실패한다
                Objects.requireNonNullElse(member.getPassword(), ""),
                authoritiesOf(member),
                // isEnabled()와는 다른 값이다 — 인증은 통과시키되 "유예 중"임을 응답에 알려야 한다
                member.getDeletedAt() == null,
                member.isEmailVerified(),
                // 승인 대기도 emailVerified와 같은 취급이다 — 인증은 통과, 로그인 핸들러가 끊는다
                member.isApproved(),
                member.getRole());
    }

    /**
     * 탈퇴 유예 중이면 **권한만** 바꾼다 (FR-AUTH-10 — 인증은 통과, 인가는 제한).
     * 시큐리티 관례상 권한 이름에는 ROLE_ 접두어가 붙는다. hasRole("ADMIN")이 자동으로 붙여 비교한다.
     */
    private static Collection<? extends GrantedAuthority> authoritiesOf(Member member) {
        String role = member.getDeletedAt() != null
                ? "PENDING_DELETION"
                : member.getRole().name();
        return List.of(new SimpleGrantedAuthority("ROLE_" + role));
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return password;
    }

    /** 시큐리티가 말하는 username = 로그인 식별자. 우리는 이메일이다 */
    @Override
    public String getUsername() {
        return email;
    }

    /**
     * 항상 true다. 탈퇴 유예 계정도 **인증은 통과해야** 복구 화면으로 유도할 수 있다 (FR-AUTH-10).
     * 이메일 미인증 차단은 여기가 아니라 로그인 성공 핸들러에서 한다 — 계정 존재 노출 때문 (I-4).
     */
    @Override
    public boolean isEnabled() {
        return true;
    }

    /** 탈퇴 유예 중인가 */
    public boolean isWithdrawalPending() {
        return !active;
    }

    /**
     * SessionRegistry가 principal 객체를 **키로** 세션을 묶는다.
     * equals를 안 만들면 같은 회원의 로그인마다 다른 키가 되어
     * "이 회원의 모든 세션"을 찾을 수 없다 (I-5의 전 세션 무효화가 조용히 실패한다).
     */
    @Override
    public boolean equals(Object other) {
        return other instanceof MemberPrincipal principal
                && java.util.Objects.equals(this.memberId, principal.memberId);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hashCode(memberId);
    }
}
