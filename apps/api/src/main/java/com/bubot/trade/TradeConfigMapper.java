package com.bubot.trade;

import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.util.List;

/**
 * trade_configs CRUD (어노테이션 방식).
 * params 컬럼은 JSONB라 INSERT/UPDATE 시 ::jsonb 캐스팅이 필요하다.
 */
@Mapper
public interface TradeConfigMapper {

    @Select("""
        SELECT id, exchange, symbol, bot_target AS botTarget, strategy, params,
               invest_usdt AS investUsdt, leverage, max_loss_pct AS maxLossPct,
               is_active AS active, status, realized_pnl AS realizedPnl,
               TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI') AS createdAt,
               TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI') AS updatedAt
        FROM trade_configs
        WHERE member_id = #{memberId}
        ORDER BY bot_target, symbol
    """)
    List<TradeConfigDTO> selectByMemberId(String memberId);

    @Select("""
        SELECT id, exchange, symbol, bot_target AS botTarget, strategy, params,
               invest_usdt AS investUsdt, leverage, max_loss_pct AS maxLossPct,
               is_active AS active, status, realized_pnl AS realizedPnl
        FROM trade_configs
        WHERE id = #{id} AND member_id = #{memberId}
    """)
    TradeConfigDTO selectByIdAndMemberId(@Param("id") Integer id, @Param("memberId") String memberId);

    @Insert("""
        INSERT INTO trade_configs (member_id, exchange, symbol, bot_target, strategy, params,
            invest_usdt, leverage, max_loss_pct, is_active, status)
        VALUES (#{memberId}, #{exchange}, #{symbol}, #{botTarget}, #{strategy}, CAST(#{params} AS JSONB),
            #{investUsdt}, #{leverage}, #{maxLossPct}, #{active}, #{status})
    """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(TradeConfigDTO dto);

    @Update("""
        UPDATE trade_configs
        SET bot_target = #{botTarget}, strategy = #{strategy}, params = CAST(#{params} AS JSONB),
            invest_usdt = #{investUsdt}, leverage = #{leverage},
            max_loss_pct = #{maxLossPct}, updated_at = NOW()
        WHERE id = #{id} AND member_id = #{memberId}
    """)
    int updateByIdAndMemberId(TradeConfigDTO dto);

    /** 회원의 활성 설정이 쓰는 봇(키 슬롯) 목록 — 포지션 조회용 */
    @Select("""
        SELECT DISTINCT bot_target FROM trade_configs
        WHERE member_id = #{memberId} AND is_active = true
    """)
    List<String> selectActiveBotTargets(@Param("memberId") String memberId);

    @Update("""
        UPDATE trade_configs
        SET is_active = #{active}, status = #{status}, updated_at = NOW()
        WHERE id = #{id} AND member_id = #{memberId}
    """)
    int setActive(@Param("id") Integer id, @Param("memberId") String memberId,
                  @Param("active") boolean active, @Param("status") String status);

    @Delete("DELETE FROM trade_configs WHERE id = #{id} AND member_id = #{memberId}")
    int deleteByIdAndMemberId(@Param("id") Integer id, @Param("memberId") String memberId);

    /** 전체 활성 설정 (member_id 포함) — trader 통합 워커용 */
    @Select("""
        SELECT id, member_id AS memberId, exchange, symbol, bot_target AS botTarget, strategy, params,
               invest_usdt AS investUsdt, leverage, max_loss_pct AS maxLossPct,
               is_active AS active, status, realized_pnl AS realizedPnl
        FROM trade_configs
        WHERE is_active = true
        ORDER BY member_id, bot_target, symbol
    """)
    List<TradeConfigDTO> selectAllActive();

    /** 청산 기록: 실현손익 누적 + 손실한도 초과 시 자동 비활성화 */
    @Update("""
        UPDATE trade_configs
        SET realized_pnl = realized_pnl + #{pnl},
            is_active = CASE WHEN realized_pnl + #{pnl} <= -(invest_usdt * max_loss_pct / 100)
                             THEN false ELSE is_active END,
            status = CASE WHEN realized_pnl + #{pnl} <= -(invest_usdt * max_loss_pct / 100)
                          THEN 'STOPPED_LOSS' ELSE status END,
            updated_at = NOW()
        WHERE id = #{id}
    """)
    int addRealizedPnl(@Param("id") Integer id, @Param("pnl") BigDecimal pnl);

    /** 워커가 설정 상태를 보고 (RUNNING/ERROR 등) */
    @Update("UPDATE trade_configs SET status = #{status}, updated_at = NOW() WHERE id = #{id}")
    int updateStatus(@Param("id") Integer id, @Param("status") String status);

    /** 같은 회원·거래소의 invest_usdt 합 (특정 id 제외) — 잔고 초과 검증용 */
    @Select("""
        SELECT COALESCE(SUM(invest_usdt), 0) FROM trade_configs
        WHERE member_id = #{memberId} AND exchange = #{exchange}
          AND (#{excludeId} IS NULL OR id <> #{excludeId})
    """)
    BigDecimal sumInvestByMember(@Param("memberId") String memberId,
                                 @Param("exchange") String exchange,
                                 @Param("excludeId") Integer excludeId);
}
