-- For the retention sweep of finished webhook deliveries (src/lib/agents/webhooks.ts).
CREATE INDEX "WebhookDelivery_status_createdAt_idx" ON "WebhookDelivery"("status", "createdAt");
