import type { SidebarState } from "../ws";
import { asrProviders, GEMMA_VAD_DEFAULTS, WHISPER_MODELS, type AsrProviderId } from "../asr";
import type { Capture } from "../useCapture";

/** Where each engine sends your audio — surfaced so participants can pick a private path. */
const PRIVACY: Record<AsrProviderId, { tone: "cloud" | "private"; note: string }> = {
  webspeech: { tone: "cloud", note: "Google" },
  elevenlabs: { tone: "cloud", note: "ElevenLabs" },
  "gemma-local": { tone: "private", note: "host GPU" },
  "whisper-webgpu": { tone: "private", note: "your GPU" },
};

const LANGS: { code: string; label: string }[] = [
  { code: "auto", label: "Auto" },
  { code: "en-US", label: "English" },
  { code: "pt-BR", label: "Português" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "it-IT", label: "Italiano" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文" },
];

/** The shared bottom bar — every participant's own mic controls (host and guests alike). */
export function ParticipantBar({ cap, state }: { cap: Capture; state: SidebarState }) {
  const providers = asrProviders();
  const self = state.presence.find((p) => p.id === state.selfId);
  const priv = PRIVACY[cap.engine];
  const usesVad = cap.engine === "gemma-local" || cap.engine === "whisper-webgpu"; // engines with the client energy VAD
  return (
    <footer className="micBar">
      <div className="micGroup">
        {self ? (
          <span className="micWho">
            <i style={{ background: self.color }} /> {self.name}
          </span>
        ) : null}
        <select
          className="asrSelect"
          value={cap.engine}
          disabled={cap.speechOn}
          onChange={(e) => cap.setEngine(e.target.value as AsrProviderId)}
          aria-label="Speech-to-text engine"
          title="Speech-to-text engine"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.available}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="asrSelect"
          value={cap.lang}
          disabled={cap.speechOn}
          onChange={(e) => cap.setLang(e.target.value)}
          aria-label="Spoken language"
          title={cap.engine === "webspeech" ? "Web Speech can't auto-detect — set your spoken language" : "Spoken language (Auto = let the engine detect)"}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {cap.engine === "whisper-webgpu" ? (
          <select
            className="asrSelect"
            value={cap.whisperModel}
            disabled={cap.speechOn}
            onChange={(e) => cap.setWhisperModel(e.target.value)}
            aria-label="Whisper model"
            title="Bigger = more accurate (esp. multilingual), but a larger one-time download and a stronger GPU"
          >
            {WHISPER_MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({m.size})
              </option>
            ))}
          </select>
        ) : null}
        <span className={"micPriv " + priv.tone} title={priv.tone === "private" ? "audio stays on the host" : `audio goes to ${priv.note}`}>
          {priv.tone === "private" ? "● private" : "● cloud"} · {priv.note}
        </span>
        {usesVad ? (
          <button className={"capBtn" + (cap.showVad ? " on" : "")} onClick={() => cap.setShowVad(!cap.showVad)} title="Noise floor + segmentation">
            Noise floor
          </button>
        ) : null}
      </div>

      <div className="micCenter">
        {!cap.speechOn ? (
          <button className="micJoin" onClick={() => void cap.start()}>
            &#127908; Join audio
          </button>
        ) : cap.mode === "ptt" ? (
          <button
            className={"micTalk" + (cap.talking ? " live" : "")}
            onPointerDown={(e) => {
              e.preventDefault();
              cap.pttDown();
            }}
            onPointerUp={() => cap.pttUp()}
            onPointerLeave={() => cap.pttUp()}
            title="Hold to talk (or hold Space)"
          >
            {cap.talking ? "● talking…" : "Hold to talk"}
          </button>
        ) : (
          <span className="micLive on">&#9679; live</span>
        )}
        {cap.speechOn ? (
          <span className="micMeter" title="Mic level">
            <span className="micMeterBar">
              <i style={{ width: Math.min(100, Math.round(cap.level * 320)) + "%" }} />
            </span>
          </span>
        ) : null}
        {cap.speechOn ? (
          <button className="capBtn stop" onClick={() => cap.stop()}>
            Leave audio
          </button>
        ) : null}
      </div>

      <div className="micGroup">
        <div className="micMode" role="group" aria-label="Mic mode">
          <button className={cap.mode === "open" ? "on" : ""} onClick={() => cap.setMode("open")} title="Open mic (VAD)">
            Open mic
          </button>
          <button className={cap.mode === "ptt" ? "on" : ""} onClick={() => cap.setMode("ptt")} title="Push-to-talk (hold Space)">
            Push-to-talk
          </button>
        </div>
        {cap.status ? <span className="micStatus">{cap.status}</span> : null}
        {cap.error ? <span className="capError">{cap.error}</span> : null}
      </div>

      {usesVad && cap.showVad ? (
        <div className="vadPanel up">
          <div className="vadHead">
            <span>noise floor + segmentation</span>
            <button className="vadReset" onClick={() => cap.setVad({ ...GEMMA_VAD_DEFAULTS })}>
              reset
            </button>
          </div>
          <label className="vadRow">
            <span>noise floor</span>
            <input type="range" min={4} max={80} step={1} value={Math.round(cap.vad.startRms * 1000)} onChange={(e) => cap.setVad({ startRms: +e.target.value / 1000 })} />
            <b>{cap.vad.startRms.toFixed(3)}</b>
          </label>
          <div className={"vadCal" + (cap.level > cap.vad.startRms ? " hot" : "")}>
            mic now {cap.level.toFixed(3)} — {cap.level > cap.vad.startRms ? "▲ above floor (captures)" : "below floor (ignored)"}
          </div>
          <label className="vadRow">
            <span>finalize silence</span>
            <input type="range" min={150} max={1500} step={50} value={cap.vad.silenceMs} onChange={(e) => cap.setVad({ silenceMs: +e.target.value })} />
            <b>{cap.vad.silenceMs}ms</b>
          </label>
          <label className="vadRow">
            <span>max segment</span>
            <input type="range" min={2000} max={15000} step={500} value={cap.vad.maxUtterMs} onChange={(e) => cap.setVad({ maxUtterMs: +e.target.value })} />
            <b>{(cap.vad.maxUtterMs / 1000).toFixed(1)}s</b>
          </label>
          <div className="vadMetric">
            {cap.metric
              ? `last: ${(cap.metric.segmentMs / 1000).toFixed(1)}s seg · ${Math.round(cap.metric.transcribeMs)}ms · ~${((cap.vad.silenceMs + cap.metric.transcribeMs) / 1000).toFixed(1)}s to appear`
              : "speak to measure…"}
          </div>
        </div>
      ) : null}
    </footer>
  );
}
