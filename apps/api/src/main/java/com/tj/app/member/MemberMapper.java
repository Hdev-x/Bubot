package com.tj.app.member;

import org.apache.ibatis.annotations.Mapper;

/** ============================================================
 * [클래스 읽기] 회원 DB 접근을 담당하는 MyBatis Mapper 인터페이스.
 *
 * @Mapper → MyBatis가 이 인터페이스를 읽고 구현체를 자동으로 생성한다.
 * 실제 SQL은 같은 디렉토리의 MemberMapper.xml에 id로 연결된다.
 * 메서드 이름 = XML의 id 속성값.
 * ============================================================ */
@Mapper
public interface MemberMapper {

	/** ============================================================
	 * 회원가입. INSERT INTO MEMBER. 성공하면 1 반환.
	 * ============================================================ */
	public int create(MemberDTO memberDTO) throws Exception;

	/** ============================================================
	 * username으로 회원을 조회하고 ROLE 테이블과 JOIN해 권한 정보까지 가져온다.
	 * 이름은 login이지만 실제로는 "회원 + 권한 정보 조회" 역할을 한다.
	 * 로그인 검증(비밀번호 비교)은 Controller에서 직접 수행한다.
	 * ============================================================ */
	public MemberDTO login(MemberDTO memberDTO) throws Exception;

	/** ============================================================
	 * 이름·예수금 수정. UPDATE MEMBER. 성공하면 1 반환.
	 * ============================================================ */
	public int update(MemberDTO memberDTO) throws Exception;

	/** ============================================================
	 * 회원 탈퇴. DELETE FROM MEMBER. 성공하면 1 반환.
	 * ============================================================ */
	public int delete(MemberDTO memberDTO) throws Exception;
}
