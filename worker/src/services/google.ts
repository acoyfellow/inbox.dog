import { Effect, Context, Layer, pipe } from 'effect';
import { Schema } from '@effect/schema';
import { OAuthError, TokenExchangeError } from '../errors';
import { GoogleTokenResponseSchema, GoogleUserInfoSchema, TokenResponse } from '../schemas';

// Service interface
export interface GoogleOAuthService {
  readonly buildAuthUrl: (params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scope: string;
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

// Service tag
export const GoogleOAuthService = Context.GenericTag<GoogleOAuthService>('GoogleOAuthService');

// Service implementation
const makeGoogleOAuthService = (): GoogleOAuthService => ({
  buildAuthUrl({ clientId, redirectUri, state, scope }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope);
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  },

  exchangeCode({ code, clientId, clientSecret, redirectUri }) {
    return pipe(
      // Step 1: Exchange code for tokens
      Effect.tryPromise({
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
      }),
      // Step 2: Check response status
      Effect.flatMap((response) =>
        response.ok
          ? Effect.tryPromise({
              try: () => response.json(),
              catch: () => new TokenExchangeError({ message: 'Failed to parse token response' }),
            })
          : Effect.tryPromise({
              try: () => response.text(),
              catch: () => new TokenExchangeError({ message: 'Token exchange failed' }),
            }).pipe(
              Effect.flatMap((text) =>
                Effect.fail(new TokenExchangeError({ message: 'Token exchange failed', details: text }))
              )
            )
      ),
      // Step 3: Validate response shape
      Effect.flatMap((data) =>
        pipe(
          Schema.decodeUnknown(GoogleTokenResponseSchema)(data),
          Effect.mapError(() => new TokenExchangeError({ message: 'Invalid token response format' }))
        )
      ),
      // Step 4: Get user info
      Effect.flatMap((tokens) =>
        pipe(
          Effect.tryPromise({
            try: () =>
              fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
              }),
            catch: (e) => new TokenExchangeError({ message: `Failed to fetch user info: ${e}` }),
          }),
          Effect.flatMap((response) =>
            response.ok
              ? Effect.tryPromise({
                  try: () => response.json(),
                  catch: () => new TokenExchangeError({ message: 'Failed to parse user info' }),
                })
              : Effect.fail(new TokenExchangeError({ message: 'Failed to get user info' }))
          ),
          Effect.flatMap((data) =>
            pipe(
              Schema.decodeUnknown(GoogleUserInfoSchema)(data),
              Effect.mapError(() => new TokenExchangeError({ message: 'Invalid user info format' }))
            )
          ),
          Effect.map((userInfo) => ({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? '',
            expiresIn: tokens.expires_in,
            email: userInfo.email,
          }))
        )
      )
    );
  },

  refreshToken({ refreshToken, clientId, clientSecret }) {
    return pipe(
      Effect.tryPromise({
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
      }),
      Effect.flatMap((response) =>
        response.ok
          ? Effect.tryPromise({
              try: () => response.json() as Promise<{ access_token: string; expires_in: number }>,
              catch: () => new TokenExchangeError({ message: 'Failed to parse refresh response' }),
            })
          : Effect.fail(new TokenExchangeError({ message: 'Token refresh failed' }))
      ),
      Effect.map((data) => ({
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      }))
    );
  },
});

// Layer
export const GoogleOAuthServiceLive = Layer.succeed(GoogleOAuthService, makeGoogleOAuthService());
