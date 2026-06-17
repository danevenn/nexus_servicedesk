import type { FeatureExtractionPipeline } from "@huggingface/transformers";

// ─────────────────────────────────────────────
//  Embeddings locales (sin API key ni coste): un modelo multilingüe corre en
//  Node vía transformers.js (onnxruntime-node). Se usa para sugerir artículos
//  de la KB relevantes a un ticket por similitud semántica.
//  OJO: la primera invocación descarga el modelo (~120 MB) y lo cachea.
//
//  El paquete `@huggingface/transformers` se carga con import() DINÁMICO, no
//  estático: en entornos donde el binario nativo (onnxruntime-node) no puede
//  cargarse — p. ej. el runtime serverless de Vercel— el error queda confinado
//  a embed() (lo captura safeEmbed en la capa de KB y degrada a "sin
//  sugerencias"), en lugar de fallar al importar el módulo y tumbar con un 500
//  cualquier página que dependa de la KB (como la ficha de ticket).
// ─────────────────────────────────────────────

export const EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const EMBEDDING_DIMS = 384;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

// Carga perezosa y única del pipeline (el modelo es pesado: se reutiliza). Si
// la carga falla, se descarta la promesa para poder reintentar en la próxima
// llamada en vez de quedar cacheado un fallo permanente.
function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = import("@huggingface/transformers")
      .then(({ pipeline }) => pipeline("feature-extraction", EMBEDDING_MODEL))
      .catch((e) => {
        extractorPromise = null;
        throw e;
      });
  }
  return extractorPromise;
}

// Vector semántico normalizado de un texto (mean pooling + L2 normalize).
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array, (v) => Number(v));
}
