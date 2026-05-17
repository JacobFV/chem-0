# chem-0 — Narration script v3 (Dr. Quibble · ElevenLabs)

Faster, more accurate, more "showing real shit happening in the background".
The model keeps the visuals doing things while the voice talks. Target
~2:45 total.

---

## 01 — TITLE  (~7 s)

> chem-zero — a local autonomous chemistry agent driving a pair of
> SO-one-oh-one arms. Here's what it actually does.

## 02 — PITCH  (~15 s)

> You type "pick up vial three and tell me what it is." The agent reasons,
> calls tools, the arms move, the camera sees, and a row lands in your
> local SQLite. All on your laptop. About six hundred bucks of hardware.
> All open source.

## 03 — CONSOLE  (~18 s)

> The console is one Electron window. Experiments on the left, a
> real-time pH plot in the middle, agent chat on the right. Every event
> the agent emits — tool calls, deltas, tool responses — streams into
> this panel live, with the experiment ID stamped on each row.

## 04 — AGENT LOOP  (~22 s)

> Here's an actual session. User message. The agent streams a plan,
> then fires tools — set_position, close_gripper, observe, infer_vial_ph,
> record_ph — one after the other. We pipe the OpenAI Responses API
> directly to a local tool registry. Each tool call is one IPC round-trip
> to the backend, executed against the arm or the camera, and the result
> shows up in the chat in under a second.

## 05 — CALIBRATION  (~18 s)

> Calibration is its own window. We render a ghost setpoint — the pose
> the wizard wants you at — and a live arm that follows your servo
> readings. You move the real arm into the ghost. Six endpoints later,
> we write a new LeRobot calibration JSON and the bus stops surprising us.

## 06 — VIRTUAL WORLD  (~16 s)

> Same backend drives a Three-D virtual-world editor. Dark grid floor,
> a gold SO-one-oh-one mesh, blue camera markers, gray rigid bodies.
> Drag things in, set positions, run the agent against the sim using
> the same tool calls it'd use against hardware.

## 07 — VISION  (~20 s)

> Vision is honest OpenCV. We find vials with a blue-cap detector,
> sample the liquid region below the cap, and classify the bromothymol
> blue hue in HSV against a calibrated reference image — yellow is acid,
> blue is base. There's also a DMM-probe detector and a multimeter OCR
> step for reading resistance.

## 08 — BO TRAJECTORY  (~18 s)

> Once vision is solid, the agent can plan experiments. This is a
> simulated Bayesian-optimization trajectory: pH evolving as the agent
> adds NaCl, then dissolved borax, then a vinegar drop. Each step is a
> tool sequence — pick, pour, dip, read. The chart updates as the
> database does.

## 09 — ARCHITECTURE  (~16 s)

> Architecture, quickly: Electron renderer; Node backend in the main
> process; OpenAI Responses API for the agent loop; SQLite for events
> and artifacts; a Python bridge for LeRobot, placo IK, and OpenCV. The
> same tools are also exposed over stdio MCP so external agents like
> Codex can drive the rig.

## 10 — STATUS  (~14 s)

> What ships today: the console, calibration, virtual world, recording
> and replay, the full vision and IK stacks. What's next: closing the
> loop on real hardware — BO-driven planning, identity classification
> across vinegar, NaCl, baking soda, and borax.

## 11 — CLOSE  (~6 s)

> github dot com slash JacobFV slash chem-zero. Thanks for watching!
