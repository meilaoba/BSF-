import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalDailyInputKg,
  canonicalDailyInputT,
  vendorDailyFeedWeightKg,
} from '../src/shared/vendor-weight.js';

test('DailyFeedWeight remains a kilogram raw field', () => {
  assert.equal(vendorDailyFeedWeightKg({ DailyFeedWeight: 50 }), 50);
});

test('DailyFeedWeight never overrides the canonical input.dailyInput counter', () => {
  assert.equal(canonicalDailyInputKg({
    telemetry: { DailyFeedWeight: 50 },
    input: { dailyInput: 0.2 },
  }), 0.2);
});

test('input.dailyInput remains authoritative for Food Waste In', () => {
  assert.equal(canonicalDailyInputKg({ input: { dailyInput: 0.004 } }), 0.004);
  assert.equal(canonicalDailyInputKg({ input: { dailyInput: 0 } }), 0);
});

test('empty or non-numeric weight fields return null without fabricating a value', () => {
  assert.equal(vendorDailyFeedWeightKg({}), null);
  assert.equal(vendorDailyFeedWeightKg({ DailyFeedWeight: '' }), null);
  assert.equal(canonicalDailyInputKg({ input: {} }), null);
  assert.equal(canonicalDailyInputKg(), null);
});

test('numeric strings retain their declared vendor units', () => {
  assert.equal(vendorDailyFeedWeightKg({ DailyFeedWeight: '12.5' }), 12.5);
  assert.equal(canonicalDailyInputKg({ input: { dailyInput: '0.0125' } }), 0.0125);
  assert.equal(canonicalDailyInputT, canonicalDailyInputKg);
});
