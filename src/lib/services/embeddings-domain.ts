// ─────────────────────────────────────────────
//  Similitud semántica — lógica pura (sin modelo ni BD), testeable.
// ─────────────────────────────────────────────

// Similitud coseno entre dos vectores. Devuelve 0 si algún vector está vacío,
// tiene longitudes distintas, o tiene norma cero (evita NaN).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Rankea candidatos por similitud al vector de consulta y devuelve los `limit`
// más parecidos por encima de `minScore`, cada uno con su puntuación [0..1].
export function rankBySimilarity<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  { limit = 3, minScore = 0 }: { limit?: number; minScore?: number } = {},
): (T & { score: number })[] {
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(query, item.embedding) }))
    .filter((item) => item.score > minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
