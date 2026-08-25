package com.milobeene.starlog.auth.security;

import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/**
 * "이메일로 사용자를 찾아오라"는 시큐리티의 요구를 우리 DB에 연결하는 지점.
 *
 * 이 빈이 컨테이너에 있으면 부트의 임시 계정 자동 설정(UserDetailsServiceAutoConfiguration)이
 * 물러난다 — I-1에서 보던 `Using generated security password` 경고가 여기서 사라진다.
 *
 * 비밀번호 대조는 여기서 하지 않는다. DaoAuthenticationProvider가 이 메서드의 반환값과
 * 입력값을 PasswordEncoder로 비교한다 — 역할이 나뉘어 있다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberDetailsService implements UserDetailsService {

    private final MemberRepository memberRepository;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return memberRepository.findByEmail(email.strip().toLowerCase(Locale.ROOT))
                .map(MemberPrincipal::from)
                // 이 예외는 밖으로 안 나간다. 시큐리티가 BadCredentialsException으로 바꿔치기해
                // "없는 계정"과 "비밀번호 틀림"을 구분할 수 없게 만든다 (NFR-S3)
                .orElseThrow(() -> new UsernameNotFoundException("회원을 찾을 수 없습니다"));
    }
}
