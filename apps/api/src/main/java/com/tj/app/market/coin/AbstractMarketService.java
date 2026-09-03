package com.tj.app.market.coin;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * [클래스 읽기] 캐싱(TTL) 공통 로직을 처리하는 추상 클래스.
 * ConcurrentHashMap을 사용해 멀티스레드 환경에서 안전하게 인메모리 캐싱을 수행합니다.
 */
public abstract class AbstractMarketService {

    /** 캐시 저장소: key → 응답 데이터 (Object) */
    protected final Map<String, Object> cache = new ConcurrentHashMap<>();

    /** 캐시 만료 시각 저장: key → 만료 Unix 밀리초 */
    protected final Map<String, Long> cacheExpiry = new ConcurrentHashMap<>();

    /**
     * 해당 캐시 키가 아직 유효한지 확인한다.
     * @param key 캐시 키
     * @return true = 캐시 사용 가능, false = 재조회 필요
     */
    protected boolean isCacheValid(String key) {
        Long expiry = cacheExpiry.get(key);
        return expiry != null && expiry > System.currentTimeMillis();
    }

    /**
     * 캐시에 데이터를 저장하고 만료 시각을 기록한다.
     * @param key     캐시 키
     * @param data    저장할 응답 데이터
     * @param seconds 캐시 유효 시간 (초 단위)
     */
    protected void putCache(String key, Object data, int seconds) {
        cache.put(key, data);
        cacheExpiry.put(key, System.currentTimeMillis() + (seconds * 1000L));
    }
}
