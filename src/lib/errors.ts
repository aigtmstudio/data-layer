export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} '${id}' not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(clientId: string, required: number, available: number) {
    super(
      `Insufficient credits for client '${clientId}'. Required: ${required}, Available: ${available}`,
      402,
      'INSUFFICIENT_CREDITS',
    );
    this.name = 'InsufficientCreditsError';
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string) {
    super(`Provider '${provider}' error: ${message}`, 502, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }
}

export class RateLimitError extends AppError {
  constructor(provider: string) {
    super(`Rate limit exceeded for provider '${provider}'`, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
