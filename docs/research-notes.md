# Research Notes

## Problem Statement

Can a language-model agent operate a low-cost robot arm safely enough for
repeatable lab-style manipulation when it has:

- live camera frames,
- calibrated joint limits,
- a small set of semantic pose references,
- a constrained six-parameter absolute pose interface?

## Hypothesis

Giving the agent a pose table and a constrained MCP interface should reduce
unsafe or nonsensical motion compared with free-form spatial reasoning.

## Current Prototype

The current prototype demonstrates:

- live camera frame retrieval through MCP,
- servo bus probing,
- calibrated LeRobot connection,
- absolute six-joint pose moves,
- reference pose context available as an MCP resource.

## Interesting Measurements

Future experiments could measure:

- number of tool calls needed to reach a target visual pose,
- frequency of out-of-range pose attempts,
- recovery from bad spatial assumptions,
- camera-before-motion compliance,
- success rate for simple manipulation tasks.

## Next Experiments

1. Add AprilTag or marker detection to ground visual pose feedback.
2. Add a camera-frame annotation tool for target picking.
3. Add named task recipes that map lab actions to pose sequences.
4. Log every MCP call and final camera frame for reproducibility.
5. Compare LLM-only control against scripted baseline pose sequences.
