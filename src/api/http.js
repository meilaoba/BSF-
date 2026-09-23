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

export function createHttpClient(options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs || 15000;
  const getToken = options.getToken || (() => '');

  async function request(path, requestOptions = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const method = requestOptions.method || 'GET';
    const token = getToken();
    const url = baseUrl + path + (requestOptions.params ? buildQuery(requestOptions.params) : '');

    try {
      const response = await fetch(url, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, requestOptions.headers || {}),
        body: requestOptions.data === undefined ? undefined : JSON.stringify(requestOptions.data),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(payload.message || ('HTTP ' + response.status), response.status, payload);
      if (payload && typeof payload === 'object' && 'code' in payload) {
        if (payload.code === 0) return payload.data;
        throw new ApiError(payload.message || 'API_ERROR', payload.code, payload.data);
      }
      return payload;
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
