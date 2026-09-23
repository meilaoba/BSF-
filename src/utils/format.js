export function formatTimestamp(value) {
  if (!value) return '—';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (number) => String(number).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

export function toNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
