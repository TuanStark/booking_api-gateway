import { readFileSync } from 'fs';
import { join } from 'path';

export function loadPublicKey(): string {
  const envKey = process.env.JWT_PUBLIC_KEY;
  if (envKey) return envKey;
  const p = process.env.JWT_PUBLIC_KEY_PATH || join(process.cwd(), 'keys', 'public.pem');
  try {
    return readFileSync(p, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read public key at ${p}: ${err}`);
  }
}
