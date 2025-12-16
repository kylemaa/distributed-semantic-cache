/**
 * Encryption utilities for privacy-first architecture
 * 
 * Provides AES-256-GCM encryption for embeddings at rest.
 * Used when PRIVACY_MODE=strict to ensure data never stored unencrypted.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // PBKDF2 iterations

export interface EncryptedData {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
  salt: Buffer;
}

export interface EncryptionMetadata {
  algorithm: string;
  ivLength: number;
  tagLength: number;
  encrypted: boolean;
}

/**
 * Generate encryption key from password using PBKDF2
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Generate a secure random encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt data using AES-256-GCM
 * @param data - Data to encrypt (can be string, Buffer, or object)
 * @param password - Encryption password/key
 * @returns Encrypted data with IV, tag, and salt
 */
export function encrypt(data: string | Buffer | object, password: string): EncryptedData {
  // Convert data to buffer
  const dataBuffer = typeof data === 'string'
    ? Buffer.from(data, 'utf-8')
    : data instanceof Buffer
    ? data
    : Buffer.from(JSON.stringify(data), 'utf-8');

  // Generate random IV and salt
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive key from password
  const key = deriveKey(password, salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt data
  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

  // Get authentication tag
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv,
    tag,
    salt,
  };
}

/**
 * Decrypt data using AES-256-GCM
 * @param encryptedData - Encrypted data with IV, tag, and salt
 * @param password - Encryption password/key
 * @returns Decrypted data as Buffer
 */
export function decrypt(encryptedData: EncryptedData, password: string): Buffer {
  const { encrypted, iv, tag, salt } = encryptedData;

  // Derive key from password and salt
  const key = deriveKey(password, salt);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  // Decrypt data
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted;
}

/**
 * Encrypt embedding vector (array of numbers)
 * @param embedding - Embedding vector
 * @param password - Encryption password/key
 * @returns Serialized encrypted data as Buffer
 */
export function encryptEmbedding(embedding: number[], password: string): Buffer {
  // Convert embedding to JSON string
  const embeddingJson = JSON.stringify(embedding);
  
  // Encrypt
  const encrypted = encrypt(embeddingJson, password);
  
  // Serialize to single buffer: [iv][tag][salt][encrypted]
  return serializeEncryptedData(encrypted);
}

/**
 * Decrypt embedding vector
 * @param encryptedBuffer - Serialized encrypted data
 * @param password - Encryption password/key
 * @returns Original embedding vector
 */
export function decryptEmbedding(encryptedBuffer: Buffer, password: string): number[] {
  // Deserialize buffer
  const encrypted = deserializeEncryptedData(encryptedBuffer);
  
  // Decrypt
  const decrypted = decrypt(encrypted, password);
  
  // Parse JSON
  const embedding = JSON.parse(decrypted.toString('utf-8'));
  
  return embedding;
}

/**
 * Serialize encrypted data to single buffer
 * Format: [iv_length(2)][iv][tag_length(2)][tag][salt_length(2)][salt][encrypted]
 */
export function serializeEncryptedData(data: EncryptedData): Buffer {
  const { iv, tag, salt, encrypted } = data;
  
  const ivLengthBuffer = Buffer.alloc(2);
  ivLengthBuffer.writeUInt16BE(iv.length, 0);
  
  const tagLengthBuffer = Buffer.alloc(2);
  tagLengthBuffer.writeUInt16BE(tag.length, 0);
  
  const saltLengthBuffer = Buffer.alloc(2);
  saltLengthBuffer.writeUInt16BE(salt.length, 0);
  
  return Buffer.concat([
    ivLengthBuffer,
    iv,
    tagLengthBuffer,
    tag,
    saltLengthBuffer,
    salt,
    encrypted,
  ]);
}

/**
 * Deserialize encrypted data from buffer
 */
export function deserializeEncryptedData(buffer: Buffer): EncryptedData {
  let offset = 0;
  
  // Read IV length and IV
  const ivLength = buffer.readUInt16BE(offset);
  offset += 2;
  const iv = buffer.subarray(offset, offset + ivLength);
  offset += ivLength;
  
  // Read tag length and tag
  const tagLength = buffer.readUInt16BE(offset);
  offset += 2;
  const tag = buffer.subarray(offset, offset + tagLength);
  offset += tagLength;
  
  // Read salt length and salt
  const saltLength = buffer.readUInt16BE(offset);
  offset += 2;
  const salt = buffer.subarray(offset, offset + saltLength);
  offset += saltLength;
  
  // Read encrypted data
  const encrypted = buffer.subarray(offset);
  
  return { iv, tag, salt, encrypted };
}

/**
 * Create encryption metadata for storage
 */
export function createEncryptionMetadata(): EncryptionMetadata {
  return {
    algorithm: ALGORITHM,
    ivLength: IV_LENGTH,
    tagLength: TAG_LENGTH,
    encrypted: true,
  };
}

/**
 * Validate encryption password strength
 */
export function validateEncryptionPassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 16) {
    errors.push('Password must be at least 16 characters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Hash data using SHA-256 (for checksums, not passwords)
 */
export function hash(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
