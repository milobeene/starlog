package com.milobeene.gamebacklog.subscription.controller;

import com.milobeene.gamebacklog.common.dto.IdResponse;
import com.milobeene.gamebacklog.common.web.LoginMember;
import com.milobeene.gamebacklog.subscription.dto.SubscriptionRequest;
import com.milobeene.gamebacklog.subscription.service.SubscriptionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/** 구독 (FR-ACQ-04). 취득이 SUBSCRIPTION일 때 여기 연결된다 (FR-ACQ-05) */
@RestController
@RequestMapping("/api/me/subscriptions")
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    @PostMapping
    public ResponseEntity<IdResponse> register(@LoginMember Long memberId,
                                               @Valid @RequestBody SubscriptionRequest request) {
        Long subscriptionId = subscriptionService.register(memberId, request.toCommand());

        return ResponseEntity.created(URI.create("/api/me/subscriptions/" + subscriptionId))
                .body(IdResponse.of(subscriptionId));
    }

    @PutMapping("/{subscriptionId}")
    public void update(@LoginMember Long memberId, @PathVariable Long subscriptionId,
                       @Valid @RequestBody SubscriptionRequest request) {
        subscriptionService.update(memberId, subscriptionId, request.toCommand());
    }

    @DeleteMapping("/{subscriptionId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long subscriptionId) {
        subscriptionService.delete(memberId, subscriptionId);

        return ResponseEntity.noContent().build();
    }
}
