package com.bubot.push;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface PushSubscriptionMapper {
    void insertSubscription(PushSubscriptionDTO dto);
    void deleteSubscriptionByEndpoint(String endpoint);
    List<PushSubscriptionDTO> selectSubscriptionsByMemberId(String memberId);
    List<PushSubscriptionDTO> selectAllSubscriptions();
}
