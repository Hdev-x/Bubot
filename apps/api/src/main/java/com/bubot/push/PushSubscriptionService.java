package com.bubot.push;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

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
