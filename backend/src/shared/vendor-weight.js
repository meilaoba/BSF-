function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Vendor DailyFeedWeight is reported in kilograms by the template metadata.
 * Its daily-reset and cross-day semantics are not confirmed, so it is kept as
 * a raw display field and is not used by business calculations.
 */
export function vendorDailyFeedWeightKg(telemetry) {
  const data = objectOrEmpty(telemetry);
  return finiteNumber(data.DailyFeedWeight ?? data.dailyFeedWeight);
}

/**
 * Canonical daily input counter used by Food Waste In. The vendor reports
 * input.dailyInput in tonnes. DailyFeedWeight must not replace this field until
 * the vendor confirms its reset and cross-day behaviour.
 */
export function canonicalDailyInputT({ input } = {}) {
  return finiteNumber(objectOrEmpty(input).dailyInput);
}
