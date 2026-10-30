# SonoVizio Listener Lab — public GitHub Pages release

Mobile human-listener pilot, derived from **2026-10-28** verified source WAV/PNG experiment. Audio **on the website is MP3** at 32 kHz mono / 64 kbit/s (libmp3lame); scientific source WAVs and model checkpoints remain private. MP3 is a lossy derivative, not bit-identical evidence. This is not a live neural inference server; recorded sounds are a controlled listener instrument.

Hosted path: `https://sonovizio.github.io/lab/` (verify live deployment before claiming it).

The assets scripts contain base64 MP3 and PNG data URIs, chunked because the ChatGPT GitHub connector only accepts UTF-8 files and an already-available data URL supports reliable playback on mobile after a real tap. Site is fully static; no login, telemetry, or server-side data collection. Listener answers are stored locally and only shared when exported as JSON.

Data provenance, conversion settings and objective waveform distortion diagnostics: `CODEC_MANIFEST.json`. All original 168 WAV, 56 PNG and model checkpoints remain in the private scientific archive. First human data: none yet. The per-model stimulus sets repeat visual pairs, so carryover is possible. All answers are visible in client data, not cryptographically protected.

Publish only milestone releases. Never promote each daily autonomous test to a new listening assignment. Do not change R-n-D private repository visibility.