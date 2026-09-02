export class RateLimitedError extends Error {
  constructor(message = 'Vinted rate limit reached') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Vinted refused the request') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Vinted session is no longer accepted') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class VintedHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Vinted request failed with status ${status}`);
    this.name = 'VintedHttpError';
  }
}
