# Payments Checklist

## Scope

- [ ] PCI scope minimized
- [ ] Provider-hosted fields/tokenization
- [ ] No PAN/CVV stored
- [ ] No card data in logs
- [ ] Provider contract/DPA reviewed

## Flow

- [ ] Create payment intent/order idempotently
- [ ] Confirm payment
- [ ] Handle 3DS/SCA
- [ ] Handle decline
- [ ] Handle timeout/network failure
- [ ] Handle duplicate submit
- [ ] Handle retry
- [ ] Show clear user status

## Webhooks

- [ ] Signature verification
- [ ] Replay protection
- [ ] Idempotency
- [ ] Out-of-order events
- [ ] Duplicate events
- [ ] Dead-letter/retry
- [ ] Reconciliation with provider

## Money

- [ ] Integer minor units
- [ ] Currency handling
- [ ] Rounding rules
- [ ] Tax rules
- [ ] Refund/partial refund
- [ ] Chargeback
- [ ] Invoice/receipt

## Security/fraud

- [ ] Rate limits
- [ ] Abuse detection
- [ ] Audit trail
- [ ] Admin refund controls
- [ ] Permission checks
- [ ] Sensitive action logging

## Operations

- [ ] Payment success metric
- [ ] Failure alerts
- [ ] Reconciliation job
- [ ] Rollback plan
- [ ] Incident runbook
- [ ] Human approval for rule changes
