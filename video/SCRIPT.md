# chem-0 — Narration script

A quiet, slow read. Long sentences are allowed to breathe; the short
fragments should land hard. Cadence reference: *the-shape-of-inquiry*.

The "marker" column matches the `marker` prop on the on-screen caption so
you can find your place visually while recording. All timings are in seconds
inside the final composition; the Remotion `Main` composition is the source
of truth — if you re-time scenes there, regenerate this script's markers but
the prose can stay.

---

## 01 — TITLE  (0:00 – 0:12)

> A short film about a chemistry that didn't finish.
> Recorded from a small lab, in May.

## 02 — THE QUESTION  (0:12 – 0:32)

> The question was simple, the way most useful questions are simple.
> Could a small, embodied agent learn to *see* a chemistry — not name it,
> not summarize it, not describe its color in fluent English — but actually
> *measure* it, with its own eyes, its own hands, its own slow contact
> with the world?

## 03 — THE TARGET  (0:32 – 0:55)

> The target was a colorimetric test. A pH strip dipped into an unknown
> vial. A color, read against a reference card. A number, written down.
> The whole pipeline of a working scientist, compressed to a single
> repeatable gesture — so we could measure whether the agent had it, or
> only the appearance of it.

## 04 — APPROACH  (0:55 – 1:25)

> Two arms. One camera. A printed reference card.
> A short script in the agent's hand: *connect, observe, look, dip, lift,
> name the color, name the pH.*
> The pipeline reads, top to bottom, like a small kitchen recipe — and
> like every recipe, it depends on the kitchen.

## 05 — ARCHITECTURE  (1:25 – 2:05)

> Underneath was a quiet stack.
> An Electron console for the human. A stdio MCP server for the model.
> A Node backend that owned experiments, artifacts, and sessions.
> A Python bridge that spoke to LeRobot and OpenCV.
> A SQLite file that remembered everything.
>
> The control loop was small enough to read in an afternoon. Which turned
> out to be the only honest way to debug it.

## 06 — THE CONSOLE  (2:05 – 2:35)

> The console was the first thing we built and the last thing we trusted.
> Cameras on the left. Arms in the middle. The agent's chat on the right.
> Every tool the model could call was a button a human could press first.
> Nothing the agent did was supposed to be invisible.

## 07 — CALIBRATION  (2:35 – 3:25)

> And then we tried to calibrate the arms.
>
> Calibration is not an infrastructure detail. It is the agent's first act
> of humility before reality — and ours.
> Servos that read perfectly in isolation drifted by a degree under load.
> A cable channel was reversed. A jumper was missing. The wrist roll
> wrapped past its register limit and the gripper closed on nothing.
>
> We wrote a deterministic walk-through: Z1, X1, X2, X3, Z2, hand. Six
> endpoints, six small confessions of where the arm actually lives. Then
> we wrote it again, in the GUI, for the next person who would have to do
> this without us.

## 08 — DEBUGGING  (3:25 – 4:10)

> Most of the project, in the end, was this:
> a port that wouldn't open, a frame that wouldn't decode, a kinematics
> solver that wanted a URDF in slightly different units, a pose table
> that disagreed with the camera.
>
> The chemistry waited. It is patient that way. Chemistry has been waiting
> for centuries.

## 09 — WHAT WE GOT  (4:10 – 4:45)

> What we got, in the time we had, was the simulation half.
> A virtual scene the agent could rehearse in. A pose table it could
> trust. A camera feed that matched what a real camera would see, in a
> light that matched the lab.
> The arms moved. The colors read. The pipeline closed.
>
> It just didn't close on a real vial.

## 10 — NEXT TIME  (4:45 – 5:30)

> If we did this again, we would spend the first week calibrating, on
> purpose. We would treat the URDF as the experiment. We would record the
> trajectory, not the answer — because the trajectory is the object, and
> the answer is residue.
>
> We would ask the agent to dip a strip into water before we asked it to
> dip a strip into anything that mattered.
> And we would let the chemistry wait a little longer.

## 11 — END  (5:30 – 5:55)

> chem-0. A small lab, a smaller agent. Recorded in May.
> Thanks for watching.
