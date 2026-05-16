# Experiment: Mixture optimization with unknown reagents

## Goal
A robot arm runs trials mixing three unknown reagents (A, B, C) in water. An LLM agent reasons about what each reagent is, and uses Bayesian optimization to find the recipe that minimizes solution resistance while keeping pH in a target window. Mid-run, the agent commits to a hypothesis about reagent identities; the operator reveals the truth; the agent updates and continues.

## Ground truth (hidden from agent until reveal)
- A: white vinegar (5% acetic acid)
- B: saturated NaCl
- C: saturated borax

## Design space (27 cells)
- Reagent A: skip, 3 mL, or 6 mL
- Reagent B: skip, 3 mL, or 6 mL
- Reagent C: skip, 3 mL, or 6 mL

Each non-skipped reagent is dispensed by the arm picking and dumping one pre-filled vial. Water tops the cup to a fixed total volume.

## Measured per trial
- **pH** — universal indicator color, read by camera + VLM
- **Resistance R** — multimeter probes mounted on a chopstick wand; DMM screen read by camera + VLM

## Objective
Minimize R subject to pH ∈ [7.8, 8.2].

## Pre-staged setup (~30 min)
- 60 single-dose vials in a 6-column rack (A-mid, A-high, B-mid, B-high, C-mid, C-high; 10 each)
- 1 L tap water with ~30 drops universal indicator pre-mixed
- Camera on tripod, framing trial cup + DMM display in one shot
- DMM-probe wand: probes duct-taped parallel to a chopstick at fixed spacing

## Trial loop (~60 sec)
1. **Agent proposes a recipe.** Either by its own reasoning (`propose_trial`) or by handing off to the Bayesian optimizer (`invoke_bo`). Narrates rationale.
2. Arm picks one vial per non-skipped reagent, dumps into fresh cup, discards vials
3. Arm tops cup with indicator-pre-mixed water to fixed total volume
4. Arm lowers probe wand into cup
5. Camera frame → VLM returns `(pH from color, R from DMM)`
6. Trial logged; agent narrates what it learned
7. Fresh cup, repeat

## Initialization strategy (replaces Sobol/LHS)
The agent runs its own exploration for the first several trials — typically a one-variable-at-a-time sweep to isolate each reagent's effect. Once it has enough coverage (~5 trials), the agent calls `invoke_bo()` and the GP takes over. After that, the agent can still override BO suggestions with `override_bo(...)` when chemistry intuition warrants.

This replaces the usual Sobol seed. The LLM's reasoning *is* the design-of-experiments strategy.

## Agent tools
- `propose_trial(a_lvl, b_lvl, c_lvl, rationale)` — agent picks recipe directly
- `invoke_bo()` — hand off to BO; subsequent trials come from the GP model
- `override_bo(a_lvl, b_lvl, c_lvl, rationale)` — take the wheel back from BO for one trial
- `commit_hypothesis(a_is, b_is, c_is, confidence)` — at trial 8
- `look(question)` — VLM call on a workspace frame (anomaly checks)

## Scripted beats

| Trial | Mode |
|---|---|
| 1–~5 | **Agent-led exploration** — one-variable-at-a-time, narrated reasoning |
| ~6 | **Agent invokes BO** — *"I have enough data, handing off to the optimizer"* |
| 6–7 | BO suggests; agent confirms or overrides |
| 8 | **Hypothesis checkpoint** — agent commits identities of A/B/C with confidence |
| 9 | **Reveal** — operator triggers `/reveal`; hypothesis is scored against ground truth |
| 10–25 | **Informed optimization** — BO drives, agent overrides when priors warrant |

## Win conditions
- ≥ 2 of 3 reagents correctly identified at trial 8
- Feasible recipe (pH in window) found by trial 12
- Final R below random-baseline median
- Visible recovery from one staged anomaly mid-run

## Run length
~25 trials in ~25 minutes. Live dashboard shows pH-feasibility map, resistance trend, hypothesis log, and the agent's reasoning stream.

## Explicitly out of scope
- Battery / open-circuit voltage measurement
- Real pH probe (universal indicator + VLM covers it)
- Continuous dispensing (discrete vial doses only)
- Probe rinsing (fresh cup every trial)
- Capacitance (DMM can't measure it reliably in conductive solution)
