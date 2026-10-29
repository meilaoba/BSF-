import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
process.env.NODE_ENV = 'development';

const {
  normalizeHkoCurrentResponse,
  normalizeHkoOfficialDailyResponse,
} = await import('../src/providers/hko-weather.js');
const { closePool } = await import('../src/db.js');

test.after(async () => closePool());

test('normalizes the Hong Kong Observatory current reading', () => {
  const result = normalizeHkoCurrentResponse({
    updateTime: '2026-10-29T15:02:00+08:00',
    temperature: {
      recordTime: '2026-10-29T15:00:00+08:00',
      data: [
        { place: 'King\'s Park', value: 28, unit: 'C' },
        { place: 'Hong Kong Observatory', value: 29, unit: 'C' },
      ],
    },
  });
  assert.equal(result.station, 'HKO');
  assert.equal(result.temperatureC, 29);
  assert.equal(result.observedAt.toISOString(), '2026-10-29T07:00:00.000Z');
});

test('normalizes the official daily mean and ignores incomplete rows', () => {
  const result = normalizeHkoOfficialDailyResponse({
    data: [
      ['2025', '10', '27', '24.6', 'C'],
      ['2025', '10', '28', '23.4', 'C'],
    ],
  }, '2025-10-28');
  assert.equal(result.temperatureC, 23.4);
  assert.equal(result.completeness, 'C');
  assert.equal(normalizeHkoOfficialDailyResponse({ data: [] }, '2026-10-28'), null);
});
