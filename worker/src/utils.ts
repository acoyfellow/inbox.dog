import { Effect, Either } from 'effect';

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function runEffect<A, E>(
  effect: Effect.Effect<A, E>
): Promise<Either.Either<A, E>> {
  return Effect.runPromise(Effect.either(effect));
}

/**
 * Timing-safe string comparison using crypto.subtle.
 * Prevents timing oracle attacks on secret comparisons.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  if (aBuf.byteLength !== bBuf.byteLength) {
    // Compare against self to burn constant time, then return false
    const dummy = new Uint8Array(aBuf.byteLength);
    const aKey = await crypto.subtle.importKey('raw', aBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    await crypto.subtle.sign('HMAC', aKey, dummy);
    return false;
  }

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('timing-safe-compare'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const aMac = new Uint8Array(await crypto.subtle.sign('HMAC', key, aBuf));
  const bMac = new Uint8Array(await crypto.subtle.sign('HMAC', key, bBuf));

  let result = 0;
  for (let i = 0; i < aMac.length; i++) {
    result |= aMac[i]! ^ bMac[i]!;
  }
  return result === 0;
}
