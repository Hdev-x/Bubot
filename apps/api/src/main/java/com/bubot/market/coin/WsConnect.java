package com.bubot.market.coin;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 거래소 WebSocket 연결 헬퍼 — buildAsync().join() 대신 상한 시간을 두고 기다린다.
 * 예전 코드는 join()이라 연결이 응답 없이 걸리면 재연결 스레드가 영원히 멈춰 "재연결 중" 상태가 고착됐다.
 *
 * 유령 소켓 처리: CompletableFuture.cancel() 뒤에는 thenAccept 콜백이 실행되지 않으므로(취소된 future는 정상 완료되지
 * 않는다) 소켓을 잡을 수 없다. 대신 시도(Attempt)가 listener를 감싸 열린 소켓을 기억하고, 포기(abandon)되면
 * 이미 열린 소켓은 abort하고 그 뒤 열리는 소켓도 abort하며 어떤 이벤트도 서비스에 넘기지 않는다.
 * onOpen의 "포기 여부 확인 + 소켓 기록"과 abandon의 "포기 표시 + 기록된 소켓 abort"는 같은 lock 아래서 실행돼
 * 타임아웃 직전에 열린 소켓도 놓치지 않는다(3차 리뷰 P1).
 */
final class WsConnect {

    static final long TIMEOUT_SECONDS = 15;

    private WsConnect() {}

    static WebSocket open(HttpClient client, URI uri, WebSocket.Listener listener) throws Exception {
        Attempt attempt = new Attempt(listener);
        CompletableFuture<WebSocket> future = client.newWebSocketBuilder().buildAsync(uri, attempt);
        try {
            return future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            attempt.abandon();
            future.cancel(true);
            throw new IOException("연결 " + TIMEOUT_SECONDS + "초 타임아웃: " + uri.getHost());
        } catch (InterruptedException e) {
            attempt.abandon();
            future.cancel(true);
            Thread.currentThread().interrupt();
            throw e;
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            throw cause instanceof Exception ex ? ex : e;
        }
    }

    /** 연결 시도 하나. 포기(abandon)된 뒤 도착하는 이벤트를 차단하고 열린 소켓을 abort한다. 정상 경로에서는 그대로 위임한다. */
    static final class Attempt implements WebSocket.Listener {
        private final WebSocket.Listener delegate;
        private boolean abandoned;      // guarded by this
        private WebSocket opened;       // guarded by this — onOpen으로 받은 소켓

        Attempt(WebSocket.Listener delegate) {
            this.delegate = delegate;
        }

        /** 포기 — 이미 열린 소켓이 있으면 즉시 abort, 이후 열리는 소켓도 onOpen에서 abort. */
        void abandon() {
            WebSocket s;
            synchronized (this) {
                abandoned = true;
                s = opened;
                opened = null;
            }
            if (s != null) abortQuietly(s);
        }

        synchronized boolean isAbandoned() {
            return abandoned;
        }

        private static void abortQuietly(WebSocket ws) {
            try { ws.abort(); } catch (Exception ignore) { /* 이미 닫힘 */ }
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            synchronized (this) {
                if (abandoned) {
                    abortQuietly(webSocket);
                    return;
                }
                opened = webSocket;
            }
            delegate.onOpen(webSocket);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            if (isAbandoned()) return null;
            return delegate.onText(webSocket, data, last);
        }

        @Override
        public CompletionStage<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
            if (isAbandoned()) return null;
            return delegate.onBinary(webSocket, data, last);
        }

        @Override
        public CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
            if (isAbandoned()) return null;
            return delegate.onPing(webSocket, message);
        }

        @Override
        public CompletionStage<?> onPong(WebSocket webSocket, ByteBuffer message) {
            if (isAbandoned()) return null;
            return delegate.onPong(webSocket, message);
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (isAbandoned()) return null;
            return delegate.onClose(webSocket, statusCode, reason);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            if (isAbandoned()) return;
            delegate.onError(webSocket, error);
        }
    }
}
