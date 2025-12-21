/**
 * Confidence scoring system for cache matches - Public Version
 * 
 * This is a simplified version for the open source edition.
 * Provides basic multi-factor confidence scoring.
 * 
 * Note: Advanced confidence algorithms with user feedback loops,
 * contextual adjustments, and proprietary weighting are available
 * in the enterprise version.
 */

export enum CacheLayer {
  EXACT_MATCH = 'exact_match',
  NORMALIZED_MATCH = 'normalized_match',
  SEMANTIC_MATCH = 'semantic_match',
  NO_MATCH = 'no_match',
}

export enum ConfidenceLevel {
  VERY_HIGH = 'very_high',  // 0.95 - 1.0
  HIGH = 'high',            // 0.85 - 0.95
  MEDIUM = 'medium',        // 0.70 - 0.85
  LOW = 'low',              // 0.50 - 0.70
  VERY_LOW = 'very_low',    // < 0.50
}

export interface ConfidenceScore {
  score: number;           // 0.0 - 1.0
  level: ConfidenceLevel;
  layer: CacheLayer;
  factors: {
    similarityScore: number;
    cacheLayer: string;
    queryComplexity: number;
    cacheAge?: number;      // How old is the cached entry (hours)
    hitFrequency?: number;  // How often this entry has been hit
  };
  explanation: string;
}

/**
 * Calculate confidence score for a cache match (simplified public version)
 * 
 * Note: Enterprise version includes advanced multi-factor weighting,
 * user feedback integration, and contextual confidence adjustments
 * using proprietary algorithms.
 */
export function calculateConfidence(
  similarityScore: number,
  cacheLayer: CacheLayer,
  queryLength: number,
  cacheAgeHours?: number,
  hitFrequency?: number
): ConfidenceScore {
  let score = similarityScore;
  
  // Layer boost: exact matches are always highly confident
  if (cacheLayer === CacheLayer.EXACT_MATCH) {
    score = 1.0;
  } else if (cacheLayer === CacheLayer.NORMALIZED_MATCH) {
    score = Math.min(0.98, similarityScore + 0.05);
  }
  
  // Simplified scoring (public version)
  // Enterprise version uses proprietary multi-dimensional analysis
  const complexityPenalty = queryLength > 50 ? 0.05 : 0;
  score = Math.max(0, score - complexityPenalty);
  
  // Basic age and frequency adjustments
  // Enterprise version uses advanced decay functions
  if (cacheAgeHours !== undefined) {
    const agePenalty = Math.min(0.1, cacheAgeHours / 720);
    score = Math.max(0, score - agePenalty);
  }
  
  if (hitFrequency !== undefined && hitFrequency > 10) {
    const frequencyBoost = Math.min(0.05, Math.log10(hitFrequency) * 0.02);
    score = Math.min(1.0, score + frequencyBoost);
  }
  
  const level = getConfidenceLevel(score);
  const explanation = generateExplanation(score, cacheLayer, queryLength, cacheAgeHours, hitFrequency);
  
  return {
    score: Math.round(score * 1000) / 1000, // Round to 3 decimals
    level,
    layer: cacheLayer,
    factors: {
      similarityScore,
      cacheLayer,
      queryComplexity: queryLength,
      cacheAge: cacheAgeHours,
      hitFrequency,
    },
    explanation,
  };
}

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.95) return ConfidenceLevel.VERY_HIGH;
  if (score >= 0.85) return ConfidenceLevel.HIGH;
  if (score >= 0.70) return ConfidenceLevel.MEDIUM;
  if (score >= 0.50) return ConfidenceLevel.LOW;
  return ConfidenceLevel.VERY_LOW;
}

function generateExplanation(
  score: number,
  layer: CacheLayer,
  queryLength: number,
  ageHours?: number,
  frequency?: number
): string {
  const parts: string[] = [];
  
  // Layer explanation
  if (layer === CacheLayer.EXACT_MATCH) {
    parts.push('Exact string match');
  } else if (layer === CacheLayer.NORMALIZED_MATCH) {
    parts.push('Normalized query match');
  } else if (layer === CacheLayer.SEMANTIC_MATCH) {
    parts.push(`Semantic match (${Math.round(score * 100)}% similar)`);
  }
  
  // Complexity
  if (queryLength > 50) {
    parts.push('complex query');
  }
  
  // Age
  if (ageHours !== undefined) {
    if (ageHours < 1) {
      parts.push('very recent');
    } else if (ageHours < 24) {
      parts.push('recent');
    } else if (ageHours < 168) {
      parts.push('from this week');
    } else {
      parts.push(`${Math.round(ageHours / 24)} days old`);
    }
  }
  
  // Frequency
  if (frequency !== undefined && frequency > 10) {
    parts.push(`popular (${frequency} hits)`);
  }
  
  return parts.join(', ');
}

/**
 * Determine if confidence is high enough to use cached response
 */
export function shouldUseCache(confidence: ConfidenceScore, minConfidence: number = 0.85): boolean {
  return confidence.score >= minConfidence;
}

/**
 * Calculate recommended threshold based on query characteristics
 */
export function getRecommendedThreshold(
  queryLength: number,
  queryType: 'question' | 'statement' | 'command' | 'unknown' = 'unknown'
): number {
  let threshold = 0.85; // Default
  
  // Shorter queries need higher similarity (more ambiguous)
  if (queryLength < 10) {
    threshold = 0.90;
  } else if (queryLength > 50) {
    threshold = 0.80; // Longer queries can tolerate more variation
  }
  
  // Questions should be more strict (seeking specific answers)
  if (queryType === 'question') {
    threshold += 0.03;
  }
  
  // Commands can be more lenient (action-oriented)
  if (queryType === 'command') {
    threshold -= 0.03;
  }
  
  return Math.min(0.95, Math.max(0.75, threshold));
}
