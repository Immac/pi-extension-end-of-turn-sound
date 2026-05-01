import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUCCESS_SOUND_FALLBACK = path.join(__dirname, "job_is_done.mp3");
const ERROR_SOUND_FILE = path.join(__dirname, "oh_nyo.mp3");

type SoundKind = "success" | "error";

type SoundConfig = {
  soundFile: string;
  masterVolume: number;
  successVolume: number;
  errorVolume: number;
};

function commandExists(command: string): boolean {
  return spawnSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function readConfigFile(configPath: string): Partial<SoundConfig> {
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const config = raw as Record<string, unknown>;
    const result: Partial<SoundConfig> = {};

    if (typeof config.soundFile === "string") {
      result.soundFile = config.soundFile;
    }

    if (typeof config.masterVolume === "number") {
      result.masterVolume = clampVolume(config.masterVolume, 1);
    }

    if (typeof config.successVolume === "number") {
      result.successVolume = clampVolume(config.successVolume, 1);
    }

    if (typeof config.errorVolume === "number") {
      result.errorVolume = clampVolume(config.errorVolume, 1);
    }

    return result;
  } catch {
    return {};
  }
}

function getConfiguredSoundConfig(): SoundConfig {
  const defaults: SoundConfig = {
    soundFile: SUCCESS_SOUND_FALLBACK,
    masterVolume: 1,
    successVolume: 1,
    errorVolume: 1,
  };

  const projectConfig = readConfigFile(path.join(process.cwd(), ".pi", "end-of-turn-sound.json"));
  const homeConfig = readConfigFile(path.join(os.homedir(), ".pi", "end-of-turn-sound.json"));

  const envSoundFile = process.env.END_OF_TURN_SOUND;

  return {
    soundFile: envSoundFile ?? projectConfig.soundFile ?? homeConfig.soundFile ?? defaults.soundFile,
    masterVolume: projectConfig.masterVolume ?? homeConfig.masterVolume ?? defaults.masterVolume,
    successVolume: projectConfig.successVolume ?? homeConfig.successVolume ?? defaults.successVolume,
    errorVolume: projectConfig.errorVolume ?? homeConfig.errorVolume ?? defaults.errorVolume,
  };
}

const CONFIG = getConfiguredSoundConfig();

function getOutcome(messages: { role: string; stopReason?: string }[]): SoundKind | "aborted" {
  if (messages.some((message) => message.role === "assistant" && message.stopReason === "error")) {
    return "error";
  }

  if (messages.some((message) => message.role === "assistant" && message.stopReason === "aborted")) {
    return "aborted";
  }

  return "success";
}

function getEffectiveVolume(kind: SoundKind): number {
  const fineGrained = kind === "error" ? CONFIG.errorVolume : CONFIG.successVolume;
  return clampVolume(CONFIG.masterVolume * fineGrained, 1);
}

function buildVolumeAdjustedFile(soundFile: string, volume: number): string | null {
  if (volume === 1) return soundFile;
  if (!commandExists("ffmpeg")) return null;
  if (!fs.existsSync(soundFile)) return null;

  const tmpFile = path.join(
    os.tmpdir(),
    `end-of-turn-sound-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
  );

  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", soundFile, "-filter:a", `volume=${volume}`, tmpFile],
    { stdio: "ignore" },
  );

  if (result.status !== 0) {
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch {}
    return null;
  }

  const cleanup = setTimeout(() => {
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch {}
  }, 10 * 60 * 1000);
  cleanup.unref();

  return tmpFile;
}

function findPlayer(soundFile: string, volume: number): { command: string; args: string[] } | null {
  const supportsDirectVolume = volume !== 1;

  if (supportsDirectVolume) {
    if (commandExists("paplay")) {
      return { command: "paplay", args: [`--volume=${Math.round(volume * 65536)}`, soundFile] };
    }

    if (commandExists("ffplay")) {
      return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", String(Math.round(volume * 100)), soundFile] };
    }

    if (commandExists("play")) {
      return { command: "play", args: ["-q", "-v", String(volume), soundFile] };
    }

    if (commandExists("afplay")) {
      return { command: "afplay", args: ["-v", String(volume), soundFile] };
    }

    if (commandExists("aplay")) {
      const adjustedFile = buildVolumeAdjustedFile(soundFile, volume);
      if (adjustedFile) {
        return { command: "aplay", args: [adjustedFile] };
      }
    }

    return null;
  }

  const candidates = [
    ["paplay", [soundFile]],
    ["aplay", [soundFile]],
    ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", soundFile]],
    ["play", ["-q", soundFile]],
    ["afplay", [soundFile]],
  ] as const;

  for (const [command, args] of candidates) {
    if (commandExists(command)) return { command, args: [...args] };
  }

  return null;
}

function playSound(soundFile: string, volume: number): void {
  if (!fs.existsSync(soundFile)) return;

  const player = findPlayer(soundFile, volume);
  if (!player) return;

  const proc = spawn(player.command, player.args, {
    stdio: "ignore",
    detached: true,
    shell: false,
  });
  proc.unref();
}

export default function (pi: ExtensionAPI) {
  // agent_end fires once per user prompt, after all turns/tool work is complete.
  // Skip sound on aborted runs; errors get a different sound.
  pi.on("agent_end", async (event) => {
    const outcome = getOutcome(event.messages);
    if (outcome === "aborted") return;

    const soundFile = outcome === "error" ? ERROR_SOUND_FILE : CONFIG.soundFile;
    const volume = getEffectiveVolume(outcome === "error" ? "error" : "success");

    playSound(soundFile, volume);
  });
}
