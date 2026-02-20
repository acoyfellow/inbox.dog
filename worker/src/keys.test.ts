import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Effect, Layer } from 'effect';
import { createApiKey } from './keys';
import { KVService } from './services/kv';
import { ValidationError } from './errors';

const putApiKey = vi.fn(() => Effect.void);
const mockKV: KVService = {
  getApiKey: vi.fn(),
  putApiKey,
  deleteApiKey: vi.fn(),
  getOAuthState: vi.fn(),
  putOAuthState: vi.fn(),
  deleteOAuthState: vi.fn(),
  putAuthCode: vi.fn(),
  getAuthCode: vi.fn(),
  deleteAuthCode: vi.fn(),
  getMcpSession: vi.fn(),
  putMcpSession: vi.fn(),
  deleteMcpSession: vi.fn(),
  getBindSession: vi.fn(),
  putBindSession: vi.fn(),
  deleteBindSession: vi.fn(),
  getGmailTokens: vi.fn(),
  putGmailTokens: vi.fn(),
};

const KVLayer = Layer.succeed(KVService, mockKV);

const runEither = <A, E>(effect: Effect.Effect<A, E, KVService>) =>
  Effect.runPromise(Effect.provide(Effect.either(effect), KVLayer));

describe('createApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putApiKey.mockReturnValue(Effect.void);
  });

  it('creates key with default name and empty redirectUris', async () => {
    const either = await runEither(createApiKey({}));
    if (either._tag === 'Left') throw either.left;
    const result = either.right;

    expect(result.clientId).toMatch(/^id_[a-f0-9]{32}$/);
    expect(result.clientSecret).toMatch(/^sk_[a-f0-9]{64}$/);
    expect(result.name).toBe('default');
    expect(result.redirectUris).toEqual([]);
    expect(putApiKey).toHaveBeenCalledWith(
      result.clientId,
      expect.objectContaining({ clientId: result.clientId, clientSecret: result.clientSecret }),
    );
  });

  it('creates key with custom name and redirectUris', async () => {
    const uris = ['https://inbox.dog/connect/callback'];
    const either = await runEither(createApiKey({ name: 'myapp', redirectUris: uris }));
    if (either._tag === 'Left') throw either.left;
    const result = either.right;

    expect(result.name).toBe('myapp');
    expect(result.redirectUris).toEqual(uris);
  });

  it('accepts localhost http as redirect_uri', async () => {
    const uris = ['http://localhost:3000/callback'];
    const either = await runEither(createApiKey({ redirectUris: uris }));
    if (either._tag === 'Left') throw either.left;
    const result = either.right;

    expect(result.redirectUris).toEqual(uris);
  });

  it('fails for invalid redirect_uri (http non-localhost)', async () => {
    const result = await runEither(createApiKey({ redirectUris: ['http://example.com/cb'] }));
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') expect(result.left).toBeInstanceOf(ValidationError);
  });

  it('fails for invalid redirect_uri (not a URL)', async () => {
    const result = await runEither(createApiKey({ redirectUris: ['not-a-url'] }));
    expect(result._tag).toBe('Left');
    if (result._tag === 'Left') expect(result.left).toBeInstanceOf(ValidationError);
  });
});
