import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Effect, Layer } from 'effect';
import { authenticateApiKey } from './auth';
import { KVService } from './services/kv';
import { InvalidCredentialsError } from './errors';

const mockApiKey = {
  id: 'key1',
  clientId: 'id_abc',
  clientSecret: 'sk_secret123',
  name: 'test',
  createdAt: 123,
  credits: 10,
};

const getApiKey = vi.fn();
const mockKV: KVService = {
  getApiKey,
  putApiKey: vi.fn(),
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
  deductCredit: vi.fn(),
  addCredits: vi.fn(),
};

const KVLayer = Layer.succeed(KVService, mockKV);

const runEither = <A, E>(effect: Effect.Effect<A, E, KVService>) =>
  Effect.runPromise(Effect.provide(Effect.either(effect), KVLayer));

describe('authenticateApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiKey.mockReturnValue(Effect.succeed(mockApiKey));
  });

  it('returns apiKey when client_secret matches', async () => {
    const either = await runEither(authenticateApiKey('id_abc', 'sk_secret123'));
    expect(either._tag).toBe('Right');
    if (either._tag === 'Right') expect(either.right).toEqual(mockApiKey);
    expect(getApiKey).toHaveBeenCalledWith('id_abc');
  });

  it('fails with InvalidCredentialsError when client_secret does not match', async () => {
    const either = await runEither(authenticateApiKey('id_abc', 'wrong_secret'));
    expect(either._tag).toBe('Left');
    if (either._tag === 'Left') expect(either.left).toBeInstanceOf(InvalidCredentialsError);
  });
});
