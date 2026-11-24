const MODEL_DEFAULTS = Object.freeze([
  {
    pattern: /CR-50S/i,
    settings: {
      region: 'non-hk',
      ghgFormula: {
        monthlyDistanceKm: 24,
        solar: true,
      },
    },
  },
  {
    pattern: /CR-30S/i,
    settings: {
      region: 'non-hk',
      ghgFormula: {
        monthlyDistanceKm: 140,
        solar: false,
      },
    },
  },
]);

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/**
 * Workbook-backed defaults for known machine models. Client/machine database
 * overrides are merged after these values and therefore remain authoritative.
 */
export function defaultGhgSettingsForDevice(device = {}) {
  const modelText = [
    device.deviceName,
    device.name,
    device.templateName,
  ].map(cleanText).filter(Boolean).join(' ');
  const matched = MODEL_DEFAULTS.find((entry) => entry.pattern.test(modelText));
  return matched
    ? {
        region: matched.settings.region,
        ghgFormula: { ...matched.settings.ghgFormula },
      }
    : null;
}
