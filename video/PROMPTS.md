# PROMPTS

Two lists — Suno music to generate yourself, and the gpt-image-1 stills
(already produced). The video currently has the Dr. Quibble VO baked in
via ElevenLabs; music slots are left empty for you to fill.

---

## Suno music (one per scene)

Drop each generated mp3 into `video/public/audio/music/<name>.mp3`, then
wire it into `Main.tsx` next to the existing `<Audio>` element for the
narration (use `volume={0.18}` or so to sit under VO). All cues are
**instrumental, no vocals** — the voice is Dr. Quibble.

| File slot                            | Scene                | Suno prompt                                                                                                                                                                                                |
|--------------------------------------|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `music/01_title.mp3`                 | Title (~12 s)        | Punchy intro stinger. Synth arp + soft kick, 100 BPM, A minor → C major lift. Lo-fi clean. Ends on a major chord under 12 seconds. No vocals.                                                              |
| `music/02_pitch.mp3`                 | Pitch (~22 s)        | Driving lo-fi-tech bed, 110 BPM, sidechained pad and a single bouncy synth bass. Clean, hopeful, "explainer video" energy. No melody hook — just movement.                                                  |
| `music/03_stack.mp3`                 | Stack (~28 s)        | Modular synth sequence at 105 BPM, gentle 16th-note pulse. Echoes of Brian Eno's *Music for Airports* but with a curious ascending motif. No drums.                                                          |
| `music/04_console.mp3`               | Console tour (~28 s) | Calm tech-demo bed: warm Rhodes-like pad + clean glitchy clicks panning gently L/R. 100 BPM, no melody. Reads as "operating environment."                                                                  |
| `music/05_tools.mp3`                 | Tool catalog (~36 s) | Rapid-fire arpeggio at 120 BPM, plucky synth, building intensity as more tools light up. Slight rhythmic ratchet every 8 bars. No vocals, no drop — sustained build.                                       |
| `music/06_calibration.mp3`           | Calibration (~30 s)  | Methodical, mechanical groove. 95 BPM. Mute-string bass + thin square-wave lead. Faint metallic clicks on the off-beats, like servos seating.                                                              |
| `music/07_virtual.mp3`               | Virtual world (~24 s)| Floaty ambient pad in F# minor with a slow rising synth lead. Suggests simulation / nondiegetic space. 80 BPM. Reverb-heavy. No percussion.                                                                  |
| `music/08_ik.mp3`                    | IK pipeline (~19 s)  | Quick, mathy plucks at 130 BPM, very dry, no reverb. Like a calculator solving in real time. Two-bar phrase repeats with subtle variation. No drums.                                                       |
| `music/09_ph.mp3`                    | pH bench test (~22 s)| Warm, slightly proud tech-demo cue. 100 BPM. Soft pad + felted piano motif resolving to a major chord on the result reveal. No vocals.                                                                     |
| `music/10_next.mp3`                  | Status & roadmap (~23 s) | Optimistic, forward-leaning lo-fi at 105 BPM. Subdued kick, light shaker, one rising synth phrase that resolves up. Reads as "and now: what's next."                                                       |
| `music/11_close.mp3`                 | End (~10 s)          | Short outro stinger. Returning to the Title motif at 100 BPM, simplified. 10 seconds, decays to silence.                                                                                                  |

**Suno generation tip:** prepend each prompt with the tags
`[instrumental] [explainer video] [clean production]` and an explicit
duration cap (Suno honors "30 seconds" / "under 12 seconds" in the prompt).

---

## Images (already generated · gpt-image-1)

Seven supporting stills live in `public/assets/generated/` and are
already wired into the relevant scenes. Listed here for re-generation:

| File                         | Used in                           | Prompt                                                                                                                          |
|------------------------------|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `cover_still.png`            | Title scene backdrop              | Wide framing of a chemistry rig — robotic arm, color-checker, pH strips, 100 mL beaker.                                         |
| `gripper_over_well.png`      | pH scene LHS photo                | Close-up of a small servo gripper holding a pH test strip above a 96-well plate.                                                |
| `two_arms_table.png`         | Virtual-world scene backdrop      | Two desktop robotic arms on a charcoal lab bench — one with a strip, one with a vial. Color-checker behind.                     |
| `calibration_endpoint.png`   | Calibration scene backdrop        | Single arm at a fully-lifted calibration endpoint, wrist square to the table, soft white card behind.                           |
| `strip_close.png`            | (available, unused)               | Single pH strip lying next to a printed pH 0-14 reference card.                                                                  |
| `notebook_marginalia.png`    | (available, unused)               | A5 graph-paper lab notebook, top-down, handwritten engineering notes + coffee rings + arm sketches.                              |
| `agent_chat_overlay.png`     | (available, unused)               | Laptop screen at slight 3/4 angle showing a minimal cream-paper chat panel.                                                     |

To regenerate after editing prompts:

```sh
set -a; source .env; set +a
python3 video/scripts/gen_images.py
```

(Pass file names as args to regenerate specific images:
`python3 video/scripts/gen_images.py cover_still.png`.)
