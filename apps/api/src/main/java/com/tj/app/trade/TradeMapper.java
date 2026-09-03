package com.tj.app.trade;

import org.apache.ibatis.annotations.*;

import java.util.List;

/**
 * trades(청산 체결 기록) 매퍼.
 * 시각은 epoch 초로 주고받는다 — INSERT 시 to_timestamp, SELECT 시 EXTRACT(EPOCH ...).
 */
@Mapper
public interface TradeMapper {

    @Insert("""
        INSERT INTO trades (config_id, member_id, symbol, direction,
            entry_price, exit_price, size, pnl_usdt, outcome, entry_time, exit_time, tags)
        VALUES (#{configId}, #{memberId}, #{symbol}, #{direction},
            #{entryPrice}, #{exitPrice}, #{size}, #{pnlUsdt}, #{outcome},
            to_timestamp(#{entryTime}), to_timestamp(#{exitTime}), CAST(#{tags} AS jsonb))
    """)
    int insert(TradeDTO dto);

    /** 사용자 체결기록 — 최근순 (member_id 본인 것만) */
    @Select("""
        SELECT id, config_id AS configId, symbol, direction,
               entry_price AS entryPrice, exit_price AS exitPrice, size,
               pnl_usdt AS pnlUsdt, outcome,
               EXTRACT(EPOCH FROM entry_time)::bigint AS entryTime,
               EXTRACT(EPOCH FROM exit_time)::bigint  AS exitTime,
               tags::text AS tags
        FROM trades
        WHERE member_id = #{memberId}
        ORDER BY exit_time DESC
        LIMIT #{limit}
    """)
    List<TradeDTO> selectByMemberId(@Param("memberId") String memberId, @Param("limit") int limit);
}
