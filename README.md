# end-of-turn-sound

A Pi tool extension that plays a completion sound when a turn finishes and control returns to the human.

![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-blue?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Pi Extension](https://img.shields.io/badge/pi--extension-orange?style=flat-square)

## Features

- 🔔 Plays a sound on `agent_end` after all tool work is complete
- ⛔ Skips the sound when the run was aborted
- 💥 Plays `oh_nyo.mp3` when the run ends in error
- 🎧 Uses the first available local audio player (`paplay`, `aplay`, `ffplay`, `play`, `afplay`)
- ⚙️ Supports overrides via environment variable, Pi config files, and volume controls
- 📦 Ships with bundled sounds: `job_is_done.mp3` and `oh_nyo.mp3`
- 🧱 Small, single-file TypeScript extension

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

No extra setup is required. When a Pi turn ends successfully, the bundled `job_is_done.mp3` is played automatically if no custom sound is configured. Aborted runs do not play the sound. Errors play the bundled `oh_nyo.mp3`.

## Configuration

The extension resolves the success sound file in this order:

1. `END_OF_TURN_SOUND`
2. `.pi/end-of-turn-sound.json` in the current project
3. `~/.pi/end-of-turn-sound.json`
4. bundled `job_is_done.mp3`

Errors always use the bundled `oh_nyo.mp3`.

Volume settings are optional and use two levels:

- `masterVolume`: global multiplier for all sounds
- `successVolume` / `errorVolume`: per-sound multipliers

Effective volume = `masterVolume × perSoundVolume`.

Example project config (`.pi/end-of-turn-sound.json`):

```json
{
  "soundFile": "/path/to/custom-sound.mp3",
  "masterVolume": 0.8,
  "successVolume": 1.0,
  "errorVolume": 0.6
}
```

Example global config (`~/.pi/end-of-turn-sound.json`):

```json
{
  "soundFile": "/home/me/sounds/custom-done.wav",
  "masterVolume": 0.75,
  "successVolume": 1,
  "errorVolume": 0.5
}
```

Example environment override:

```bash
export END_OF_TURN_SOUND="/path/to/custom-sound.mp3"
```

## Usage Examples

### Use the bundled sound

Just install the extension and keep the default behavior.

### Use a custom project sound

```json
{
  "soundFile": "/home/me/sounds/done.wav"
}
```

Save it as `.pi/end-of-turn-sound.json` in your project root.

### Use a custom global sound

```json
{
  "soundFile": "/home/me/sounds/done.mp3"
}
```

Save it as `~/.pi/end-of-turn-sound.json`.

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

- The entrypoint is `extension-end-of-turn-sound.ts`
- The bundled audio file is `job_is_done.mp3` in the extension root
- The extension is ESM (`"type": "module"`), so it resolves bundled assets with `import.meta.url`

## Resources

- [Pi coding agent README](https://github.com/mariozechner/pi-coding-agent)
- [Pi extension examples](https://github.com/mariozechner/pi-coding-agent/tree/main/examples/extensions)
- [TypeScript handbook](https://www.typescriptlang.org/docs/)
