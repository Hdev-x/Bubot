package com.bubot.backtest;

import org.springframework.context.annotation.Profile;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Profile("trading") // trading 프로필에서만 등록. Beta(프로필 없음)에서는 제외 (wp-02 d03)
@Service
@RequiredArgsConstructor
public class BacktestRunService {

    private final BacktestRunMapper mapper;

    public List<BacktestRunDTO> list(String memberId, int limit) {
        return mapper.selectByMemberId(memberId, Math.min(Math.max(limit, 1), 200));
    }

    public void create(String memberId, BacktestRunDTO dto) {
        if (dto.getConfig() == null || dto.getConfig().isBlank()) throw new IllegalArgumentException("config 누락");
        if (dto.getSymbols() == null || dto.getSymbols().isBlank()) throw new IllegalArgumentException("symbols 누락");
        if (dto.getReport() == null || dto.getReport().isBlank()) throw new IllegalArgumentException("report 누락");
        if (dto.getRangeEnd() == null || dto.getRangeEnd().isBlank()) throw new IllegalArgumentException("rangeEnd 누락");
        if (dto.getConfigHash() == null || dto.getConfigHash().isBlank()) throw new IllegalArgumentException("configHash 누락");
        dto.setMemberId(memberId);
        mapper.insert(dto);
    }

    public boolean delete(String memberId, Integer id) {
        return mapper.deleteByIdAndMemberId(id, memberId) > 0;
    }
}
