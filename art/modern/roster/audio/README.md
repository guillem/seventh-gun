# Generated sound roster

Twenty-one original sound effects were generated using the connected Runway free
workspace's included credits. No subscription, card, or additional purchase was
used. `prompts.json` preserves the complete prompts; `tasks.json` records task
identities and completion without temporary download tokens or provider UI data.
The original downloaded MP3 recordings are retained unchanged in `sources/`.

`tools/modern-art/prepare_roster_audio.py` prepares 32 runtime MP3 files:

- Five remaining weapons: chaingun, spiker, bile launcher, sunlance and seventh.
- Five creature recordings: crawler, slab, wisp, hierophant and fiend.
- Ten pain/death edits derived from those recordings, plus a husk death edit
  derived from the existing original husk pain recording.
- Explosion, dry fire, pickup, medical injector, key, powerup, armour impact,
  barrier shutdown, heartbeat, completion and failure cues.

The previous eight runtime recordings remain byte-for-byte unchanged. Total
runtime roster: 40 MP3s. The new 32 files add 604,436 bytes. Preparation converts
to mono 44.1kHz, trims leading silence, shortens rapid-fire reports, resamples
pain/death variants, fades edges and normalizes the waveform peak to -3dBFS
before encoding to 112kbps MP3. This is editing recorded/generated audio rather
than synthesizing replacement waves. Pain variants use a selected 0.55s section
at 1.22x speed; death variants use a longer section at 0.78x speed (husk 0.75x).

`processing.json` lists every source/runtime SHA-256, duration, trim, resampling
rate, byte size, decoded peak and RMS. Every output was decoded again with
FFmpeg to verify usable audio, nonzero level and no full-scale clipping; this
technical check does not claim a human listening review. Existing sample voice
caps, distance gain, mute and ambient cleanup remain in place. A missing codec
decode uses the old synth as a compatibility fallback; successful samples never
fall back merely because the voice limit rejects playback.

Unit coverage checks all seven guns, all six species and their alert/pain/death/
emitter events, pickups and feedback, mute/admission, retained sources and exact
runtime hashes. Browser coverage verifies decoding all registered files after a
gesture and the ambient lifecycle.

Regenerate local edits, without another provider request:

```sh
python3 tools/modern-art/prepare_roster_audio.py
```
