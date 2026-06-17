import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// ─────────────────────────────────────────────
//  Embeddings locales (sin API key ni coste): un modelo multilingüe corre en
//  Node vía transformers.js (onnxruntime-node). Se usa para sugerir artículos
//  de la KB relevantes a un ticket por similitud semántica.
//  OJO: la primera invocación descarga el modelo (~120 MB) y lo cachea.
// ─────────────────────────────────────────────

export const EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const EMBEDDING_DIMS = 384;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

// Carga perezosa y única del pipeline (el modelo es pesado: se reutiliza).
function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractorPromise;
}

// Vector semántico normalizado de un texto (mean pooling + L2 normalize).
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array, (v) => Number(v));
}
