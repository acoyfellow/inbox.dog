import { Hono } from 'hono';
import type { Env } from '../types';

export const wellKnownRoutes = new Hono<{ Bindings: Env }>();

// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// Tells MCP clients where the authorization server is
wellKnownRoutes.get('/oauth-protected-resource', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [`${origin}`],
    scopes_supported: ['gmail:read', 'gmail:send', 'gmail:full'],
    bearer_methods_supported: ['header'],
  });
});

// Also serve at /mcp path variant per RFC 9728
wellKnownRoutes.get('/oauth-protected-resource/mcp', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [`${origin}`],
    scopes_supported: ['gmail:read', 'gmail:send', 'gmail:full'],
    bearer_methods_supported: ['header'],
  });
});

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
// Tells MCP clients our OAuth endpoints
wellKnownRoutes.get('/oauth-authorization-server', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    scopes_supported: ['gmail:read', 'gmail:send', 'gmail:full'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: `${origin}/docs`,
  });
});
