package com.bubot.push;

import org.springframework.context.annotation.Profile;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

@Profile("trading") // trading 프로필에서만 등록. Beta(프로필 없음)에서는 제외 (wp-02 d03)
@Service
public class PushSubscriptionService {

    @Autowired
    private PushSubscriptionMapper pushSubscriptionMapper;

    public void saveSubscription(PushSubscriptionDTO dto) {
        pushSubscriptionMapper.insertSubscription(dto);
    }

    public void removeSubscription(String endpoint) {
        pushSubscriptionMapper.deleteSubscriptionByEndpoint(endpoint);
    }

    public List<PushSubscriptionDTO> getSubscriptions(String memberId) {
        if (memberId == null || memberId.isEmpty()) {
            return pushSubscriptionMapper.selectAllSubscriptions();
        }
        return pushSubscriptionMapper.selectSubscriptionsByMemberId(memberId);
    }
}
