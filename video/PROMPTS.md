# PROMPTS

Two lists — music to commission in Suno, and still images to either generate
(via the gpt-image-2 endpoint) or shoot from the actual lab. Each prompt is
keyed to the scene it belongs to so you can drop the asset back into the
right `staticFile()` slot once it's ready.

> **note on the OpenAI key** — you pasted a service-account secret in the
> request. I have not used it, and I deliberately have not stored it in any
> file in this repo. If you want me to drive image generation directly,
> rotate the key first (it's likely now compromised by being in chat) and
> hand me the rotated value via an env var like `OPENAI_API_KEY`, then I'll
> generate the images and write them into `video/assets/generated/` with the
> filenames listed below.

---

## Music (Suno)

| File slot                                      | Use under                                                   | Prompt                                                                                                                                                                                            |
|------------------------------------------------|-------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `video/audio/01_title.mp3`                     | Title (0:00–0:12)                                            | Slow, hushed piano with a single sustained string note. No drums. Cream-paper warmth. 60 BPM. Library/archival mood. Faint vinyl crackle at -32 dB. Loopable.                                       |
| `video/audio/02_question.mp3`                  | The Question (0:12–0:32)                                     | Soft Rhodes electric piano, 3 chords, very slow. A breath of room reverb. No melody — just space between chords. 56 BPM.                                                                            |
| `video/audio/03_target.mp3`                    | The Target (0:32–0:55)                                       | Ambient field recording of a lab — distant fume hood hum, glass clinking once or twice, no music. 23 seconds. Dead clean tail.                                                                     |
| `video/audio/04_approach.mp3`                  | Approach (0:55–1:25)                                         | Quiet pizzicato strings on a single rising figure, repeated with small variation. Like a clock that is curious. 72 BPM, 4/4.                                                                       |
| `video/audio/05_architecture.mp3`              | Architecture (1:25–2:05)                                     | Minimal piano arpeggio in a major key, gently looping. Add one cello note that holds for 8 bars. No percussion. 60 BPM.                                                                            |
| `video/audio/06_console.mp3`                   | The Console (2:05–2:35)                                      | A subtle hum, like a CRT warming up, with a soft synth pad in C major. No melody. Reads as "operating environment."                                                                                |
| `video/audio/07_calibration.mp3`               | Calibration (2:35–3:25)                                      | A slow, careful low piano motif, two notes apart. A faint metallic creak in the background, like a servo settling. 50 BPM.                                                                          |
| `video/audio/08_debugging.mp3`                 | Debugging (3:25–4:10)                                        | Ambient drone in A minor, with a barely-audible heartbeat. No melody. The tension is patience, not panic. 45 seconds, loopable tail.                                                                |
| `video/audio/09_whatwegot.mp3`                 | What we got (4:10–4:45)                                      | A small, warm string quartet phrase resolving from minor to relative major. Restrained — almost stoic. 64 BPM.                                                                                      |
| `video/audio/10_nexttime.mp3`                  | Next time (4:45–5:30)                                        | A gently rising piano phrase that ends without resolution — like an open question. Single hand. 60 BPM.                                                                                            |
| `video/audio/11_end.mp3`                       | End (5:30–5:55)                                              | One sustained piano chord, slow attack, 15-second decay. Followed by silence.                                                                                                                       |

When you import: drop each file at the path above, then add `<Audio>` tags
inside the matching `Scene*.tsx` (or, better, in `Main.tsx` as a per-scene
`<Sequence>` sibling) using `staticFile("audio/<name>")`.

---

## Images (gpt-image-2)

The Remotion scenes already reference the existing `video/assets/*.png`
files. The list below covers images we **do not** have yet but would help
the project read more concretely. Treat them as optional polish.

All images: **1024 × 1280, vertical**, soft daylight from camera-left, deep
charcoal countertop, very shallow depth-of-field, no on-frame text, photo
realism (not illustration), color graded toward cream-and-amber.

| File name                                      | Used by scene                  | Prompt                                                                                                                                                                                          |
|-----------------------------------------------|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `video/assets/generated/strip_close.png`       | Target / What we got           | A single pH strip, freshly dipped, lying on dark slate next to a printed pH 0–14 reference card. Strip color reads pH ~4 (amber-yellow). One drop of water beside it. No hands.                  |
| `video/assets/generated/gripper_over_well.png` | Approach / Calibration          | Close-up: SO-101 servo gripper holding a pH test strip directly above a 96-well plate, focus on the gripper jaws. Cream daylight. Slight motion blur on the wrist.                              |
| `video/assets/generated/two_arms_table.png`    | What we got                    | Two SO-101 arms mounted ~30 cm apart on a charcoal lab bench. One holding a test strip, the other holding a small vial labeled "UNK_3". Color checker visible in the background. No people.    |
| `video/assets/generated/calibration_endpoint.png` | Calibration                   | A single SO-101 arm at its "Z2" endpoint: shoulder lifted, wrist square. Soft white card behind it. Six small chalk marks on the table beneath, labeled Z1–Hand. Notebook open beside it.       |
| `video/assets/generated/agent_chat_overlay.png`| Console                        | A laptop screen, slight 3/4 angle, showing a minimal chat panel with a user message "read pH of UNK_3" and agent reply. Cream paper UI. Reflected lab in the screen.                            |
| `video/assets/generated/notebook_marginalia.png` | Debugging                    | An A5 graph-paper lab notebook, photographed top-down, with neat handwritten notes and three coffee rings. Pen resting on top. Visible scribbles include "urdf in mm??" and "wrist wraps".       |
| `video/assets/generated/cover_still.png`       | YouTube/social cover           | Wide framing of the whole rig: SO-101 arm in foreground, color checker mid-frame, pH strips fanned out, beaker in soft focus. Light from camera-left. Print-magazine feel.                      |

To generate them with gpt-image-2 once the API key is rotated:

```bash
# illustrative — wire to your preferred client
curl -sS https://api.openai.com/v1/images/generations \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "<paste prompt here>",
    "size": "1024x1280",
    "n": 1,
    "response_format": "b64_json"
  }' | jq -r '.data[0].b64_json' | base64 -d > video/assets/generated/<name>.png
```
