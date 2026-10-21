import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** URL-safe, sortable-enough random id: 4-char time prefix + 16 random chars. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36).slice(-6);
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${time}${out}`;
}
