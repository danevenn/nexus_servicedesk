// ─────────────────────────────────────────────
//  Embeddings vía Hugging Face Inference API (gratis, sin tarjeta). Se usa el
//  MISMO modelo multilingüe con el que se vectorizaron los artículos de la KB
//  en el seed, así que los vectores son compatibles (384 dims) y no hace falta
//  re-vectorizar nada. No requiere binarios nativos: corre en el serverless de
//  Vercel con un simple fetch.
//
//  Autenticación: HF_TOKEN (token gratuito de huggingface.co/settings/tokens).
//
//  Se usa para sugerir artículos de la KB relevantes a un ticket por similitud
//  coseno. Si la API falla o tarda (cold start del modelo), el llamador en la
//  capa de KB (safeEmbed) lo captura y degrada a "sin sugerencias".
// ─────────────────────────────────────────────

export const EMBEDDING_MODEL =
  "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
export const EMBEDDING_DIMS = 384;

const HF_ENDPOINT = `https://router.huggingface.co/hf-inference/models/${EMBEDDING_MODEL}/pipeline/feature-extraction`;

// Vector semántico de un texto (la API de sentence-transformers ya aplica mean
// pooling y devuelve el embedding de la frase). Lanza ante cualquier fallo.
export async function embed(text: string): Promise<number[]> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Falta HF_TOKEN para generar embeddings.");

  const res = await fetch(HF_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });

  if (!res.ok) {
    throw new Error(`HF Inference ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as number[] | number[][];
  // Para una sola frase, sentence-transformers devuelve number[]. Si llegara
  // anidado (number[][]), se toma la primera fila.
  const vector = Array.isArray(data[0]) ? (data[0] as number[]) : (data as number[]);

  if (vector.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Embedding inesperado: ${vector.length} dims (esperadas ${EMBEDDING_DIMS}).`,
    );
  }
  return vector;
}
