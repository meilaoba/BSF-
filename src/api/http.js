export class ApiError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

function buildQuery(params) {
  const pairs = [];
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
  });
  return pairs.length ? '?' + pairs.join('&') : '';
}

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const prefix = name + '=';
  const entry = String(document.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!entry) return '';
  try { return decodeURIComponent(entry.slice(prefix.length)); } catch (error) { return ''; }
}

export function createHttpClient(options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs || 15000;
  const getToken = options.getToken || (() => '');
  const csrfCookieName = options.csrfCookieName || 'bsf_csrf';

  async function request(path, requestOptions = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const method = requestOptions.method || 'GET';
    const token = getToken();
    const csrfToken = method === 'GET' || method === 'HEAD' ? '' : readCookie(csrfCookieName);
    const url = baseUrl + path + (requestOptions.params ? buildQuery(requestOptions.params) : '');

    try {
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: Object.assign(
          requestOptions.data === undefined ? {} : { 'Content-Type': 'application/json' },
          token ? { Authorization: 'Bearer ' + token } : {},
          csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
          requestOptions.headers || {}
        ),
        body: requestOptions.data === undefined ? undefined : JSON.stringify(requestOptions.data),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = payload && payload.error ? payload.error : {};
        throw new ApiError(apiError.message || payload.message || ('HTTP ' + response.status), apiError.code || response.status, payload);
      }
      if (payload && typeof payload === 'object' && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')) {
        return payload.data;
      }
      if (payload && typeof payload === 'object' && 'code' in payload) {
        if (payload.code === 0 || payload.code === 200) return payload.data;
        throw new ApiError(payload.msg || payload.message || 'API_ERROR', payload.code, payload.data);
      }
      return payload;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new ApiError('Request timed out', 'TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    request,
    get(path, params) { return request(path, { params }); },
    post(path, data) { return request(path, { method: 'POST', data }); },
    put(path, data) { return request(path, { method: 'PUT', data }); },
    delete(path, data) { return request(path, { method: 'DELETE', data }); }
  };
}
