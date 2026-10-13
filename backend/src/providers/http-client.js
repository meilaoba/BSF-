import { config } from '../config.js';
import { ProviderError } from '../lib/errors.js';

/**
 * Thin fetch wrapper used by every provider adapter.
 * - Applies a hard timeout so a hung vendor cannot block the worker.
 * - Never logs credentials.
 * - Converts transport failures into retryable ProviderError instances.
 */
export async function httpRequest({
  url,
  method = 'POST',
  headers = {},
  body,
  timeoutMs = config.providerTimeoutMs,
  provider,
}) {
  const started = Date.now();
  let response;
  let rawText = '';

  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    rawText = await response.text();
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new ProviderError(
      timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNREACHABLE',
      timedOut
        ? `${provider} did not respond within ${timeoutMs} ms`
        : `${provider} could not be reached: ${err?.message ?? 'network error'}`,
      { details: { provider }, retryable: true }
    );
  }

  const durationMs = Date.now() - started;
  let parsed = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { raw: rawText.slice(0, 1000) };
    }
  }

  if (!response.ok) {
    const vendorMessage =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error_description ||
      (typeof parsed?.raw === 'string' ? parsed.raw : '') ||
      `HTTP ${response.status}`;

    throw new ProviderError(
      `PROVIDER_HTTP_${response.status}`,
      `${provider} rejected the request: ${String(vendorMessage).slice(0, 400)}`,
      {
        status: response.status >= 500 ? 502 : 400,
        // 4xx means our payload is wrong: retrying will not help.
        retryable: response.status >= 500 || response.status === 429,
        details: { provider, httpStatus: response.status, vendorResponse: parsed },
      }
    );
  }

  return { status: response.status, body: parsed, durationMs };
}