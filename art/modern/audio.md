# Generated sound pack: experimental slice

The browser plays saved MP3 recordings through the existing WebAudio mixer.
`src/audio/samples.ts` downloads the eight small files before the menu becomes
interactive; `AudioEngine.unlock()` decodes them after the player gesture that
unlocks iOS audio. No Runway credentials or remote services are used by players.

The pack replaces pistol shots (two alternating variations), the shotgun shot,
door opening, the metal thump of a denied door, husk alert/pain, and the ambient
bed. Combat timing and the simulation are unchanged. Other weapons, species,
UI feedback and the husk death vocal still use the original synthesizer. Runway
rejected the death-vocal prompt at input moderation, so no file exists for it.

`audio-provenance.json` records the prompts and generation task IDs. The pack
submitted 19 new included credits, plus the earlier 1-credit impact test. The
last submission reported 480 credits remaining on the Free plan; no trial,
payment method, upgrade or purchase was used. The rejected task may be refunded
by the provider; this record makes no assumption about that.

Unmodified downloads are preserved in `audio-sources/`. To regenerate the local
delivery encodes using Python and FFmpeg:

```bash
python3 art/modern/audio-prepare.py
```

The script downmixes to mono 44.1 kHz, trims measured leading silence, normalizes
peaks to -3 dBFS, fades one-shot tails over 30 ms, and makes a 250 ms crossfade at
the ambient loop seam. It writes 112 kbps MP3 files under `public/modern/audio/`
and a checksum/measurement report in `audio-processing.json`. The ambient loop
is 7.75 seconds after seam preparation. Runtime volume is mixed below unity,
with ambience deliberately quieter than combat. The existing compressor,
master volume, mute behavior and arena local-voice reserve still apply.

All source and delivery files were decoded successfully with FFmpeg. Automated
tests verify sample voice limits and distance gain, ambient start/stop/restart
cleanup, and recovery from failed file downloads. A browser test confirms all
eight recordings decode after a user gesture, a pistol shot uses a decoded
buffer, and the ambient loop stops on leaving a run and restarts only once.
The pause menu keeps ambience playing, matching the original behavior.
Subjective sound and mix quality should be reviewed in the playable preview.
