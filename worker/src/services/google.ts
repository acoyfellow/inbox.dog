import { Effect, pipe } from 'effect';

interface AuthUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string;
}

interface ExchangeCodeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface RefreshTokenParams {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export const GoogleOAuth = {
  buildAuthUrl(params: AuthUrlParams): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scope);
    url.searchParams.set('state', params.state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  },

  exchangeCode(params: ExchangeCodeParams): Effect.Effect<TokenResponse, string> {
    return Effect.tryPromise({
      try: async () => {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: params.code,
            client_id: params.clientId,
            client_secret: params.clientSecret,
            redirect_uri: params.redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenResponse.ok) {
          const error = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${error}`);
        }

        const tokens = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        // Get user email
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userResponse.ok) {
          throw new Error('Failed to get user info');
        }

        const user = (await userResponse.json()) as { email: string };

        return {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          email: user.email,
        };
      },
      catch: (e) => String(e),
    });
  },

  refreshToken(params: RefreshTokenParams): Effect.Effect<RefreshResponse, string> {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: params.refreshToken,
            client_id: params.clientId,
            client_secret: params.clientSecret,
            grant_type: 'refresh_token',
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Token refresh failed: ${error}`);
        }

        const data = (await response.json()) as {
          access_token: string;
          expires_in: number;
        };

        return {
          accessToken: data.access_token,
          expiresIn: data.expires_in,
        };
      },
      catch: (e) => String(e),
    });
  },
};
