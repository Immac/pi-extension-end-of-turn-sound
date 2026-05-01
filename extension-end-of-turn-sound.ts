import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getConfiguredSoundFile(): string {
  // 1. Check environment variable
  if (process.env.END_OF_TURN_SOUND) {
    return process.env.END_OF_TURN_SOUND;
  }

  // 2. Check config file in current working directory
  const projectConfigPath = path.join(process.cwd(), ".pi", "end-of-turn-sound.json");
  if (fs.existsSync(projectConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
      if (config.soundFile && typeof config.soundFile === "string") {
        return config.soundFile;
      }
    } catch {}
  }

  // 3. Check config file in home directory
  const homeConfigPath = path.join(os.homedir(), ".pi", "end-of-turn-sound.json");
  if (fs.existsSync(homeConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(homeConfigPath, "utf-8"));
      if (config.soundFile && typeof config.soundFile === "string") {
        return config.soundFile;
      }
    } catch {}
  }

  // 4. Default fallback - use bundled success sound file
  return path.join(__dirname, "job_is_done.mp3");
}

const SUCCESS_SOUND_FILE = getConfiguredSoundFile();
const ERROR_SOUND_FILE = path.join(__dirname, "oh_nyo.mp3");

function getOutcome(messages: { role: string; stopReason?: string }[]): "success" | "aborted" | "error" {
  if (messages.some((message) => message.role === "assistant" && message.stopReason === "error")) {
    return "error";
  }

  if (messages.some((message) => message.role === "assistant" && message.stopReason === "aborted")) {
    return "aborted";
  }

  return "success";
}

function findPlayer(soundFile: string): { command: string; args: string[] } | null {
  const candidates = [
    ["paplay", [soundFile]],
    ["aplay", [soundFile]],
    ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", soundFile]],
    ["play", ["-q", soundFile]],
    ["afplay", [soundFile]],
  ] as const;

  for (const [command, args] of candidates) {
    const result = spawnSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    if (result.status === 0) return { command, args: [...args] };
  }

  return null;
}

function playSound(soundFile: string): void {
  if (!fs.existsSync(soundFile)) return;

  const player = findPlayer(soundFile);
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
  // Skip sound on aborted runs, play an error sound on failures.
  pi.on("agent_end", async (event) => {
    const outcome = getOutcome(event.messages);
    if (outcome === "aborted") return;
    playSound(outcome === "error" ? ERROR_SOUND_FILE : SUCCESS_SOUND_FILE);
  });
}
