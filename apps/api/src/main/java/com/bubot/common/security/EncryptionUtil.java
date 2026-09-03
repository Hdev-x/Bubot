package com.bubot.common.security;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM 암호화 유틸리티.
 * 거래소 API 키를 DB 저장 전 암호화하고 조회 시 복호화할 때 사용한다.
 *
 * 암호화 키는 환경변수 APP_ENCRYPTION_KEY (Base64, 32바이트)에서 읽는다.
 * 미설정 시 랜타임 예외 발생 (fail-fast).
 */
public final class EncryptionUtil {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;  // 96비트 IV (NIST 권장)
    private static final int GCM_TAG_LENGTH = 128; // 128비트 인증 태그
    private static final SecureRandom RANDOM = new SecureRandom();

    // 키 회전 지원: KEYS[0]=primary(암호화용), 나머지=legacy(복호화 fallback)
    private static volatile byte[][] KEYS;

    /**
     * 콤마로 구분된 여러 Base64 키를 받는다. 첫 번째가 암호화용(primary),
     * 나머지는 복호화 fallback(이전 키). 키 회전 시 "NEW,OLD" 형태로 설정한다.
     */
    public static void init(String base64Keys) {
        String[] parts = base64Keys.split(",");
        byte[][] keys = new byte[parts.length][];
        int n = 0;
        for (String p : parts) {
            String t = p.trim();
            if (t.isEmpty()) continue;
            byte[] k = Base64.getDecoder().decode(t);
            if (k.length != 32) {
                throw new IllegalArgumentException("APP_ENCRYPTION_KEY의 각 키는 32바이트 Base64여야 합니다.");
            }
            keys[n++] = k;
        }
        if (n == 0) throw new IllegalArgumentException("APP_ENCRYPTION_KEY가 비어 있습니다.");
        KEYS = (n == parts.length) ? keys : java.util.Arrays.copyOf(keys, n);
    }

    private static byte[] primaryKey() {
        if (KEYS == null) throw new IllegalStateException("EncryptionUtil.init()이 호출되지 않았습니다. APP_ENCRYPTION_KEY 환경변수를 확인하세요.");
        return KEYS[0];
    }

    /** 평문 → "Base64(IV).Base64(ciphertext)" */
    public static String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            RANDOM.nextBytes(iv);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(primaryKey(), "AES"), spec);
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            return Base64.getEncoder().encodeToString(iv) + "."
                    + Base64.getEncoder().encodeToString(ciphertext);
        } catch (Exception e) {
            throw new RuntimeException("암호화 실패", e);
        }
    }

    /** "Base64(IV).Base64(ciphertext)" → 평문. 등록된 모든 키를 순서대로 시도(키 회전 지원) */
    public static String decrypt(String encryptedText) {
        if (KEYS == null) throw new IllegalStateException("EncryptionUtil.init()이 호출되지 않았습니다.");
        String[] parts = encryptedText.split("\\.");
        if (parts.length != 2) throw new IllegalArgumentException("잘못된 암호문 형식");
        byte[] iv = Base64.getDecoder().decode(parts[0]);
        byte[] ciphertext = Base64.getDecoder().decode(parts[1]);
        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);

        Exception last = null;
        for (byte[] key : KEYS) {
            try {
                Cipher cipher = Cipher.getInstance(ALGORITHM);
                cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), spec);
                // GCM 인증 태그가 안 맞으면 doFinal에서 예외 → 다음 키 시도
                byte[] plaintext = cipher.doFinal(ciphertext);
                return new String(plaintext, java.nio.charset.StandardCharsets.UTF_8);
            } catch (Exception e) {
                last = e;
            }
        }
        throw new RuntimeException("복호화 실패 (등록된 모든 키 불일치)", last);
    }

    /** 키 앞 6자 + "..." + 뒤 4자로 마스킹. 예: bg_c1d1...3267 */
    public static String mask(String text) {
        if (text == null || text.length() <= 10) return "****";
        return text.substring(0, 6) + "..." + text.substring(text.length() - 4);
    }
}