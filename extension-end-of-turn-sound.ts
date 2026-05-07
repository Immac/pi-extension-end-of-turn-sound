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
  errorSoundFile: string;
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

    if (typeof config.errorSoundFile === "string") {
      result.errorSoundFile = config.errorSoundFile;
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
    errorSoundFile: ERROR_SOUND_FILE,
    masterVolume: 1,
    successVolume: 1,
    errorVolume: 1,
  };

  const projectConfig = readConfigFile(path.join(process.cwd(), ".pi", "end-of-turn-sound.json"));
  const homeConfig = readConfigFile(path.join(os.homedir(), ".pi", "end-of-turn-sound.json"));

  const envSoundFile = process.env.END_OF_TURN_SOUND;
  const envErrorSoundFile = process.env.ERROR_END_OF_TURN_SOUND;

  return {
    soundFile: envSoundFile ?? projectConfig.soundFile ?? homeConfig.soundFile ?? defaults.soundFile,
    errorSoundFile: envErrorSoundFile ?? projectConfig.errorSoundFile ?? homeConfig.errorSoundFile ?? defaults.errorSoundFile,
    masterVolume: projectConfig.masterVolume ?? homeConfig.masterVolume ?? defaults.masterVolume,
    successVolume: projectConfig.successVolume ?? homeConfig.successVolume ?? defaults.successVolume,
    errorVolume: projectConfig.errorVolume ?? homeConfig.errorVolume ?? defaults.errorVolume,
  };
}

const CONFIG = getConfiguredSoundConfig();

let pendingRunStartedByHuman = false;
let currentRunStartedByHuman = false;

function isHumanInputSource(source: string | undefined): boolean {
  return source === "interactive" || source === "rpc";
}

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

function buildTemporaryWavFile(soundFile: string, volume: number): string | null {
  if (!commandExists("ffmpeg")) return null;
  if (!fs.existsSync(soundFile)) return null;

  const tmpFile = path.join(
    os.tmpdir(),
    `end-of-turn-sound-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
  );

  const ffmpegArgs = ["-hide_banner", "-loglevel", "error", "-y", "-i", soundFile];
  if (volume !== 1) {
    ffmpegArgs.push("-filter:a", `volume=${volume}`);
  }
  ffmpegArgs.push(tmpFile);

  const result = spawnSync("ffmpeg", ffmpegArgs, { stdio: "ignore" });

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

function isWavFile(soundFile: string): boolean {
  return [".wav", ".wave"].includes(path.extname(soundFile).toLowerCase());
}

function prepareAplaySoundFile(soundFile: string, volume: number): string | null {
  if (volume === 1 && isWavFile(soundFile)) {
    return soundFile;
  }

  return buildTemporaryWavFile(soundFile, volume);
}

function findPlayer(soundFile: string, volume: number): { command: string; args: string[] } | null {
  if (volume !== 1) {
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
  } else {
    if (commandExists("paplay")) {
      return { command: "paplay", args: [soundFile] };
    }

    if (commandExists("ffplay")) {
      return { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "quiet", soundFile] };
    }

    if (commandExists("play")) {
      return { command: "play", args: ["-q", soundFile] };
    }

    if (commandExists("afplay")) {
      return { command: "afplay", args: [soundFile] };
    }
  }

  if (commandExists("aplay")) {
    const aplayFile = prepareAplaySoundFile(soundFile, volume);
    if (aplayFile) {
      return { command: "aplay", args: [aplayFile] };
    }
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
  // Track whether the current run was initiated by a human (interactive/RPC) or by an extension.
  // We snapshot the source at agent_start so mid-run extension injections don't retroactively change it.
  pi.on("input", async (event) => {
    if (isHumanInputSource(event.source)) {
      pendingRunStartedByHuman = true;
    } else {
      // Non-human input (source="extension") means the upcoming agent_start
      // is definitely not from a human. Clear any stale flag left over from
      // a previous human input that was handled without starting an agent.
      pendingRunStartedByHuman = false;
    }
  });

  pi.on("agent_start", async () => {
    currentRunStartedByHuman = pendingRunStartedByHuman;
    pendingRunStartedByHuman = false;
  });

  pi.on("agent_end", async (event) => {
    const outcome = getOutcome(event.messages);
    if (outcome === "aborted") return;
    if (!currentRunStartedByHuman) return;

    const soundFile = outcome === "error" ? CONFIG.errorSoundFile : CONFIG.soundFile;
    const volume = getEffectiveVolume(outcome === "error" ? "error" : "success");

    playSound(soundFile, volume);
    currentRunStartedByHuman = false;
  });
}
