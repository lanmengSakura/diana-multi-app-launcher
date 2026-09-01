# Private build audio

The launcher can embed one authorized copy of Hopeful Dreamer directly into
the executable at build time. Runtime playback never scans a user music folder.

Place an authorized source here using one of these names:

- Hopeful Dreamer.mp3
- Hopeful Dreamer.m4a
- Hopeful Dreamer.ogg
- Hopeful Dreamer.opus
- Hopeful Dreamer.wav
- Hopeful Dreamer.flac

Alternatively, set DIANA_HOPEFUL_DREAMER_AUDIO to an absolute source path for
the build command. Audio files in this directory are ignored by Git. The source
must be non-empty and no larger than 64 MiB.

Without an audio source, builds remain valid but report that the track is not
included. When a source is present, the resulting EXE and installer contain the
audio and the note button plays it directly.
