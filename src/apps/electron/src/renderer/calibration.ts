type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

declare global {
  interface Window {
    chem0: {
      listTools: () => Promise<JsonObject>;
      readResource: (uri: string) => Promise<JsonObject>;
      readUrdf: () => Promise<JsonObject>;
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

type UrdfJoint = {
  name: string;
  type: string;
  parent: string;
  child: string;
  xyz: [number, number, number];
  axis: [number, number, number];
  lower?: number;
  upper?: number;
};

type Point2 = { x: number; y: number };

const FALLBACK_STEPS: CalibrationStep[] = [
  { axis: "Z1", joint: "shoulder_pan", label: "base Z roll", first: "all the way to the left", second: "all the way to the right" },
  { axis: "X1", joint: "shoulder_lift", label: "base X pitch", first: "all the way backward", second: "all the way forward" },
  { axis: "X2", joint: "elbow_flex", label: "elbow X pitch", first: "fully bent/backward", second: "fully extended/forward" },
  { axis: "X3", joint: "wrist_flex", label: "wrist X pitch", first: "all the way down/backward", second: "all the way up/forward" },
  { axis: "Z2", joint: "wrist_roll", label: "wrist Z roll", first: "all the way counterclockwise/left", second: "all the way clockwise/right" },
  { axis: "Hand", joint: "gripper", label: "gripper", first: "fully closed", second: "fully open" }
];

const portInput = document.querySelector<HTMLInputElement>("#calibration-port")!;
const robotSelect = document.querySelector<HTMLSelectElement>("#calibration-robot")!;
const robotIdInput = document.querySelector<HTMLInputElement>("#calibration-robot-id")!;
const refreshRobotsButton = document.querySelector<HTMLButtonElement>("#refresh-robots")!;
const prepareButton = document.querySelector<HTMLButtonElement>("#prepare-calibration")!;
const recordButton = document.querySelector<HTMLButtonElement>("#record-endpoint")!;
const finishButton = document.querySelector<HTMLButtonElement>("#finish-calibration")!;
const stepCount = document.querySelector<HTMLDivElement>("#step-count")!;
const stepTitle = document.querySelector<HTMLHeadingElement>("#step-title")!;
const stepPrompt = document.querySelector<HTMLParagraphElement>("#step-prompt")!;
const endpointTable = document.querySelector<HTMLDivElement>("#endpoint-table")!;
const output = document.querySelector<HTMLPreElement>("#calibration-output")!;
const urdfViewer = document.querySelector<HTMLDivElement>("#urdf-viewer")!;
const urdfCaption = document.querySelector<HTMLDivElement>("#urdf-caption")!;

let steps: CalibrationStep[] = FALLBACK_STEPS;
let urdfJoints: UrdfJoint[] = [];
let stepIndex = 0;
let endpointIndex: 0 | 1 = 0;
const records: Record<string, { first?: number; second?: number }> = {};
let livePositions: Record<string, number> = {};
let pollTimer: number | undefined;

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

function parseVector(raw: string | null): [number, number, number] {
  const values = String(raw ?? "0 0 0").trim().split(/\s+/).map(Number);
  return [values[0] || 0, values[1] || 0, values[2] || 0];
}

function parseUrdf(text: string): UrdfJoint[] {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  return Array.from(xml.querySelectorAll("joint")).map((joint) => {
    const limit = joint.querySelector("limit");
    return {
      name: joint.getAttribute("name") ?? "",
      type: joint.getAttribute("type") ?? "",
      parent: joint.querySelector("parent")?.getAttribute("link") ?? "",
      child: joint.querySelector("child")?.getAttribute("link") ?? "",
      xyz: parseVector(joint.querySelector("origin")?.getAttribute("xyz") ?? null),
      axis: parseVector(joint.querySelector("axis")?.getAttribute("xyz") ?? null),
      lower: limit?.getAttribute("lower") ? Number(limit.getAttribute("lower")) : undefined,
      upper: limit?.getAttribute("upper") ? Number(limit.getAttribute("upper")) : undefined
    };
  });
}

function linkPositions(joints: UrdfJoint[]): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>([["base_link", [0, 0, 0]]]);
  for (let pass = 0; pass < joints.length + 2; pass += 1) {
    for (const joint of joints) {
      const parent = positions.get(joint.parent);
      if (!parent || positions.has(joint.child)) continue;
      positions.set(joint.child, [parent[0] + joint.xyz[0], parent[1] + joint.xyz[1], parent[2] + joint.xyz[2]]);
    }
  }
  return positions;
}

function project(point: [number, number, number]): Point2 {
  return { x: point[0] - point[1] * 0.35, y: -point[2] - point[1] * 0.18 };
}

function rawAngle(joint: string): number {
  const raw = livePositions[joint];
  if (!Number.isFinite(raw)) return 0;
  return ((raw - 2047) / 4095) * Math.PI * 2;
}

function guideAngle(step: CalibrationStep | undefined, joint: string): number {
  if (!step || step.joint !== joint) return rawAngle(joint);
  const sign = endpointIndex === 0 ? -1 : 1;
  if (joint === "gripper") return sign > 0 ? 0.7 : -0.25;
  return sign * 0.95;
}

function armPoints(angleFor: (joint: string) => number): Point2[] {
  const base: Point2 = { x: 180, y: 330 };
  const shoulder = { x: base.x + Math.sin(angleFor("shoulder_pan")) * 34, y: base.y - 26 };
  let theta = -Math.PI / 2 + angleFor("shoulder_lift") * 0.55;
  const upper = 105;
  const lower = 115;
  const wrist = 82;
  const elbow = { x: shoulder.x + Math.cos(theta) * upper, y: shoulder.y + Math.sin(theta) * upper };
  theta += angleFor("elbow_flex") * 0.5;
  const wristFlex = { x: elbow.x + Math.cos(theta) * lower, y: elbow.y + Math.sin(theta) * lower };
  theta += angleFor("wrist_flex") * 0.45;
  const roll = { x: wristFlex.x + Math.cos(theta) * wrist, y: wristFlex.y + Math.sin(theta) * wrist };
  return [base, shoulder, elbow, wristFlex, roll];
}

function drawArm(svg: SVGSVGElement, points: Point2[], className: string, activeJoint: string | null): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", String(points[i].x));
    line.setAttribute("y1", String(points[i].y));
    line.setAttribute("x2", String(points[i + 1].x));
    line.setAttribute("y2", String(points[i + 1].y));
    line.classList.add("sim-link", className);
    svg.append(line);
  }
  const names = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll"];
  points.forEach((point, i) => {
    const circle = document.createElementNS(svg.namespaceURI, "circle");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    circle.setAttribute("r", i === 0 ? "20" : "15");
    circle.classList.add("sim-joint", className);
    if (names[i] === activeJoint) circle.classList.add("active");
    svg.append(circle);
  });
}

function drawUrdf(activeJoint: string | null): void {
  if (urdfJoints.length === 0) {
    urdfViewer.textContent = "URDF unavailable";
    return;
  }
  const activeStep = currentStep();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 620 420");
  svg.setAttribute("role", "img");
  svg.classList.add("urdf-svg");
  const base = document.createElementNS(svg.namespaceURI, "rect");
  base.setAttribute("x", "126");
  base.setAttribute("y", "330");
  base.setAttribute("width", "110");
  base.setAttribute("height", "42");
  base.setAttribute("rx", "6");
  base.classList.add("robot-base");
  svg.append(base);

  drawArm(svg, armPoints((joint) => guideAngle(activeStep, joint)), "guide", activeJoint);
  drawArm(svg, armPoints(rawAngle), "live", activeJoint);

  const hand = armPoints(rawAngle).at(-1)!;
  const grip = Number.isFinite(livePositions.gripper) ? Math.max(0, Math.min(1, (livePositions.gripper - 1040) / 1500)) : 0.5;
  for (const sign of [-1, 1]) {
    const finger = document.createElementNS(svg.namespaceURI, "line");
    finger.setAttribute("x1", String(hand.x));
    finger.setAttribute("y1", String(hand.y));
    finger.setAttribute("x2", String(hand.x + 54));
    finger.setAttribute("y2", String(hand.y + sign * (12 + grip * 26)));
    finger.classList.add("sim-link", activeJoint === "gripper" ? "active" : "live");
    svg.append(finger);
  }

  urdfViewer.replaceChildren(svg);
  urdfCaption.textContent = `URDF-driven SO-101 sim · ${urdfJoints.length} joints · teal live arm, amber endpoint guide · active joint: ${activeJoint ?? "none"}`;
}

function currentStep(): CalibrationStep | undefined {
  return steps[stepIndex];
}

function currentDirection(step: CalibrationStep): string {
  return endpointIndex === 0 ? step.first : step.second;
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
    drawUrdf(null);
    renderTable();
    return;
  }

  const endpointName = endpointIndex === 0 ? "first" : "second";
  stepCount.textContent = `${stepIndex + 1} / ${steps.length} · ${endpointName} endpoint`;
  stepTitle.textContent = `${step.axis} · ${step.label}`;
  stepPrompt.textContent = `Move ${step.label} ${currentDirection(step)}, then click Record.`;
  recordButton.disabled = false;
  finishButton.disabled = true;
  drawUrdf(step.joint);
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

async function refreshRobots(): Promise<void> {
  robotSelect.replaceChildren();
  const loading = document.createElement("option");
  loading.textContent = "Scanning...";
  robotSelect.append(loading);
  try {
    const parsed = parseToolJson(await window.chem0.callTool("list_connected_robots", { max_id: 12 }));
    const robots = Array.isArray(parsed.robots) ? (parsed.robots as JsonObject[]) : [];
    robotSelect.replaceChildren();
    for (const robot of robots) {
      const option = document.createElement("option");
      const port = String(robot.port ?? "");
      const ids = Array.isArray(robot.servo_ids) ? robot.servo_ids.join(",") : "";
      option.value = port;
      option.textContent = `${port} · IDs ${ids || "none"}`;
      if (typeof robot.suggested_robot_id === "string") option.dataset.robotId = robot.suggested_robot_id;
      robotSelect.append(option);
    }
    if (robots.length === 0) {
      const option = document.createElement("option");
      option.value = portInput.value;
      option.textContent = "No robots detected";
      robotSelect.append(option);
    }
    const selected = robotSelect.selectedOptions[0];
    if (selected?.value) portInput.value = selected.value;
    if (selected?.dataset.robotId) robotIdInput.value = selected.dataset.robotId;
    startLivePolling();
    show(parsed);
  } catch (error) {
    robotSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = portInput.value;
    option.textContent = "Scan failed";
    robotSelect.append(option);
    show(error instanceof Error ? error.message : String(error));
  }
}

async function loadUrdf(): Promise<void> {
  try {
    const result = await window.chem0.readUrdf();
    const text = typeof result.text === "string" ? result.text : "";
    urdfJoints = parseUrdf(text);
    renderStep();
  } catch (error) {
    urdfCaption.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function pollLivePositions(): Promise<void> {
  const port = portInput.value.trim();
  if (!port) return;
  try {
    const parsed = parseToolJson(await window.chem0.callTool("read_so101_raw_positions", { port }));
    const positions = parsed.positions;
    if (positions && typeof positions === "object" && !Array.isArray(positions)) {
      livePositions = Object.fromEntries(
        Object.entries(positions as JsonObject).map(([joint, value]) => [joint, Number(value)])
      );
      drawUrdf(currentStep()?.joint ?? null);
    }
  } catch {
    // Keep the last rendered pose; calibration reads will surface actionable errors.
  }
}

function startLivePolling(): void {
  if (pollTimer) window.clearInterval(pollTimer);
  void pollLivePositions();
  pollTimer = window.setInterval(() => void pollLivePositions(), 700);
}

window.addEventListener("beforeunload", () => {
  if (pollTimer) window.clearInterval(pollTimer);
});

robotSelect.addEventListener("change", () => {
  const selected = robotSelect.selectedOptions[0];
  if (selected?.value) portInput.value = selected.value;
  if (selected?.dataset.robotId) robotIdInput.value = selected.dataset.robotId;
  startLivePolling();
});

refreshRobotsButton.addEventListener("click", () => void refreshRobots());

prepareButton.addEventListener("click", async () => {
  const port = portInput.value.trim();
  if (!port) {
    show("Select a connected robot or enter a serial port first.");
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
    startLivePolling();
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

void loadUrdf();
void refreshRobots();
renderStep();
