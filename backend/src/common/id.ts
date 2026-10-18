import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 (RFC 9562): 48-bit unix-ms timestamp + random bits. Unguessable like v4, but time-ordered,
 * so primary-key inserts stay mostly sequential in the index.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6); // version 7
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8); // variant 10
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
