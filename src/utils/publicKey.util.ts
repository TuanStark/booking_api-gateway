import { readFileSync } from 'fs';
import { join } from 'path';

export function loadPublicKey(): string {
  console.log('=== DEBUG loadPublicKey ===');
  console.log('JWT_PUBLIC_KEY env:', process.env.JWT_PUBLIC_KEY);
  console.log('JWT_PUBLIC_KEY_PATH env:', process.env.JWT_PUBLIC_KEY_PATH);
  
  const envKey = process.env.JWT_PUBLIC_KEY;
  if (envKey) {
    console.log('Using JWT_PUBLIC_KEY from environment, length:', envKey.length);
    console.log('First 50 chars:', envKey.substring(0, 50));
    return envKey;
  }
  
  const p = process.env.JWT_PUBLIC_KEY_PATH || join(process.cwd(), 'keys', 'public.pem');
  console.log('Loading public key from:', p);
  console.log('Current working directory:', process.cwd());
  try {
    const key = readFileSync(p, 'utf8');
    console.log('Public key loaded successfully, length:', key.length);
    console.log('First 50 chars:', key.substring(0, 50));
    return key;
  } catch (err) {
    console.error('Error loading public key:', err);
    throw new Error(`Cannot read public key at ${p}: ${err}`);
  }
}
