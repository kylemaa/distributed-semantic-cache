/**
 * Tests for encryption utilities
 */

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  encryptEmbedding,
  decryptEmbedding,
  generateEncryptionKey,
  validateEncryptionPassword,
  hash,
  generateToken,
  serializeEncryptedData,
  deserializeEncryptedData,
} from '../src/encryption.js';

describe('Encryption', () => {
  const testPassword = 'TestPassword123!@#SecureKey456$%^';
  const weakPassword = 'weak';

  describe('Basic Encryption/Decryption', () => {
    it('should encrypt and decrypt string data', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encrypt(plaintext, testPassword);

      expect(encrypted.encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.iv).toBeInstanceOf(Buffer);
      expect(encrypted.tag).toBeInstanceOf(Buffer);
      expect(encrypted.salt).toBeInstanceOf(Buffer);

      const decrypted = decrypt(encrypted, testPassword);
      expect(decrypted.toString('utf-8')).toBe(plaintext);
    });

    it('should encrypt and decrypt buffer data', () => {
      const plaintext = Buffer.from('Binary data test', 'utf-8');
      const encrypted = encrypt(plaintext, testPassword);
      const decrypted = decrypt(encrypted, testPassword);

      expect(Buffer.compare(decrypted, plaintext)).toBe(0);
    });

    it('should encrypt and decrypt JSON objects', () => {
      const plaintext = { message: 'test', numbers: [1, 2, 3] };
      const encrypted = encrypt(plaintext, testPassword);
      const decrypted = decrypt(encrypted, testPassword);

      expect(JSON.parse(decrypted.toString('utf-8'))).toEqual(plaintext);
    });

    it('should fail decryption with wrong password', () => {
      const plaintext = 'Secret message';
      const encrypted = encrypt(plaintext, testPassword);

      expect(() => {
        decrypt(encrypted, 'WrongPassword123!@#Wrong456$%^');
      }).toThrow();
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = 'Same message';
      const encrypted1 = encrypt(plaintext, testPassword);
      const encrypted2 = encrypt(plaintext, testPassword);

      // IVs and salts should be different
      expect(Buffer.compare(encrypted1.iv, encrypted2.iv)).not.toBe(0);
      expect(Buffer.compare(encrypted1.salt, encrypted2.salt)).not.toBe(0);
      expect(Buffer.compare(encrypted1.encrypted, encrypted2.encrypted)).not.toBe(0);
    });
  });

  describe('Embedding Encryption', () => {
    it('should encrypt and decrypt embedding vectors', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const encryptedBuffer = encryptEmbedding(embedding, testPassword);

      expect(encryptedBuffer).toBeInstanceOf(Buffer);
      expect(encryptedBuffer.length).toBeGreaterThan(0);

      const decrypted = decryptEmbedding(encryptedBuffer, testPassword);
      expect(decrypted).toEqual(embedding);
    });

    it('should handle large embedding vectors', () => {
      const embedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      const encryptedBuffer = encryptEmbedding(embedding, testPassword);
      const decrypted = decryptEmbedding(encryptedBuffer, testPassword);

      expect(decrypted).toEqual(embedding);
      expect(decrypted.length).toBe(1536);
    });

    it('should preserve floating point precision', () => {
      const embedding = [0.123456789, -0.987654321, 0.555555555];
      const encryptedBuffer = encryptEmbedding(embedding, testPassword);
      const decrypted = decryptEmbedding(encryptedBuffer, testPassword);

      expect(decrypted).toEqual(embedding);
    });

    it('should fail with wrong password for embeddings', () => {
      const embedding = [1.0, 2.0, 3.0];
      const encryptedBuffer = encryptEmbedding(embedding, testPassword);

      expect(() => {
        decryptEmbedding(encryptedBuffer, 'WrongPassword123!@#Wrong456$%^');
      }).toThrow();
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize encrypted data', () => {
      const plaintext = 'Test serialization';
      const encrypted = encrypt(plaintext, testPassword);
      const serialized = serializeEncryptedData(encrypted);

      expect(serialized).toBeInstanceOf(Buffer);

      const deserialized = deserializeEncryptedData(serialized);

      expect(Buffer.compare(deserialized.iv, encrypted.iv)).toBe(0);
      expect(Buffer.compare(deserialized.tag, encrypted.tag)).toBe(0);
      expect(Buffer.compare(deserialized.salt, encrypted.salt)).toBe(0);
      expect(Buffer.compare(deserialized.encrypted, encrypted.encrypted)).toBe(0);

      // Should be able to decrypt deserialized data
      const decrypted = decrypt(deserialized, testPassword);
      expect(decrypted.toString('utf-8')).toBe(plaintext);
    });

    it('should handle serialization of large encrypted data', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encrypt(plaintext, testPassword);
      const serialized = serializeEncryptedData(encrypted);
      const deserialized = deserializeEncryptedData(serialized);

      const decrypted = decrypt(deserialized, testPassword);
      expect(decrypted.toString('utf-8')).toBe(plaintext);
    });
  });

  describe('Password Validation', () => {
    it('should accept strong password', () => {
      const result = validateEncryptionPassword(testPassword);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject short password', () => {
      const result = validateEncryptionPassword('Short1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 16 characters');
    });

    it('should reject password without uppercase', () => {
      const result = validateEncryptionPassword('testpassword123!@#');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase', () => {
      const result = validateEncryptionPassword('TESTPASSWORD123!@#');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without numbers', () => {
      const result = validateEncryptionPassword('TestPasswordOnly!@#');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject password without special characters', () => {
      const result = validateEncryptionPassword('TestPassword12345');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should list all errors for weak password', () => {
      const result = validateEncryptionPassword(weakPassword);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Key Generation', () => {
    it('should generate encryption key', () => {
      const key = generateEncryptionKey();
      expect(typeof key).toBe('string');
      expect(key.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      expect(key1).not.toBe(key2);
    });

    it('should generate token', () => {
      const token = generateToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate token with custom length', () => {
      const token = generateToken(16);
      expect(token.length).toBe(32); // 16 bytes = 32 hex characters
    });
  });

  describe('Hashing', () => {
    it('should hash string data', () => {
      const data = 'Test data';
      const hashed = hash(data);

      expect(typeof hashed).toBe('string');
      expect(hashed.length).toBe(64); // SHA-256 = 64 hex characters
    });

    it('should hash buffer data', () => {
      const data = Buffer.from('Test data', 'utf-8');
      const hashed = hash(data);

      expect(typeof hashed).toBe('string');
      expect(hashed.length).toBe(64);
    });

    it('should produce same hash for same input', () => {
      const data = 'Same input';
      const hash1 = hash(data);
      const hash2 = hash(data);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', () => {
      const hash1 = hash('Input 1');
      const hash2 = hash('Input 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should be deterministic', () => {
      const data = 'Deterministic test';
      const hashes = Array.from({ length: 10 }, () => hash(data));

      expect(new Set(hashes).size).toBe(1); // All hashes should be the same
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string encryption', () => {
      const encrypted = encrypt('', testPassword);
      const decrypted = decrypt(encrypted, testPassword);
      expect(decrypted.toString('utf-8')).toBe('');
    });

    it('should handle empty embedding encryption', () => {
      const embedding: number[] = [];
      const encryptedBuffer = encryptEmbedding(embedding, testPassword);
      const decrypted = decryptEmbedding(encryptedBuffer, testPassword);
      expect(decrypted).toEqual(embedding);
    });

    it('should handle embedding with negative numbers', () => {
      const embedding = [-0.5, -0.1, 0, 0.1, 0.5];
      const encryptedBuffer = encryptEmbedding(embedding, testPassword);
      const decrypted = decryptEmbedding(encryptedBuffer, testPassword);
      expect(decrypted).toEqual(embedding);
    });

    it('should handle embedding with very small numbers', () => {
      const embedding = [0.000001, 0.000002, 0.000003];
      const encryptedBuffer = encryptEmbedding(embedding, testPassword);
      const decrypted = decryptEmbedding(encryptedBuffer, testPassword);
      expect(decrypted).toEqual(embedding);
    });

    it('should handle special characters in plaintext', () => {
      const plaintext = '🔐 Encryption test with emoji 中文 ñ à';
      const encrypted = encrypt(plaintext, testPassword);
      const decrypted = decrypt(encrypted, testPassword);
      expect(decrypted.toString('utf-8')).toBe(plaintext);
    });
  });
});
