import {
  InvalidCredentialsError,
  InsufficientCreditsError,
  NotFoundError,
  StateError,
  ValidationError,
  TokenExchangeError,
  StripeError,
} from './errors';

// Structured error body returned by all API endpoints
export interface StructuredError {
  error: {
    code: string;
    message: string;
    action: string;
    docs: string;
  };
}

/**
 * Map a tagged error (or unknown) to an HTTP status code + structured body.
 * Every route handler funnels Effect failures through this function.
 */
export const errorToResponse = (error: unknown): { status: number; body: StructuredError } => {
  if (error instanceof InvalidCredentialsError) {
    return {
      status: 401,
      body: {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: error.message,
          action: 'Check your client_id and client_secret',
          docs: 'https://inbox.dog/docs/errors#INVALID_CREDENTIALS',
        },
      },
    };
  }
  if (error instanceof InsufficientCreditsError) {
    return {
      status: 402,
      body: {
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `No credits remaining. Current balance: ${error.credits}`,
          action: 'Purchase credits via POST /api/checkout',
          docs: 'https://inbox.dog/docs/errors#INSUFFICIENT_CREDITS',
        },
      },
    };
  }
  if (error instanceof NotFoundError) {
    const code =
      error.resource === 'oauth_state'
        ? 'STATE_NOT_FOUND'
        : error.resource === 'auth_code'
          ? 'AUTH_CODE_NOT_FOUND'
          : 'NOT_FOUND';
    return {
      status: 400,
      body: {
        error: {
          code,
          message: `${error.resource} not found: ${error.id}`,
          action:
            code === 'STATE_NOT_FOUND' || code === 'AUTH_CODE_NOT_FOUND'
              ? 'Restart the OAuth flow'
              : 'Check the endpoint URL and parameters',
          docs: 'https://inbox.dog/docs/errors',
        },
      },
    };
  }
  if (error instanceof StateError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'STATE_NOT_FOUND',
          message: error.message,
          action: 'Restart the OAuth flow (states expire after 10 minutes)',
          docs: 'https://inbox.dog/docs/errors',
        },
      },
    };
  }
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: `${error.field}: ${error.message}`,
          action: 'Check the required fields for this endpoint',
          docs: 'https://inbox.dog/docs/api',
        },
      },
    };
  }
  if (error instanceof TokenExchangeError) {
    return {
      status: 500,
      body: {
        error: {
          code: 'TOKEN_EXCHANGE_FAILED',
          message: error.message,
          action: 'Retry the request or check Google OAuth configuration',
          docs: 'https://inbox.dog/docs/errors',
        },
      },
    };
  }
  if (error instanceof StripeError) {
    return {
      status: 500,
      body: {
        error: {
          code: 'STRIPE_ERROR',
          message: error.message,
          action: 'Retry the request. If the problem persists, check https://inbox.dog/health',
          docs: 'https://inbox.dog/docs/errors',
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        action: 'Retry the request. If the problem persists, check https://inbox.dog/health',
        docs: 'https://inbox.dog/docs/errors',
      },
    },
  };
};
