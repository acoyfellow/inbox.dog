import { Effect, Context, Layer, Schema } from 'effect';
import { TokenExchangeError } from '../errors';
import {
  GoogleTokenResponseSchema,
  GoogleRefreshTokenResponseSchema,
  GoogleUserInfoSchema,
  type TokenResponse,
} from '../schemas';

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface GoogleOAuthService {
  readonly buildAuthUrl: (params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scope: string;
    prompt?: string;
  }) => string;

  readonly exchangeCode: (params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }) => Effect.Effect<TokenResponse, TokenExchangeError>;

  readonly refreshToken: (params: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
  }) => Effect.Effect<{ accessToken: string; expiresIn: number }, TokenExchangeError>;
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export const GoogleOAuthService = Context.GenericTag<GoogleOAuthService>('GoogleOAuthService');

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const makeGoogleOAuthService = (): GoogleOAuthService => ({
  buildAuthUrl({ clientId, redirectUri, state, scope, prompt }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope);
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    if (prompt) {
      url.searchParams.set('prompt', prompt);
    }
    return url.toString();
  },

  exchangeCode({ code, clientId, clientSecret, redirectUri }) {
    return Effect.gen(function* () {
      // Step 1: Exchange authorization code for tokens
      const tokenResponse = yield* Effect.tryPromise({
        try: () =>
          fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          }),
        catch: (e) => new TokenExchangeError({ message: `Network error: ${e}` }),
      });

      // Step 2: Parse + validate response
      if (!tokenResponse.ok) {
        const text = yield* Effect.tryPromise({
          try: () => tokenResponse.text(),
          catch: () => new TokenExchangeError({ message: 'Token exchange failed' }),
        });
        return yield* Effect.fail(
          new TokenExchangeError({ message: 'Token exchange failed', details: text })
        );
      }

      const tokenJson = yield* Effect.tryPromise({
        try: () => tokenResponse.json(),
        catch: () => new TokenExchangeError({ message: 'Failed to parse token response' }),
      });

      const tokens = yield* Schema.decodeUnknown(GoogleTokenResponseSchema)(tokenJson).pipe(
        Effect.mapError(() => new TokenExchangeError({ message: 'Invalid token response format' }))
      );

      // Step 3: Fetch user info
      const userInfoResponse = yield* Effect.tryPromise({
        try: () =>
          fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          }),
        catch: (e) => new TokenExchangeError({ message: `Failed to fetch user info: ${e}` }),
      });

      if (!userInfoResponse.ok) {
        return yield* Effect.fail(
          new TokenExchangeError({ message: 'Failed to get user info' })
        );
      }

      const userInfoJson = yield* Effect.tryPromise({
        try: () => userInfoResponse.json(),
        catch: () => new TokenExchangeError({ message: 'Failed to parse user info' }),
      });

      const userInfo = yield* Schema.decodeUnknown(GoogleUserInfoSchema)(userInfoJson).pipe(
        Effect.mapError(() => new TokenExchangeError({ message: 'Invalid user info format' }))
      );

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? '',
        expiresIn: tokens.expires_in,
        email: userInfo.email,
      };
    });
  },

  refreshToken({ refreshToken, clientId, clientSecret }) {
    return Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              refresh_token: refreshToken,
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: 'refresh_token',
            }),
          }),
        catch: (e) => new TokenExchangeError({ message: `Network error: ${e}` }),
      });

      if (!response.ok) {
        return yield* Effect.fail(
          new TokenExchangeError({ message: 'Token refresh failed' })
        );
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => new TokenExchangeError({ message: 'Failed to parse refresh response' }),
      });

      // Schema-validate instead of raw `as` cast
      const data = yield* Schema.decodeUnknown(GoogleRefreshTokenResponseSchema)(json).pipe(
        Effect.mapError(() => new TokenExchangeError({ message: 'Invalid refresh token response format' }))
      );

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      };
    });
  },
});

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const GoogleOAuthServiceLive = Layer.succeed(
  GoogleOAuthService,
  makeGoogleOAuthService()
);
