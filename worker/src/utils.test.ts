import { describe, it, expect } from 'vitest';
import { timingSafeEqual } from './utils';

describe('timingSafeEqual', () => {
  it('returns true for identical strings', async () => {
    const s = 'sk_abc123secret';
    expect(await timingSafeEqual(s, s)).toBe(true);
  });

  it('returns false for different strings of same length', async () => {
    expect(await timingSafeEqual('sk_abc', 'sk_xyz')).toBe(false);
  });

  it('returns false for different strings of different length', async () => {
    expect(await timingSafeEqual('short', 'longer_secret')).toBe(false);
  });

  it('returns false when first is prefix of second', async () => {
    expect(await timingSafeEqual('sk_', 'sk_abc123')).toBe(false);
  });
});
