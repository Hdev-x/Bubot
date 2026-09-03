package com.tj.app.member;

import org.springframework.validation.BindingResult;

/** ============================================================
 * [클래스 읽기] 회원 비즈니스 로직 인터페이스.
 *
 * 인터페이스를 두는 이유: Controller는 구현체(MemberServiceImpl)가 아닌
 * 이 인터페이스 타입으로 주입받는다. 나중에 구현체를 교체해도 Controller 코드를 바꿀 필요가 없다.
 * 실제 구현은 MemberServiceImpl에 있다.
 * ============================================================ */
public interface MemberService {

	/** ============================================================
	 * 회원가입 처리. 성공 시 1, 실패 시 0 반환.
	 * ============================================================ */
	public int create(MemberDTO memberDTO) throws Exception;

	/** ============================================================
	 * 회원 정보 수정. 성공 시 1 반환.
	 * ============================================================ */
	public int update(MemberDTO memberDTO) throws Exception;

	/** ============================================================
	 * 회원 탈퇴. 성공 시 1 반환.
	 * ============================================================ */
	public int delete(MemberDTO memberDTO) throws Exception;

	/** ============================================================
	 * username으로 회원 정보(+권한)를 조회해 반환.
	 * ============================================================ */
	public MemberDTO read(MemberDTO memberDTO) throws Exception;

	/** ============================================================
	 * 회원가입 유효성 검증 (중복 ID, 비밀번호 확인 등).
	 * @param bindingResult 폼 바인딩 오류를 담는 객체. 오류 발생 시 여기에 기록한다.
	 * @return true → 검증 실패(가입 불가), false → 검증 통과(가입 가능)
	 * ============================================================ */
	public boolean doubleCheck(MemberDTO memberDTO, BindingResult bindingResult) throws Exception;
}
