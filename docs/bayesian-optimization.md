---
name: bayesian-optimization
description: Bayesian optimization for mixture and recipe problems using Ax. Use when optimizing compositions, formulations, dosed ingredients, or any design where components sum to a constant total. Covers simplex parameterization (continuous and discrete), multi-objective with qNEHVI, outcome constraints, partial observations (funnel pattern), and common pitfalls. Trigger when the user asks about BO, GP-based optimization, finding the best recipe, Pareto fronts, or `ax-platform` usage.
---

# Bayesian Optimization for Mixture Designs

## When to use

| Data size | Recommendation |
|---|---|
| < 10 points | Space-filling design or LLM-led exploration — GP needs data first |
| 10+ points | BO with GP |
| Multi-objective or constraints | BO strongly preferred — qNEHVI handles Pareto + constraints natively |

## Mixture problems are different

A **mixture** is a set of components that sum to a constant (total volume or total mass). The design space is a simplex, not a hyperrectangle.

If components don't have to sum to a constant, use absolute amounts and skip the mixture-specific sections.

## Continuous mixture parameterization

For k components, parameterize k–1 of them and treat the last as slack (computed at trial time):

```python
from ax import Client, RangeParameterConfig

client = Client()
client.configure_experiment(parameters=[
    RangeParameterConfig("f_a", "float", bounds=(0.0, 0.6)),
    RangeParameterConfig("f_b", "float", bounds=(0.0, 0.6)),
    RangeParameterConfig("f_c", "float", bounds=(0.0, 0.6)),
    # f_solvent = 1 - (f_a + f_b + f_c), computed in the trial executor
])
client.configure_optimization(
    objective="resistance",
    outcome_constraints=["pH <= 8.2", "pH >= 7.8"],
    parameter_constraints=["f_a + f_b + f_c <= 1.0"],
)
```

Ax samples on the constrained polytope; the acquisition function respects the linear constraint.

## Discrete mixture parameterization

When the dispensing system can only deliver pre-measured doses (e.g., single-dose vials), use choice parameters:

```python
from ax import ChoiceParameterConfig

parameters = [
    ChoiceParameterConfig("a_lvl", "int", values=[0, 3, 6]),
    ChoiceParameterConfig("b_lvl", "int", values=[0, 3, 6]),
    ChoiceParameterConfig("c_lvl", "int", values=[0, 3, 6]),
]
```

Discrete BO uses the same GP machinery; the kernel operates on a lattice.

## Multi-objective

Negate each metric you want to maximize:

```python
client.configure_optimization(objective="-yield, -throughput")
```

Ax uses `qNoisyExpectedHypervolumeImprovement` (qNEHVI) automatically and tracks the Pareto front.

## Partial observations (funnel pattern)

When some trials only measure some metrics (sensor fails, camera misses the DMM, etc.), omit the missing metric in `complete_trial`. Ax fits each metric on its available data via `ModelListGP`.

```python
client.configure_tracking_metrics(metric_names=["pH", "resistance", "color_saturation"])

# Full trial
client.complete_trial(trial_index=i, raw_data={
    "pH": (8.05, 0.05),
    "resistance": (180.0, 5.0),
})

# Partial — VLM couldn't read DMM, omit it
client.complete_trial(trial_index=j, raw_data={
    "pH": (7.95, 0.05),
})
```

Don't pass `None` or `NaN` — just omit the key.

## LLM-led initialization (replaces Sobol)

For demos or domains where an LLM agent has useful exploration priors, the agent can propose the first ~5 trials directly instead of using a Sobol seed. A natural blind-mode strategy is one-variable-at-a-time. Once enough data is collected, the agent calls into BO and the GP takes over. The agent retains the ability to override BO when domain intuition warrants.

This is functionally equivalent to a hand-designed seed and is well-supported by Ax — just call `complete_trial` with each LLM-proposed trial before the first `get_next_trials()`.

## Naming

Names must be valid Python identifiers (no spaces, hyphens, or leading digits — Ax parses constraints with sympy). Include units when ambiguous: `resistance_ohm`, `volume_ml`, `concentration_mol_l`.

## Standard workflow

1. Define design space (mixture vs. absolute; continuous vs. discrete)
2. Specify objective(s) and outcome constraints
3. Specify parameter constraints (sum ≤ 1 for mixtures)
4. Seed: Sobol, LHS, or LLM-led exploration (5–10 trials)
5. Loop: `get_next_trials()` → execute → `complete_trial(raw_data=...)`
6. Inspect diagnostics every few trials
7. Stop when hypervolume plateaus or budget exhausts

## Diagnostics

```python
# Predict at a candidate with uncertainty
client.predict(parameters=[{"f_a": 0.1, "f_b": 0.3, "f_c": 0.05}])
# → {metric: (mean, sem)}

# Best so far
best_params, _, _, _ = client.get_best_parameterization()

# Built-in analysis cards
analyses = client.compute_analyses()
```

For k=3 mixtures, the natural visualization is a **ternary diagram** of the GP posterior across the simplex. `plotly.figure_factory.create_ternary_contour` works in a few lines.

## Common pitfalls

- **Constraint as filter instead of GP.** Use `outcome_constraints` so the acquisition routes through a feasibility GP. Don't reject samples post-hoc.
- **Missing noise.** Pass `(mean, sem)` tuples to `complete_trial`. If sem unknown, use a constant guess.
- **Tiny-data GP.** Below ~10 trials, predictions are unreliable. Trust the seed (Sobol, LHS, or LLM-led).
- **Confusing mixtures and absolutes.** If your components must sum to a total, you have a mixture — add the parameter constraint. Otherwise, don't.
