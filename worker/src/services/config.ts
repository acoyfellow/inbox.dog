import { Context, Layer } from 'effect';
import type { Env } from '../types';

export interface ConfigService {
  readonly googleClientId: string;
  readonly googleClientSecret: string;
}

export const ConfigService = Context.GenericTag<ConfigService>('ConfigService');

export const ConfigServiceLive = (env: Env) =>
  Layer.succeed(ConfigService, {
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  });
