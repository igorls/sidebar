/**
 * Module Web Worker: holds a singleton Whisper pipeline (transformers.js + WebGPU)
 * so the ~200MB model download, WebGPU shader compile, and every decode run off the
 * React thread. Protocol:
 *   IN  { type:"load" } | { type:"generate", audio:Float32Array@16kHz, lang?, id }
 *   OUT { type:"progress", data } | { type:"ready" } |
 *       { type:"result", id, text, transcribeMs } | { type:"error", id?, message }
 */
import { pipeline, env } from "@huggingface/transformers";

// Multilingual base (NO ".en"). Decoder MUST be q4 — q8/int8 = gibberish on WebGPU.
const MODEL_ID = "onnx-community/whisper-base";

const LANG_TO_WHISPER: Record<string, string> = {
  en: "english",
  pt: "portuguese",
  es: "spanish",
  fr: "french",
  de: "german",
  it: "italian",
  ja: "japanese",
  zh: "chinese",
};

type Transcriber = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text?: string } | { text?: string }[]>;
let transcriber: Transcriber | null = null;

const ctx = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };
// Loose-typed handles — the lib's option types vary across versions; we drive it by docs.
const makePipeline = pipeline as unknown as (task: string, model: string, opts: Record<string, unknown>) => Promise<Transcriber>;
const cfg = env as unknown as { allowLocalModels: boolean; allowRemoteModels: boolean };
cfg.allowLocalModels = false;
cfg.allowRemoteModels = true;

async function getPipeline(progress?: (x: unknown) => void): Promise<Transcriber> {
  transcriber ??= await makePipeline("automatic-speech-recognition", MODEL_ID, {
    device: "webgpu",
    dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
    progress_callback: progress,
  });
  return transcriber;
}

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; audio?: Float32Array; lang?: string; id?: number };
  if (msg.type === "load") {
    try {
      const p = await getPipeline((x) => ctx.postMessage({ type: "progress", data: x }));
      await p(new Float32Array(16000), { task: "transcribe", chunk_length_s: 30 }); // warm WebGPU shaders
      ctx.postMessage({ type: "ready" });
    } catch (err) {
      ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === "generate" && msg.audio) {
    try {
      const t0 = performance.now();
      const base = msg.lang ? msg.lang.split("-")[0]! : undefined;
      const language = base ? LANG_TO_WHISPER[base] : undefined;
      const out = await (await getPipeline())(msg.audio, {
        language,
        task: "transcribe",
        return_timestamps: false,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const text = (Array.isArray(out) ? out[0]?.text : out.text) ?? "";
      ctx.postMessage({ type: "result", id: msg.id, text: text.trim(), transcribeMs: performance.now() - t0 });
    } catch (err) {
      ctx.postMessage({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
};
