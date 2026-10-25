// Shared secret so only our own submission function can start a (paid) quote draft.
// Uses QUOTE_TRIGGER_SECRET if set, otherwise derives one from ANTHROPIC_API_KEY.
import { createHash } from 'node:crypto';

export function triggerSecret() {
  const s = process.env.QUOTE_TRIGGER_SECRET || process.env.ANTHROPIC_API_KEY || '';
  return s ? createHash('sha256').update(`jersey-strike-quote:${s}`).digest('hex') : '';
}
