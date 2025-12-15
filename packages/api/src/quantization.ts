/**
 * Vector quantization utilities for embedding compression
 * Converts float32 embeddings to uint8 for 75% storage reduction
 */

export interface QuantizedVector {
  quantized: Uint8Array;
  min: number;
  max: number;
}

/**
 * Quantize a float32 embedding vector to uint8
 * Maps [min, max] range to [0, 255]
 * 
 * @param embedding - Original float32 embedding vector
 * @returns Quantized vector with min/max scale factors
 */
export function quantize(embedding: number[]): QuantizedVector {
  if (embedding.length === 0) {
    return {
      quantized: new Uint8Array(0),
      min: 0,
      max: 0,
    };
  }

  // Find min and max values for scaling
  let min = embedding[0];
  let max = embedding[0];
  
  for (let i = 1; i < embedding.length; i++) {
    if (embedding[i] < min) min = embedding[i];
    if (embedding[i] > max) max = embedding[i];
  }

  // Handle edge case where all values are the same
  const range = max - min;
  if (range === 0) {
    return {
      quantized: new Uint8Array(embedding.length).fill(128),
      min,
      max,
    };
  }

  // Scale to 0-255 range
  const quantized = new Uint8Array(embedding.length);
  for (let i = 0; i < embedding.length; i++) {
    const normalized = (embedding[i] - min) / range;
    quantized[i] = Math.round(normalized * 255);
  }

  return { quantized, min, max };
}

/**
 * Dequantize a uint8 vector back to approximate float32
 * Maps [0, 255] back to original [min, max] range
 * 
 * @param quantized - Quantized uint8 vector
 * @param min - Original minimum value
 * @param max - Original maximum value
 * @returns Approximate float32 embedding vector
 */
export function dequantize(quantized: Uint8Array, min: number, max: number): number[] {
  if (quantized.length === 0) {
    return [];
  }

  const range = max - min;
  if (range === 0) {
    return Array(quantized.length).fill(min);
  }

  const embedding = new Array(quantized.length);
  for (let i = 0; i < quantized.length; i++) {
    const normalized = quantized[i] / 255;
    embedding[i] = min + normalized * range;
  }

  return embedding;
}

/**
 * Serialize quantized vector to Buffer for database storage
 */
export function serializeQuantized(qv: QuantizedVector): Buffer {
  // Format: [min (8 bytes), max (8 bytes), quantized data]
  const buffer = Buffer.allocUnsafe(16 + qv.quantized.length);
  buffer.writeDoubleBE(qv.min, 0);
  buffer.writeDoubleBE(qv.max, 8);
  buffer.set(qv.quantized, 16);
  return buffer;
}

/**
 * Deserialize quantized vector from Buffer
 */
export function deserializeQuantized(buffer: Buffer): QuantizedVector {
  const min = buffer.readDoubleBE(0);
  const max = buffer.readDoubleBE(8);
  const quantized = new Uint8Array(buffer.slice(16));
  return { quantized, min, max };
}

/**
 * Calculate storage reduction percentage
 */
export function getStorageReduction(originalLength: number): number {
  const float32Size = originalLength * 4; // 4 bytes per float32
  const uint8Size = originalLength + 16; // 1 byte per uint8 + 16 bytes for min/max
  return ((float32Size - uint8Size) / float32Size) * 100;
}
