import { Data } from 'effect';

// Tagged error types for type-safe error handling
export class InvalidCredentialsError extends Data.TaggedError('InvalidCredentialsError')<{
  readonly message: string;
}> {}

export class OAuthError extends Data.TaggedError('OAuthError')<{
  readonly message: string;
  readonly code?: string;
}> {}

export class TokenExchangeError extends Data.TaggedError('TokenExchangeError')<{
  readonly message: string;
  readonly details?: string;
}> {}

export class StateError extends Data.TaggedError('StateError')<{
  readonly message: string;
}> {}

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  readonly resource: string;
  readonly id: string;
}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly field: string;
  readonly message: string;
}> {}

export class StripeError extends Data.TaggedError('StripeError')<{
  readonly message: string;
  readonly code?: string;
}> {}

// Union of all app errors
export type AppError =
  | InvalidCredentialsError
  | OAuthError
  | TokenExchangeError
  | StateError
  | NotFoundError
  | ValidationError
  | StripeError;
