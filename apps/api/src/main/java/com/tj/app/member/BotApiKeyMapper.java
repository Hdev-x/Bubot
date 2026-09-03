package com.tj.app.member;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface BotApiKeyMapper {

    int insert(BotApiKeyDTO dto) throws Exception;

    List<BotApiKeyDTO> selectByMemberId(String memberId) throws Exception;

    BotApiKeyDTO selectByIdAndMemberId(Integer id, String memberId) throws Exception;

    int deleteByIdAndMemberId(Integer id, String memberId) throws Exception;

    /** 같은 회원·거래소·봇슬롯의 모든 키를 비활성화 (active=false) */
    int deactivateByMemberExchangeAndTarget(String memberId, String exchange, String botTarget) throws Exception;

    /** 지정한 키만 활성화 (소유자 확인 포함) */
    int activateByIdAndMemberId(Integer id, String memberId) throws Exception;

    /** 슬롯의 활성 키 1개 (암호화 상태 그대로 반환) — 봇 자격증명 조회용 */
    BotApiKeyDTO selectActiveByMemberExchangeAndTarget(String memberId, String exchange, String botTarget) throws Exception;

    /** 전체 키 (암호화 상태) — 재암호화(키 회전)용 */
    List<BotApiKeyDTO> selectAll() throws Exception;

    /** 암호화 컬럼만 갱신 — 재암호화용 */
    int updateEnc(BotApiKeyDTO dto) throws Exception;
}