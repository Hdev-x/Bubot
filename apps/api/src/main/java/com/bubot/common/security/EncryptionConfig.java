package com.bubot.common.security;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * EncryptionUtil에 암호화 키를 주입하는 설정 클래스.
 * APP_ENCRYPTION_KEY 환경변수가 없으면 스프링 기동 시 예외 발생 (fail-fast).
 */
@Configuration
public class EncryptionConfig {

    @Value("${app.encryption.key}")
    private String encryptionKey;

    @PostConstruct
    public void init() {
        EncryptionUtil.init(encryptionKey);
    }
}