import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { JsonObject } from "./types";

const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";
const DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe";

function textBlock(text: string): JsonObject {
  return { type: "text", text };
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "bin";
}

function playAudio(filePath: string): void {
  if (process.platform === "darwin") {
    const child = spawn("afplay", [filePath], { stdio: "ignore", detached: true });
    child.unref();
    return;
  }
  if (process.platform === "linux") {
    const child = spawn("sh", ["-lc", `command -v paplay >/dev/null && paplay "$1" || command -v aplay >/dev/null && aplay "$1"` , "sh", filePath], {
      stdio: "ignore",
      detached: true
    });
    child.unref();
  }
}

export class AudioService {
  constructor(private readonly dataDir: string) {}

  async speakToHuman(args: JsonObject = {}): Promise<JsonObject> {
    const text = String(args.text ?? "").trim();
    if (!text) throw new Error("speak_to_human requires text.");

    const provider = String(args.provider ?? "elevenlabs");
    const play = args.play !== false;
    if (provider === "system") {
      if (process.platform !== "darwin") {
        return { content: [textBlock("System speech is only implemented for macOS say(1)."), textBlock(text)] };
      }
      const voice = typeof args.system_voice === "string" ? args.system_voice : undefined;
      const sayArgs = voice ? ["-v", voice, text] : [text];
      spawn("say", sayArgs, { stdio: "ignore", detached: true }).unref();
      return { content: [textBlock("Spoke with macOS system speech."), textBlock(text)] };
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return {
        content: [
          textBlock("ElevenLabs is not configured. Set ELEVENLABS_API_KEY, or call speak_to_human with provider: system on macOS."),
          textBlock(text)
        ],
        configured: false
      };
    }

    const voiceId = String(args.voice_id ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVENLABS_VOICE_ID);
    const modelId = String(args.model_id ?? process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        accept: "audio/mpeg",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: typeof args.stability === "number" ? args.stability : 0.45,
          similarity_boost: typeof args.similarity_boost === "number" ? args.similarity_boost : 0.75
        }
      })
    });
    if (!response.ok) throw new Error(`ElevenLabs TTS failed: ${response.status} ${await response.text()}`);

    const audio = Buffer.from(await response.arrayBuffer());
    const artifact = this.writeAudioScratch("speech", "audio/mpeg", audio);
    if (play && typeof artifact.absolute_path === "string") playAudio(artifact.absolute_path);
    return {
      content: [textBlock(play ? "Spoke to the human and saved an audio artifact." : "Saved an audio artifact without playback."), textBlock(text)],
      audio: artifact,
      configured: true
    };
  }

  async listenToHuman(args: JsonObject = {}): Promise<JsonObject> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("listen_to_human requires OPENAI_API_KEY.");

    const audioPath = typeof args.audio_path === "string" ? args.audio_path : undefined;
    const audioBase64 = typeof args.audio_base64 === "string" ? args.audio_base64 : undefined;
    const mimeType = String(args.mime_type ?? "audio/webm");
    if (!audioPath && !audioBase64) throw new Error("listen_to_human requires audio_path or audio_base64.");

    let filePath = audioPath ? path.resolve(audioPath) : "";
    if (audioBase64) {
      const ext = extensionForMime(mimeType);
      const scratch = path.join(os.tmpdir(), `chem0-hearing-${Date.now()}.${ext}`);
      fs.writeFileSync(scratch, Buffer.from(audioBase64, "base64"));
      filePath = scratch;
    }
    const model = String(args.model ?? process.env.OPENAI_STT_MODEL ?? DEFAULT_STT_MODEL);
    const form = new FormData();
    form.set("model", model);
    form.set("file", new Blob([fs.readFileSync(filePath)], { type: mimeType }), path.basename(filePath));
    if (typeof args.language === "string") form.set("language", args.language);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form
    });
    if (!response.ok) throw new Error(`OpenAI transcription failed: ${response.status} ${await response.text()}`);
    const result = (await response.json()) as { text?: string };
    const text = String(result.text ?? "").trim();
    return { content: [textBlock(text || "(no speech recognized)")], text, model };
  }

  private writeAudioScratch(prefix: string, mimeType: string, data: Buffer): JsonObject {
    const ext = extensionForMime(mimeType);
    const dir = path.join(this.dataDir, "audio");
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `${prefix}-${Date.now()}.${ext}`;
    const absolutePath = path.join(dir, fileName);
    fs.writeFileSync(absolutePath, data);
    return {
      mime_type: mimeType,
      relative_path: path.join("audio", fileName),
      absolute_path: absolutePath,
      bytes: data.length
    };
  }
}
