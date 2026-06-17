import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  rankBySimilarity,
} from "@/lib/services/embeddings-domain";

describe("cosineSimilarity", () => {
  it("vale 1 para vectores idénticos", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("vale 1 para vectores paralelos (misma dirección, distinta escala)", () => {
    expect(cosineSimilarity([1, 0], [3, 0])).toBeCloseTo(1, 6);
  });

  it("vale 0 para vectores ortogonales", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("vale -1 para vectores opuestos", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 6);
  });

  it("devuelve 0 ante vacíos, longitudes distintas o norma cero (sin NaN)", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("rankBySimilarity", () => {
  const query = [1, 0, 0];
  const items = [
    { slug: "ortogonal", embedding: [0, 1, 0] },
    { slug: "igual", embedding: [1, 0, 0] },
    { slug: "parecido", embedding: [0.8, 0.2, 0] },
    { slug: "opuesto", embedding: [-1, 0, 0] },
  ];

  it("ordena de mayor a menor similitud y limita el número de resultados", () => {
    const top = rankBySimilarity(query, items, { limit: 2 });
    expect(top.map((t) => t.slug)).toEqual(["igual", "parecido"]);
    expect(top[0].score).toBeGreaterThan(top[1].score);
  });

  it("filtra por minScore (descarta ortogonales y opuestos)", () => {
    const top = rankBySimilarity(query, items, { limit: 10, minScore: 0.25 });
    expect(top.map((t) => t.slug)).toEqual(["igual", "parecido"]);
  });

  it("ignora candidatos sin embedding", () => {
    const top = rankBySimilarity(query, [{ slug: "vacío", embedding: [] }], {
      limit: 3,
    });
    expect(top).toHaveLength(0);
  });
});
