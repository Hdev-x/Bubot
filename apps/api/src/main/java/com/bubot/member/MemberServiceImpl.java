package com.bubot.member;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.validation.BindingResult;

/** ============================================================
 * [클래스 읽기] MemberService 인터페이스의 실제 구현체.
 *
 * @Service → Spring이 이 클래스를 Bean으로 등록한다.
 * Controller에서 @Autowired MemberService로 주입받으면 이 구현체가 들어온다.
 * MemberMapper(DB)에 의존한다.
 * ============================================================ */
@Service
public class MemberServiceImpl implements MemberService {

    @Autowired
    private MemberMapper memberMapper; // 회원 DB 접근

    @Autowired
    private PasswordEncoder passwordEncoder; // 비밀번호 BCrypt 해시/검증

    /** ============================================================
     * [메서드 읽기] 회원가입 유효성 검증.
     *
     * [실행 흐름]
     * 1. bindingResult.hasErrors() → @Valid 어노테이션이 감지한 기본 폼 오류 확인
     * 2. 비밀번호 일치 여부 확인 (현재 로직 오류 있음 — 아래 주의 참고)
     * 3. ID 중복 확인 → DB 조회 후 이미 있으면 오류 등록
     *
     * @return false = 검증 통과(가입 진행 가능), true = 검증 실패(가입 불가)
     * ============================================================ */
    @Override
    public boolean doubleCheck(MemberDTO memberDTO, BindingResult bindingResult) throws Exception {
        boolean result = false;

        // [실행 흐름] Spring이 자동으로 검사한 폼 오류(@NotNull 등)가 있으면 result = true
        result = bindingResult.hasErrors();

        // [주의] 비밀번호 확인 로직 버그: 같은 필드를 자기 자신과 비교하고 있어 항상 false.
        // passwordCheck 필드가 MemberDTO에 없어서 실질적으로 검증이 동작하지 않는다.
        if (!memberDTO.getPassword().equals(memberDTO.getPassword())) {
            bindingResult.rejectValue("passwordCheck", "member.passwordCheck.notEqual");
            result = true;
        }

        // [실행 흐름] 동일한 username이 DB에 이미 존재하면 오류 등록
        MemberDTO m = memberMapper.login(memberDTO);
        if (m != null) {
            result = true;
            bindingResult.rejectValue("username", "member.idCheck.equal");
        }

        return result;
    }

    /** ============================================================
     * [메서드 읽기] 회원가입 처리.
     *
     * [실행 흐름]
     * 1. MEMBER 테이블에 INSERT (ROLE_NO=2 고정). 모의 코인 지갑 생성은 TPM 잔해 정리에서 제거했다.
     * ============================================================ */
    @Override
    public int create(MemberDTO memberDTO) throws Exception {
        // [보안] 평문 비밀번호를 BCrypt 해시로 변환 후 저장
        memberDTO.setPassword(passwordEncoder.encode(memberDTO.getPassword()));
        return memberMapper.create(memberDTO);
    }

    /** ============================================================
     * [메서드 읽기] username으로 회원 + 권한 정보를 함께 조회.
     * mapper의 login 쿼리(MEMBER + ROLE JOIN)를 사용한다.
     * 이름이 read이지만 내부에서는 login 쿼리를 호출한다.
     * ============================================================ */
    @Override
    public MemberDTO read(MemberDTO memberDTO) throws Exception {
        return memberMapper.login(memberDTO);
    }

    /** ============================================================
     * 이름·예수금 수정. Mapper에 그대로 위임한다.
     * ============================================================ */
    @Override
    public int update(MemberDTO memberDTO) throws Exception {
        return memberMapper.update(memberDTO);
    }

    /** ============================================================
     * 회원 탈퇴. Mapper에 그대로 위임한다.
     * ============================================================ */
    @Override
    public int delete(MemberDTO memberDTO) throws Exception {
        return memberMapper.delete(memberDTO);
    }
}