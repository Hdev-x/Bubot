package com.tj.app.common.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 현재 인증된 사용자 정보 조회 유틸.
 * 여러 컨트롤러에 복붙돼 있던 getCurrentUsername()을 단일 소스로 통합한다.
 * 인증 방식이 바뀌면 이 한 곳만 고치면 된다.
 */
public final class CurrentUser {

    private CurrentUser() {}

    /** 현재 로그인 사용자명(memberId). 인증 정보가 없으면 예외(fail-fast). */
    public static String username() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) throw new RuntimeException("인증 정보 없음");
        return auth.getName();
    }
}
