/**
 * Typed application errors. Every error carries a stable, machine-readable
 * `code` so the frontend can translate it without parsing English text.
 */
export class AppError extends Error {
  constructor(code, message, { status = 400, details = undefined } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super('VALIDATION_ERROR', message, { status: 422, details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, { status: 404 });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, { status: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super('FORBIDDEN', message, { status: 403 });
  }
}

/**
 * Raised by a provider adapter when its credentials are still blank.
 * The job is parked as `waiting_config` instead of being reported as sent,
 * so nothing is ever silently dropped or faked.
 */
export class ProviderNotConfiguredError extends AppError {
  constructor(channel) {
    super(
      `${channel.toUpperCase()}_PROVIDER_NOT_CONFIGURED`,
      `The ${channel} provider is not configured yet. Supply the vendor API credentials and retry.`,
      { status: 503 }
    );
    this.channel = channel;
  }
}

export class ProviderError extends AppError {
  constructor(code, message, { status = 502, details, retryable = true } = {}) {
    super(code, message, { status, details });
    this.retryable = retryable;
  }
}
