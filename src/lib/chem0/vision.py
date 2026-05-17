"""OpenCV vision module for chem-0 chemistry experiment.

Provides vial detection, bromothymol blue pH inference (calibrated from
the reference image at ``bromothymol-blue-reference.avif``), multimeter
probe detection, and DMM display analysis.

Usage:
    from chem0.vision import capture_frame, find_vials, infer_vial_ph
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

# ── Reference image path ─────────────────────────────────────────────────
REFERENCE_PATH = Path(__file__).resolve().parent / "bromothymol-blue-reference.avif"


# ── Colorimetry: bromothymol blue pH ↔ HSV ranges ────────────────────────
# Calibrated from the reference image patches:
#
#   Bottom row (saturated):   Top row (dilute):
#     YELLOW   H=28  S=154        n/a
#     YEL/GRN  H=41  S=122        H=42  S=80
#     GREEN    H=75  S=110        H=75  S=64
#     BLU/GRN  H=96  S=186        H=96  S=142
#     BLUE     H=103 S=195        H=100 S=186
#

# pH lookup: colour name → (lower_HSV, upper_HSV, representative_ph)
PH_CLASSES: list[tuple[str, tuple[int, int, int], tuple[int, int, int], float]] = [
    ("yellow", (20, 80, 60), (35, 255, 255), 4.5),
    ("yellow-green", (35, 60, 40), (50, 255, 220), 6.0),
    ("green", (50, 40, 40), (85, 200, 200), 6.8),
    ("blue-green", (85, 60, 50), (100, 255, 220), 7.6),
    ("blue", (100, 60, 40), (135, 255, 255), 8.5),
]

# Fast lookup dict for HSV ranges
_HSV_RANGES: dict[str, tuple[np.ndarray, np.ndarray]] = {
    name: (np.array(lower), np.array(upper))
    for name, lower, upper, _ in PH_CLASSES
}

# Estimated pH midpoint for each colour class
_PH_MAP: dict[str, float] = {name: ph for name, _, _, ph in PH_CLASSES}


# ── Data classes ─────────────────────────────────────────────────────────

@dataclass
class VialROI:
    """A detected vial region in the camera frame."""

    x: int
    y: int
    w: int
    h: int
    area: float
    centre: tuple[float, float]

    @property
    def roi(self) -> tuple[int, int, int, int]:
        return (self.x, self.y, self.w, self.h)


@dataclass
class PHResult:
    """pH inference result from a vial ROI."""

    ph: float
    colour: str
    confidence: float
    pixel_counts: dict[str, int] = field(default_factory=dict)


@dataclass
class ProbeROI:
    """Detected multimeter probe tips."""

    left_tip: tuple[int, int]
    right_tip: tuple[int, int]
    spacing_px: float
    centre: tuple[float, float]


# ── Camera helpers ────────────────────────────────────────────────────────

def _darwin() -> bool:
    return sys.platform == "darwin"


def _camera_backend() -> int:
    if _darwin() and hasattr(cv2, "CAP_AVFOUNDATION"):
        return cv2.CAP_AVFOUNDATION
    return cv2.CAP_ANY


def capture_frame(camera_id: int = 0, width: int | None = None, height: int | None = None) -> np.ndarray:
    """Capture a single frame from the camera.

    Mirrors the logic in ``core.py:_capture_frame``.
    Returns the BGR frame. Raises RuntimeError on failure.
    """
    cap = cv2.VideoCapture(camera_id, _camera_backend())
    try:
        if not cap.isOpened():
            raise RuntimeError(f"Camera {camera_id} could not be opened.")
        if width is not None:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        if height is not None:
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        for _ in range(5):
            ok, frame = cap.read()
            if ok and frame is not None:
                return frame
            cv2.waitKey(100)
        raise RuntimeError(f"Camera {camera_id} opened but returned no frame.")
    finally:
        cap.release()


def save_frame(frame: np.ndarray, path: str = "/tmp/chem_frame.jpg", quality: int = 85) -> str:
    """Save frame to JPEG. Returns the path."""
    cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return path


# ── Vial detection ────────────────────────────────────────────────────────

def find_vials(
    frame: np.ndarray,
    min_area: int = 500,
    max_vials: int = 6,
    aspect_range: tuple[float, float] = (0.3, 3.0),
) -> list[VialROI]:
    """Locate vial-like objects via edge detection + contour analysis.

    Returns vials sorted by area descending.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 120)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, fw = frame.shape[:2]
    vials: list[VialROI] = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        if x <= 2 or y <= 2 or x + cw >= fw - 2 or y + ch >= h - 2:
            continue
        aspect = cw / ch if ch > 0 else 0
        if aspect < aspect_range[0] or aspect > aspect_range[1]:
            continue
        vials.append(
            VialROI(
                x=x, y=y, w=cw, h=ch, area=area,
                centre=(float(x + cw // 2), float(y + ch // 2)),
            )
        )

    vials.sort(key=lambda v: v.area, reverse=True)
    return vials[:max_vials]


def find_trial_cup(frame: np.ndarray) -> VialROI | None:
    """Detect the main trial cup (larger than single-dose vials)."""
    vials = find_vials(frame, min_area=2000, aspect_range=(0.5, 1.8))
    if not vials:
        return None
    h, w = frame.shape[:2]
    cx_min, cx_max = w // 3, 2 * w // 3
    centre_vials = [v for v in vials if cx_min < v.centre[0] < cx_max]
    return centre_vials[0] if centre_vials else vials[0]


# ── Liquid colour analysis (pH) ──────────────────────────────────────────

def classify_colours_in_roi(frame: np.ndarray, roi: tuple[int, int, int, int]) -> dict[str, int]:
    """Count pixels per pH colour class inside the given ROI."""
    x, y, w, h = roi
    if w < 3 or h < 3:
        return {}
    region = frame[y : y + h, x : x + w]
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    counts: dict[str, int] = {}
    for name, (lower, upper) in _HSV_RANGES.items():
        mask = cv2.inRange(hsv, lower, upper)
        mask = cv2.erode(mask, None, iterations=1)
        mask = cv2.dilate(mask, None, iterations=1)
        counts[name] = int(cv2.countNonZero(mask))
    return counts


def infer_vial_ph(frame: np.ndarray, vial: VialROI | tuple[int, int, int, int]) -> PHResult:
    """Infer pH of vial liquid from bromothymol blue indicator colour.

    Analyses the interior of the vial (with an inset to avoid wall
    reflections) and returns the dominant pH colour class.
    """
    if isinstance(vial, VialROI):
        roi = vial.roi
    else:
        roi = vial

    x, y, w, h = roi
    inset = 0.2
    inner = (
        int(x + w * inset),
        int(y + h * inset),
        max(1, int(w * (1 - 2 * inset))),
        max(1, int(h * (1 - 2 * inset))),
    )

    counts = classify_colours_in_roi(frame, inner)
    total = sum(counts.values())
    if total == 0:
        return PHResult(ph=7.0, colour="unknown", confidence=0.0, pixel_counts=counts)

    dominant = max(counts, key=counts.get)
    ratio = counts[dominant] / total
    estimated_ph = _PH_MAP.get(dominant, 7.0)
    confidence = min(1.0, ratio * 1.5)

    return PHResult(ph=estimated_ph, colour=dominant, confidence=round(confidence, 3), pixel_counts=counts)


def estimate_ph_from_frame(frame: np.ndarray) -> list[dict[str, Any]]:
    """Find vials in frame and infer pH for each. Returns list of dicts."""
    vials = find_vials(frame)
    results = []
    for i, vial in enumerate(vials):
        ph = infer_vial_ph(frame, vial)
        results.append({
            "vial_index": i,
            "centre_x": vial.centre[0],
            "centre_y": vial.centre[1],
            "ph": ph.ph,
            "colour": ph.colour,
            "confidence": ph.confidence,
            "width": vial.w,
            "height": vial.h,
        })
    return results


# ── Vial identity reasoning ───────────────────────────────────────────────

def infer_vial_identity(ph_result: PHResult) -> dict[str, Any]:
    """Map pH result to likely reagent identity.

    Experiment reagents:
      - vinegar (5% acetic acid)  → pH ~ 2–3   → yellow
      - saturated NaCl            → pH ~ 7     → green
      - baking soda (NaHCO₃)      → pH ~ 8–9   → blue
      - borax (Na₂B₄O₇)           → pH ~ 9–10  → blue (deeper)

    Returns dict with ``identity``, ``ph``, ``confidence``, ``colour``.
    """
    ph = ph_result.ph
    colour = ph_result.colour
    confidence = ph_result.confidence

    if colour == "yellow":
        identity = "vinegar (acetic acid)"
        if ph > 5.5:
            confidence *= 0.5
    elif colour == "yellow-green":
        identity = "vinegar (weak) or NaCl"
        confidence *= 0.7
    elif colour == "green":
        identity = "NaCl solution"
    elif colour == "blue-green":
        identity = "baking soda (NaHCO₃)"
        confidence *= 0.8
    elif colour == "blue":
        identity = "baking soda or borax"
        confidence *= 0.6
    else:
        identity = "unknown"
        confidence = 0.0

    return {
        "identity": identity,
        "ph": round(ph, 1),
        "colour": colour,
        "confidence": round(confidence, 2),
    }


# ── Multimeter probe detection ────────────────────────────────────────────

def find_probe_tips(frame: np.ndarray) -> ProbeROI | None:
    """Locate multimeter probe tips (near-vertical metallic lines)."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 100)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=50, minLineLength=30, maxLineGap=10)

    if lines is None or len(lines) < 2:
        return None

    verticals = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
        if angle > 60:
            verticals.append(((x1 + x2) // 2, max(y1, y2), min(y1, y2)))

    if len(verticals) < 2:
        return None

    verticals.sort(key=lambda p: p[0])
    left = (verticals[0][0], verticals[0][1])
    right = (verticals[-1][0], verticals[-1][1])
    spacing = abs(right[0] - left[0])

    return ProbeROI(
        left_tip=left,
        right_tip=right,
        spacing_px=float(spacing),
        centre=((left[0] + right[0]) / 2, (left[1] + right[1]) / 2),
    )


# ── DMM display analysis ─────────────────────────────────────────────────

def read_multimeter_display(frame: np.ndarray, roi: tuple[int, int, int, int] | None = None) -> dict[str, Any]:
    """Analyse the DMM display region.

    Returns segment count and bounding info. Full OCR requires
    pytesseract or a VLM call (e.g. ``look(question)``).
    """
    x, y, w, h = roi if roi else (0, 0, frame.shape[1], frame.shape[0])
    display_roi = frame[y : y + h, x : x + w]
    gray = cv2.cvtColor(display_roi, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    segments = [c for c in contours if 10 < cv2.contourArea(c) < 500]

    return {
        "raw_value": None,
        "unit": "ohm",
        "num_segments": len(segments),
        "roi": (x, y, w, h),
        "note": "Install pytesseract for OCR, or use look(question) VLM tool",
    }


# ── Reference image analysis ──────────────────────────────────────────────

def load_reference() -> np.ndarray:
    """Load the bromothymol blue reference chart as a BGR image."""
    img = cv2.imread(str(REFERENCE_PATH), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"Reference image not found: {REFERENCE_PATH}")
    return img


def calibrate_ranges_from_reference() -> dict[str, dict[str, Any]]:
    """Read the reference image and return calibrated colour descriptions.

    Returns a dict keyed by colour name with HSV centroids and
    bounding-box positions for each patch.
    """
    img = load_reference()
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    patches: list[dict[str, Any]] = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 100:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        roi = img[y : y + ch, x : x + cw]
        avg_bgr = roi.mean(axis=(0, 1))
        avg_hsv = cv2.cvtColor(np.uint8([[avg_bgr]]), cv2.COLOR_BGR2HSV)[0, 0]
        patches.append({
            "pos": (x, y, cw, ch),
            "avg_bgr": [int(v) for v in avg_bgr],
            "avg_hsv": [int(v) for v in avg_hsv],
            "area": int(area),
        })

    patches.sort(key=lambda p: (p["pos"][1], p["pos"][0]))
    return {"patches": patches, "num_patches": len(patches)}


# ── Annotation helpers ────────────────────────────────────────────────────

def annotate_frame(frame: np.ndarray, vials: list[VialROI], ph_results: list[PHResult]) -> np.ndarray:
    """Draw vial bounding boxes and pH labels on the frame."""
    out = frame.copy()
    for i, vial in enumerate(vials):
        x, y, w, h = vial.roi
        cv2.rectangle(out, (x, y), (x + w, y + h), (0, 255, 0), 2)
        if i < len(ph_results):
            label = f"Vial {i}: pH {ph_results[i].ph} ({ph_results[i].colour})"
            cv2.putText(out, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    return out
