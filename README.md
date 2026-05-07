# end-of-turn-sound

A Pi tool extension that plays a sound when a turn finishes and control returns to the human.

![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Pi Extension](https://img.shields.io/badge/pi--extension-orange?style=flat-square)

## Features

- 🔔 Plays a completion sound on `agent_end` for human-started runs
- ⛔ Skips the sound for aborted runs
- 💥 Plays a separate error sound when the run ends in error
- 🎧 Uses the first available local audio player (`paplay`, `ffplay`, `play`, `afplay`, `aplay`)
- ⚙️ Supports environment variables, project config, home config, and volume overrides
- 📦 Ships with bundled sounds: `job_is_done.mp3` and `oh_nyo.mp3`
- 🧩 Small single-file TypeScript extension

## Tools / Commands

| Kind | Provided behavior |
| --- | --- |
| Tool extension | Listens for `agent_end` and plays a sound asynchronously |

## Quick Start

### Install locally

```bash
pi install /path/to/end-of-turn-sound
```

### First use

No extra setup is required. After installation, the extension plays the bundled `job_is_done.mp3` when a run finishes successfully.

If the run ends in error, it plays `oh_nyo.mp3`. Aborted runs do not play any sound.

## Configuration

The extension resolves sounds in this order:

### Success sound

1. `END_OF_TURN_SOUND`
2. `.pi/end-of-turn-sound.json` in the current project
3. `~/.pi/end-of-turn-sound.json`
4. bundled `job_is_done.mp3`

### Error sound

1. `ERROR_END_OF_TURN_SOUND`
2. `.pi/end-of-turn-sound.json` in the current project
3. `~/.pi/end-of-turn-sound.json`
4. bundled `oh_nyo.mp3`

Volume is optional and uses two levels:

- `masterVolume`: global multiplier for all sounds
- `successVolume` / `errorVolume`: per-sound multipliers

Effective volume = `masterVolume × perSoundVolume`.

Example project config (`.pi/end-of-turn-sound.json`):

```json
{
  "soundFile": "/path/to/custom-sound.mp3",
  "errorSoundFile": "/path/to/custom-error.mp3",
  "masterVolume": 0.8,
  "successVolume": 1.0,
  "errorVolume": 0.6
}
```

Example environment override:

```bash
export END_OF_TURN_SOUND="/path/to/custom-sound.mp3"
export ERROR_END_OF_TURN_SOUND="/path/to/custom-error.mp3"
```

### Audio player notes

- `paplay`, `ffplay`, `play`, and `afplay` can play the bundled MP3 files directly.
- Sound only plays when the run was started by a human (`interactive` or `rpc` input)
- `aplay` only works with WAV audio, so the extension uses `ffmpeg` to transcode bundled MP3s or volume-adjusted playback into a temporary WAV file when needed.
- If you rely on `aplay`, install `ffmpeg` too.

## Usage Examples

### Use the bundled sounds

Install the extension and do nothing else.

### Use a custom project sound

```json
{
  "soundFile": "/home/me/sounds/done.wav",
  "errorSoundFile": "/home/me/sounds/error.wav"
}
```

Save it as `.pi/end-of-turn-sound.json` in your project root.

### Use a custom global sound

```json
{
  "soundFile": "/home/me/sounds/done.mp3",
  "errorSoundFile": "/home/me/sounds/error.mp3"
}
```

Save it as `~/.pi/end-of-turn-sound.json`.

### Tune volume

```json
{
  "masterVolume": 0.75,
  "successVolume": 1,
  "errorVolume": 0.5
}
```

This lowers all sounds globally while keeping the error sound quieter than success.

## Development

### Prerequisites

- Node.js 22+
- TypeScript 6.x
- Pi CLI

### Setup

```bash
npm install
```

### Validate

```bash
npm run validate
```

### Notes

- Entrypoint: `extension-end-of-turn-sound.ts`
- ESM module (`"type": "module"`)
- Bundled audio files live in the extension root
- The TypeScript config only includes the entrypoint file, so validation stays fast

## Resources

- [Pi coding agent README](https://github.com/mariozechner/pi-coding-agent)
- [Pi extension examples](https://github.com/mariozechner/pi-coding-agent/tree/main/examples/extensions)
- [TypeScript handbook](https://www.typescriptlang.org/docs/)
