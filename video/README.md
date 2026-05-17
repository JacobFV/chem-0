# chem-0 — the video

A ~5:55 Remotion film about an experiment that ran out of runway. Light
parchment palette, serif body, mono accents. Designed for narration recorded
on top — no music or VO is baked into the composition yet, so you can
record at your own pace and drop tracks/audio in once they exist.

## Layout

```
video/
  package.json          remotion + react-three-fiber deps
  remotion.config.ts
  tsconfig.json
  SCRIPT.md             narration script with scene markers
  PROMPTS.md            Suno music + gpt-image-2 image prompts
  assets/               photos you already have (used as polaroids)
  src/
    index.ts            registers Root
    Root.tsx            single composition: "Main"
    Main.tsx            scene sequencing + cross-fade
    theme.ts            palette + typography tokens
    scenes/             one .tsx per chapter
    components/         MockWindow, MockCursor, Typewriter, DotAlongArrow, Card, …
    three/              procedural SO-101 arm + lit stage
```

## Run

```sh
cd video
npm install
npm run start     # opens Remotion Studio at http://localhost:3000
```

If `npm install` complains about peer ranges, run with `--legacy-peer-deps`.
On Apple Silicon you may need a Rosetta shim for any native dep; the
versions pinned in `package.json` were chosen to avoid that.

## Render

```sh
npm run build           # mp4 to ./out/chem0.mp4
npm run still           # poster image at frame 180
```

A full render of the 5:55 composition at 1920×1080 takes ~30 min on an
M-series Mac without GPU; the calibration scene and "what we got" scene are
the slow ones because they render two ThreeCanvases per frame. If you only
need to iterate on a single scene, pass `--frames=START-END` to the render
or open Studio and scrub.

## Adding narration

`SCRIPT.md` is structured around each scene marker. Record one continuous
take per scene, save as `video/audio/<scene>.wav`, and either:

1. **(easy)** drop the files into your DAW alongside the rendered video and
   mix there, or
2. **(in-Remotion)** add `<Audio src={staticFile("audio/<scene>.wav")} />`
   to each scene component and re-render to bake VO into the final mp4.

Music goes in `video/audio/` with names from `PROMPTS.md`.

## Editorial choices

- **Light theme.** Cream paper + ink. The existing dark-mood photos are
  used as small polaroids, not full-bleed backgrounds, so the page never
  becomes a slideshow.
- **Procedural arms.** The 3D arm is not a CAD-accurate STL of the SO-101
  — it's a geometric stand-in tuned to read on a light background. Joint
  names and order match the real chain so the motions are at least
  directionally honest.
- **No stock UI screenshots.** All Electron console panels are rebuilt in
  Remotion as `MockWindow` components so the type and color match the rest
  of the film.
- **Captions are quotations.** They mirror a phrase from the narration, set
  in italics with the scene marker, so the user can find their place while
  reading the script during recording.

## What's deliberately missing

- **Audio.** No music, no VO. You wanted to narrate yourself.
- **Real STL meshes.** The Electron app ships actual SO-101 visual meshes;
  loading those inside Remotion would be slow and brittle to render, so
  the film uses a procedural arm instead.
- **Real OpenAI image generation.** A service-account key was shared in
  chat; I declined to use it (likely now compromised). See `PROMPTS.md`
  for the full list of images and a curl example to run yourself once you
  rotate the key.
