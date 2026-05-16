type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

declare global {
  interface Window {
    chem0: {
      listTools: () => Promise<JsonObject>;
      readResource: (uri: string) => Promise<JsonObject>;
      callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
      createExperiment: (name: string, metadata?: JsonObject) => Promise<JsonObject>;
      listExperiments: () => Promise<JsonObject>;
      listEvents: (experimentId: string) => Promise<JsonObject>;
      listArtifacts: (experimentId: string) => Promise<JsonObject>;
      sendAgentMessage: (input: JsonObject) => Promise<JsonObject>;
      openCalibrationWindow: () => Promise<JsonObject>;
      onAgentEvent: (callback: (event: JsonObject) => void) => () => void;
    };
  }
}

type CalibrationStep = {
  axis: string;
  joint: string;
  label: string;
  first: string;
  second: string;
};

const FALLBACK_STEPS: CalibrationStep[] = [
  { axis: "Z1", joint: "shoulder_pan", label: "base Z roll", first: "all the way to the left", second: "all the way to the right" },
  { axis: "X1", joint: "shoulder_lift", label: "base X pitch", first: "all the way backward", second: "all the way forward" },
  { axis: "X2", joint: "elbow_flex", label: "elbow X pitch", first: "fully bent/backward", second: "fully extended/forward" },
  { axis: "X3", joint: "wrist_flex", label: "wrist X pitch", first: "all the way down/backward", second: "all the way up/forward" },
  { axis: "Z2", joint: "wrist_roll", label: "wrist Z roll", first: "all the way counterclockwise/left", second: "all the way clockwise/right" },
  { axis: "Hand", joint: "gripper", label: "gripper", first: "fully closed", second: "fully open" }
];

const portInput = document.querySelector<HTMLInputElement>("#calibration-port")!;
const robotIdInput = document.querySelector<HTMLInputElement>("#calibration-robot-id")!;
const prepareButton = document.querySelector<HTMLButtonElement>("#prepare-calibration")!;
const recordButton = document.querySelector<HTMLButtonElement>("#record-endpoint")!;
const finishButton = document.querySelector<HTMLButtonElement>("#finish-calibration")!;
const stepCount = document.querySelector<HTMLDivElement>("#step-count")!;
const stepTitle = document.querySelector<HTMLHeadingElement>("#step-title")!;
const stepPrompt = document.querySelector<HTMLParagraphElement>("#step-prompt")!;
const endpointTable = document.querySelector<HTMLDivElement>("#endpoint-table")!;
const output = document.querySelector<HTMLPreElement>("#calibration-output")!;

let steps: CalibrationStep[] = FALLBACK_STEPS;
let stepIndex = 0;
let endpointIndex: 0 | 1 = 0;
const records: Record<string, { first?: number; second?: number }> = {};

function show(value: unknown): void {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function textFromTool(result: JsonObject): string {
  const content = result.content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  const first = content[0] as JsonObject | undefined;
  return typeof first?.text === "string" ? first.text : JSON.stringify(result);
}

function parseToolJson(result: JsonObject): JsonObject {
  return JSON.parse(textFromTool(result)) as JsonObject;
}

function currentStep(): CalibrationStep | undefined {
  return steps[stepIndex];
}

function currentDirection(step: CalibrationStep): string {
  return endpointIndex === 0 ? step.first : step.second;
}

function setActiveAxis(axis: string | null): void {
  document.querySelectorAll(".axis-node, .axis-hand").forEach((node) => node.classList.remove("active"));
  if (!axis) return;
  document.querySelector(`#axis-${axis}`)?.classList.add("active");
}

function renderTable(): void {
  endpointTable.replaceChildren();
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Axis</th><th>Joint</th><th>First</th><th>Second</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const step of steps) {
    const rec = records[step.joint] ?? {};
    const row = document.createElement("tr");
    row.innerHTML = `<td>${step.axis}</td><td>${step.joint}</td><td>${rec.first ?? ""}</td><td>${rec.second ?? ""}</td>`;
    if (step === currentStep()) row.classList.add("active");
    body.append(row);
  }
  table.append(body);
  endpointTable.append(table);
}

function renderStep(): void {
  const step = currentStep();
  if (!step) {
    stepCount.textContent = "Ready to finish";
    stepTitle.textContent = "All endpoints recorded";
    stepPrompt.textContent = "Click Finish to write the calibration file and servo register limits.";
    recordButton.disabled = true;
    finishButton.disabled = false;
    setActiveAxis(null);
    renderTable();
    return;
  }

  const endpointName = endpointIndex === 0 ? "first" : "second";
  stepCount.textContent = `${stepIndex + 1} / ${steps.length} · ${endpointName} endpoint`;
  stepTitle.textContent = `${step.axis} · ${step.label}`;
  stepPrompt.textContent = `Move ${step.label} ${currentDirection(step)}, then click Record.`;
  recordButton.disabled = false;
  finishButton.disabled = true;
  setActiveAxis(step.axis);
  renderTable();
}

function advance(): void {
  if (endpointIndex === 0) {
    endpointIndex = 1;
    renderStep();
    return;
  }
  endpointIndex = 0;
  stepIndex += 1;
  renderStep();
}

prepareButton.addEventListener("click", async () => {
  const port = portInput.value.trim();
  if (!port) {
    show("Enter a serial port first.");
    return;
  }
  prepareButton.disabled = true;
  try {
    const result = await window.chem0.callTool("prepare_so101_calibration", { port });
    const parsed = parseToolJson(result);
    const toolSteps = parsed.steps;
    if (Array.isArray(toolSteps)) steps = toolSteps as unknown as CalibrationStep[];
    stepIndex = 0;
    endpointIndex = 0;
    for (const key of Object.keys(records)) delete records[key];
    show(parsed);
    renderStep();
  } catch (error) {
    prepareButton.disabled = false;
    show(error instanceof Error ? error.message : String(error));
  }
});

recordButton.addEventListener("click", async () => {
  const step = currentStep();
  if (!step) return;
  recordButton.disabled = true;
  try {
    const result = await window.chem0.callTool("read_so101_calibration_endpoint", {
      port: portInput.value.trim(),
      joint: step.joint,
      samples: 5
    });
    const parsed = parseToolJson(result);
    const raw = Number(parsed.raw_position);
    if (!Number.isFinite(raw)) throw new Error("Endpoint read did not return a raw_position.");
    const rec = records[step.joint] ?? {};
    if (endpointIndex === 0) rec.first = raw;
    else rec.second = raw;
    records[step.joint] = rec;
    show(parsed);
    advance();
  } catch (error) {
    show(error instanceof Error ? error.message : String(error));
    recordButton.disabled = false;
  }
});

finishButton.addEventListener("click", async () => {
  finishButton.disabled = true;
  try {
    const result = await window.chem0.callTool("finalize_so101_calibration", {
      port: portInput.value.trim(),
      robot_id: robotIdInput.value.trim(),
      records,
      write_motors: true
    });
    show(parseToolJson(result));
    stepCount.textContent = "Calibration saved";
    stepTitle.textContent = robotIdInput.value.trim();
    stepPrompt.textContent = "Use this robot id when connecting the arm.";
  } catch (error) {
    finishButton.disabled = false;
    show(error instanceof Error ? error.message : String(error));
  }
});

renderStep();
