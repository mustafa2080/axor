import { describe, expect, it } from 'vitest';
import { subscriptionStatuses } from '../../database/schema/index.js';
import { addDays, canTransition, isCancelable, isEntitled } from './subscription-state.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const later = new Date('2026-10-20T12:00:00.000Z');
const earlier = new Date('2026-10-18T12:00:00.000Z');

describe('subscription state rules', () => {
  it('only trialing and active subscriptions with a future end date give access', () => {
    for (const status of subscriptionStatuses) {
      const expected = status === 'trialing' || status === 'active';
      expect(isEntitled({ status, currentPeriodEnd: later }, NOW)).toBe(expected);
    }
  });

  it('stops giving access exactly at the end date, without waiting for the expiry job', () => {
    expect(isEntitled({ status: 'trialing', currentPeriodEnd: later }, NOW)).toBe(true);
    expect(isEntitled({ status: 'trialing', currentPeriodEnd: NOW }, NOW)).toBe(false);
    expect(isEntitled({ status: 'active', currentPeriodEnd: earlier }, NOW)).toBe(false);
  });

  it('never grants access without an end date', () => {
    expect(isEntitled({ status: 'active', currentPeriodEnd: null }, NOW)).toBe(false);
    expect(isEntitled({ status: 'trialing', currentPeriodEnd: null }, NOW)).toBe(false);
  });

  it('lets a trial become active, canceled or expired, but never past_due or trialing again', () => {
    expect(canTransition('trialing', 'active')).toBe(true);
    expect(canTransition('trialing', 'canceled')).toBe(true);
    expect(canTransition('trialing', 'expired')).toBe(true);
    expect(canTransition('trialing', 'past_due')).toBe(false);
    expect(canTransition('trialing', 'trialing')).toBe(false);
  });

  it('never goes back to trialing from any state (one trial per company and system)', () => {
    for (const status of subscriptionStatuses) {
      expect(canTransition(status, 'trialing')).toBe(false);
    }
  });

  it('lets staff reactivate a canceled or expired subscription, and renew an active one', () => {
    expect(canTransition('canceled', 'active')).toBe(true);
    expect(canTransition('expired', 'active')).toBe(true);
    expect(canTransition('active', 'active')).toBe(true);
    expect(canTransition('canceled', 'expired')).toBe(false);
    expect(canTransition('expired', 'canceled')).toBe(false);
  });

  it('cancels only what is still running', () => {
    expect(isCancelable('trialing')).toBe(true);
    expect(isCancelable('active')).toBe(true);
    expect(isCancelable('past_due')).toBe(true);
    expect(isCancelable('canceled')).toBe(false);
    expect(isCancelable('expired')).toBe(false);
  });

  it('adds whole days', () => {
    expect(addDays(NOW, 14).toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });
});
