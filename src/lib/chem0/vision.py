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


def capture_frame(
    camera_id: int = 0,
    width: int | None = None,
    height: int | None = None,
    exposure: int | None = None,
) -> np.ndarray:
    """Capture a single frame from the camera.

    Mirrors the logic in ``core.py:_capture_frame``.
    If *exposure* is set, it is passed to ``CAP_PROP_EXPOSURE``
    (negative values = less exposure on macOS AVFoundation).
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
        if exposure is not None:
            cap.set(cv2.CAP_PROP_EXPOSURE, exposure)
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


# ── Blue cap detection ───────────────────────────────────────────────────

# HSV range for blue plastic vial caps
_BLUE_CAP_LOWER = np.array([100, 60, 60])
_BLUE_CAP_UPPER = np.array([135, 255, 255])


def has_blue_cap(frame: np.ndarray, vial: VialROI, cap_ratio_threshold: float = 0.05) -> bool:
    """Check whether a detected vial has a blue cap on top.

    Looks for blue pixels in the top 30% of the bounding box (cap region).
    Returns True if the fraction of blue pixels there exceeds *cap_ratio_threshold*.
    """
    x, y, w, h = vial.roi
    cap_h = max(1, int(h * 0.3))
    cap_roi = frame[y : y + cap_h, x : x + w]
    hsv = cv2.cvtColor(cap_roi, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, _BLUE_CAP_LOWER, _BLUE_CAP_UPPER)
    blue_px = cv2.countNonZero(mask)
    total_px = w * cap_h
    return (blue_px / total_px) > cap_ratio_threshold


def find_cap_bottom(frame: np.ndarray, vial: VialROI) -> int:
    """Scan downward from the top of the vial ROI to find where the blue cap ends.

    Returns the y-coordinate of the first row where blue pixel fraction
    drops below 5% (i.e. the cap/liquid boundary).
    """
    x, y, w, h = vial.roi
    cap_h = max(1, int(h * 0.4))
    for dy in range(cap_h):
        row = frame[y + dy : y + dy + 1, x : x + w]
        hsv = cv2.cvtColor(row, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, _BLUE_CAP_LOWER, _BLUE_CAP_UPPER)
        blue_frac = cv2.countNonZero(mask) / max(w, 1)
        if blue_frac < 0.05:
            return y + dy
    return y + int(h * 0.35)


def find_vials_with_blue_cap(
    frame: np.ndarray,
    min_area: int = 500,
    max_vials: int = 6,
    aspect_range: tuple[float, float] = (0.3, 3.0),
    cap_ratio_threshold: float = 0.05,
) -> list[VialROI]:
    """Like :func:`find_vials` but only returns vials whose top region contains
    a blue cap."""
    candidates = find_vials(frame, min_area, max_vials * 3, aspect_range)
    filtered = [v for v in candidates if has_blue_cap(frame, v, cap_ratio_threshold)]
    return filtered[:max_vials]


# ── Liquid colour analysis (pH) ──────────────────────────────────────────

# Reference patch cache: loaded once from bromothymol-blue-reference.avif
_REFERENCE_PATCHES: list[dict[str, Any]] | None = None


def _load_reference_patches() -> list[dict[str, Any]]:
    """Load and cache reference colour patches, returning per-patch avg HSV + label."""
    global _REFERENCE_PATCHES
    if _REFERENCE_PATCHES is not None:
        return _REFERENCE_PATCHES

    img = load_reference()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    patches: list[dict[str, Any]] = []
    # Reference colour labels based on known row/col layout of the chart.
    # Bottom row: saturated; top row: dilute. Cols: yellow, yel/grn, green, blu/grn, blue.
    labels = [
        "yellow", "yellow-green", "green", "blue-green", "blue",
        "yellow", "yellow-green", "green", "blue-green", "blue",
    ]
    label_idx = 0
    for c in contours:
        area = cv2.contourArea(c)
        if area < 100:
            continue
        x, y, cw, ch = cv2.boundingRect(c)
        roi = img[y : y + ch, x : x + cw]
        avg_bgr = roi.mean(axis=(0, 1))
        avg_hsv = cv2.cvtColor(np.uint8([[avg_bgr]]), cv2.COLOR_BGR2HSV)[0, 0]
        patches.append({
            "label": labels[label_idx] if label_idx < len(labels) else "unknown",
            "pos": (x, y, cw, ch),
            "avg_hsv": np.array([int(v) for v in avg_hsv], dtype=np.float64),
        })
        label_idx += 1

    patches.sort(key=lambda p: (p["pos"][1], p["pos"][0]))
    _REFERENCE_PATCHES = patches
    return patches


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


def _classify_by_reference_comparison(liquid_roi_hsv: np.ndarray) -> tuple[str, float, dict[str, int]]:
    """Classify liquid colour by comparing per-pixel HSV to nearest reference patch.

    For each pixel in the ROI, finds the nearest reference-patch HSV centroid
    and votes for that label. Returns (dominant_label, confidence, vote_counts).
    """
    refs = _load_reference_patches()
    h, w = liquid_roi_hsv.shape[:2]
    pixels = liquid_roi_hsv.reshape(-1, 3).astype(np.float64)

    votes: dict[str, int] = {}
    for r in refs:
        votes.setdefault(r["label"], 0)

    # For performance, only sample 1/4 of the pixels
    step = 2
    sampled = pixels[::step]

    for px_hsv in sampled:
        best_label = "unknown"
        best_dist = float("inf")
        for r in refs:
            dist = np.linalg.norm(px_hsv - r["avg_hsv"])
            if dist < best_dist:
                best_dist = dist
                best_label = r["label"]
        votes[best_label] = votes.get(best_label, 0) + 1

    total = sum(votes.values())
    if total == 0:
        return "unknown", 0.0, votes

    dominant = max(votes, key=votes.get)
    ratio = votes[dominant] / total
    confidence = min(1.0, ratio * 1.3)
    return dominant, round(confidence, 3), votes


def _liquid_roi_below_cap(frame: np.ndarray, vial: VialROI) -> tuple[int, int, int, int]:
    """Return the liquid ROI rectangle (x, y, w, h) below the blue cap.

    Uses find_cap_bottom to get the cap/liquid boundary, then insets
    15% from each side and 10% from the bottom to avoid walls/reflections.
    """
    x, y, w, h = vial.roi
    cap_bottom = find_cap_bottom(frame, vial)
    liquid_top = cap_bottom + max(1, int((y + h - cap_bottom) * 0.1))
    side_inset = max(1, int(w * 0.15))
    bottom_inset = max(1, int((y + h - liquid_top) * 0.1))
    return (
        x + side_inset,
        liquid_top,
        max(1, w - 2 * side_inset),
        max(1, (y + h - bottom_inset) - liquid_top),
    )


def infer_vial_ph(frame: np.ndarray, vial: VialROI | tuple[int, int, int, int]) -> PHResult:
    """Infer pH of vial liquid from bromothymol blue indicator colour.

    First identifies the liquid region below the blue cap, then classifies
    colour by:
      1. Reference-patch nearest-neighbour comparison (primary)
      2. Static HSV range thresholding (fallback)

    Returns the dominant pH colour class with confidence.
    """
    if isinstance(vial, VialROI):
        roi = vial.roi
    else:
        roi = vial
        return _infer_vial_ph_fallback(frame, roi)

    # Get liquid-only ROI, excluding cap
    liquid_roi = _liquid_roi_below_cap(frame, vial)
    lx, ly, lw, lh = liquid_roi
    if lw < 3 or lh < 3:
        return _infer_vial_ph_fallback(frame, roi)

    liquid_region = frame[ly : ly + lh, lx : lx + lw]
    liquid_hsv = cv2.cvtColor(liquid_region, cv2.COLOR_BGR2HSV)

    # Primary: reference comparison
    ref_label, ref_conf, ref_votes = _classify_by_reference_comparison(liquid_hsv)

    # Fallback: static HSV ranges
    hsv_counts: dict[str, int] = {}
    for name, (lower, upper) in _HSV_RANGES.items():
        mask = cv2.inRange(liquid_hsv, lower, upper)
        mask = cv2.erode(mask, None, iterations=1)
        mask = cv2.dilate(mask, None, iterations=1)
        hsv_counts[name] = int(cv2.countNonZero(mask))

    hsv_total = sum(hsv_counts.values())
    hsv_dominant = max(hsv_counts, key=hsv_counts.get) if hsv_total > 0 else "unknown"
    hsv_ratio = hsv_counts.get(hsv_dominant, 0) / max(hsv_total, 1)
    hsv_confidence = min(1.0, hsv_ratio * 1.5)

    # Use reference if confident enough, otherwise fall back
    if ref_conf >= 0.4 and ref_label != "unknown":
        colour = ref_label
        confidence = ref_conf
        ph = _PH_MAP.get(colour, 7.0)
        counts = ref_votes
    elif hsv_total > 0:
        colour = hsv_dominant
        confidence = hsv_confidence
        ph = _PH_MAP.get(colour, 7.0)
        counts = hsv_counts
    else:
        colour = "unknown"
        confidence = 0.0
        ph = 7.0
        counts = {}

    return PHResult(ph=ph, colour=colour, confidence=round(confidence, 3), pixel_counts=counts)


def _infer_vial_ph_fallback(frame: np.ndarray, roi: tuple[int, int, int, int]) -> PHResult:
    """Fallback pH inference using uniform 20% inset (used when vial is a raw tuple)."""
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

def infer_vial_identity(
    ph_result: PHResult,
    vial: VialROI | None = None,
    frame_shape: tuple[int, int] | None = None,
) -> dict[str, Any]:
    """Map pH result to likely reagent identity, with explicit reasoning.

    Experiment reagents:
      - vinegar (5% acetic acid)  → pH ~ 2–3   → yellow
      - saturated NaCl            → pH ~ 7     → green
      - baking soda (NaHCO₃)      → pH ~ 8–9   → blue
      - borax (Na₂B₄O₇)           → pH ~ 9–10  → blue (deeper)

    Returns dict with ``identity``, ``ph``, ``confidence``, ``colour`` and
    a ``reasoning`` list narrating how the inference was arrived at.
    """
    ph = ph_result.ph
    colour = ph_result.colour
    confidence = ph_result.confidence
    counts = ph_result.pixel_counts or {}
    total = sum(counts.values()) if counts else 0
    ratio = (counts.get(colour, 0) / total) if total > 0 else 0.0

    reasoning: list[str] = []

    if vial is not None:
        reasoning.append(
            f"ROI is {vial.w}x{vial.h}px (area≈{int(vial.area)}px²) centred at "
            f"({vial.centre[0]:.0f}, {vial.centre[1]:.0f})."
        )
        if frame_shape is not None:
            fh, fw = frame_shape[:2]
            side = "left" if vial.centre[0] < fw / 3 else (
                "right" if vial.centre[0] > 2 * fw / 3 else "centre"
            )
            vert = "top" if vial.centre[1] < fh / 3 else (
                "bottom" if vial.centre[1] > 2 * fh / 3 else "middle"
            )
            reasoning.append(f"Position in frame: {vert}-{side}.")
        if vial.area < 1500:
            reasoning.append(
                "Area < 1500px² — small ROI, likely a vial cap or cap-sized object; "
                "liquid colour may be obscured."
            )

    if total == 0:
        reasoning.append(
            "No pixels fell inside any pH HSV class (yellow/yellow-green/green/"
            "blue-green/blue). ROI is likely not a coloured liquid; possible "
            "background, grey hardware, or label."
        )
    else:
        breakdown = ", ".join(
            f"{k}={v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1]) if v > 0
        )
        reasoning.append(
            f"HSV pixel votes ({total} classified px): {breakdown}. Dominant "
            f"class '{colour}' captured {ratio*100:.0f}% of classified pixels."
        )

    if colour == "yellow":
        identity = "vinegar (acetic acid)"
        reasoning.append(
            "Yellow on bromothymol blue → pH ≲ 6 → strong acid in indicator water → "
            "matches reagent A (white vinegar / 5% acetic acid)."
        )
        if ph > 5.5:
            confidence *= 0.5
            reasoning.append("pH > 5.5 dampens vinegar confidence by 0.5.")
    elif colour == "yellow-green":
        identity = "vinegar (weak) or NaCl"
        confidence *= 0.7
        reasoning.append(
            "Yellow-green is the indicator transition band (pH≈5.8–6.5). "
            "Consistent with diluted vinegar or near-neutral NaCl; confidence ×0.7."
        )
    elif colour == "green":
        identity = "NaCl solution"
        reasoning.append(
            "Green ≈ pH 6.8–7.2 on bromothymol blue → neutral salt solution → "
            "matches reagent B (saturated NaCl)."
        )
    elif colour == "blue-green":
        identity = "baking soda (NaHCO₃)"
        confidence *= 0.8
        reasoning.append(
            "Blue-green ≈ pH 7.4–7.8, mildly alkaline → consistent with NaHCO₃ "
            "buffer; confidence ×0.8 since borax can also sit here when dilute."
        )
    elif colour == "blue":
        identity = "baking soda or borax"
        confidence *= 0.6
        reasoning.append(
            "Solid blue → pH ≳ 8. Both NaHCO₃ and borax produce blue indicator. "
            "Confidence ×0.6 because the experiment uses borax (reagent C) as the "
            "alkaline source but NaHCO₃ is plausible. CAVEAT: single-dose vials in "
            "this rig are pre-staged WITHOUT indicator, so a blue blob on a small "
            "vial-cap-sized ROI is more likely the cap colour than indicator-stained "
            "liquid."
        )
    else:
        identity = "unknown"
        confidence = 0.0
        reasoning.append(
            "No bromothymol-blue colour match. Identity cannot be inferred from "
            "this ROI alone; need a wider view of the liquid surface or a VLM call."
        )

    return {
        "identity": identity,
        "ph": round(ph, 1),
        "colour": colour,
        "confidence": round(confidence, 2),
        "reasoning": reasoning,
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

# HSV ranges for multimeter detection
_DMM_BLACK_LOWER = np.array([0, 0, 0])
_DMM_BLACK_UPPER = np.array([180, 60, 80])
_DMM_LCD_LOWER = np.array([40, 5, 60])
_DMM_LCD_UPPER = np.array([120, 60, 220])

_SUFFIX_MAP = {
    "k": 1_000, "K": 1_000, "M": 1_000_000, "m": 0.001,
    "Ω": 1, "ohm": 1, "": 1,
}


def find_multimeter_display(
    frame: np.ndarray,
    roi_hint: tuple[int, int, int, int] | None = None,
) -> dict[str, Any]:
    """Locate the multimeter's LCD display region in the frame.

    1. Search the upper portion of the frame for a dark rectangular body
       (black multimeter casing).
    2. Inside that body, find a gray-green rectangular region (the LCD).
    3. Return the LCD bounding box in full-frame coordinates.

    If *roi_hint* is given, skip detection and use that as the LCD ROI directly.
    """
    if roi_hint is not None:
        x, y, w, h = roi_hint
        return {"found": True, "lcd_roi": (x, y, w, h), "body_roi": None}

    h, fw = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # 1. Find dark (black) regions → multimeter body candidates
    dark_mask = cv2.inRange(hsv, _DMM_BLACK_LOWER, _DMM_BLACK_UPPER)
    dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    dark_contours, _ = cv2.findContours(dark_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # 2. Find gray-green regions → LCD candidates
    lcd_mask = cv2.inRange(hsv, _DMM_LCD_LOWER, _DMM_LCD_UPPER)
    lcd_mask = cv2.morphologyEx(lcd_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    best = {"found": False, "lcd_roi": None, "body_roi": None, "score": 0.0}

    for dc in dark_contours:
        da = cv2.contourArea(dc)
        if da < 2000:
            continue
        dx, dy, dw, dh = cv2.boundingRect(dc)
        if dy > h * 0.55:  # only upper half
            continue
        dar = dw / max(dh, 1)
        if dar < 0.3 or dar > 4:
            continue

        # Gray-green overlap inside this dark body
        body_lcd = lcd_mask[dy : dy + dh, dx : dx + dw]
        gg_px = cv2.countNonZero(body_lcd)
        gg_frac = gg_px / da if da > 0 else 0

        if gg_frac < 0.05:
            continue

        # Find the largest contiguous gray-green region inside (the LCD)
        lcd_contours, _ = cv2.findContours(body_lcd, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for lc in lcd_contours:
            la = cv2.contourArea(lc)
            if la < 200:
                continue
            lx, ly, lw, lh = cv2.boundingRect(lc)
            lar = lw / max(lh, 1)
            if lar < 0.5 or lar > 8:
                continue
            if lh > dh * 0.6:
                continue

            # Score: prefers larger LCD area, aspect ratio ~1.5-4 (typical LCD)
            ar_score = 1.0 - abs(lar - 2.5) / 4.0
            score = la * (gg_frac * 10) * max(0, ar_score)

            if score > best["score"]:
                best.update({
                    "found": True,
                    "lcd_roi": (dx + lx, dy + ly, lw, lh),
                    "body_roi": (dx, dy, dw, dh),
                    "score": score,
                })

    return best


def _preprocess_lcd_for_ocr(lcd_region: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Preprocess the LCD grayscale region for pytesseract.

    Returns (otsu_thresh, inverted_thresh, upscaled_gray).
    """
    if lcd_region.size == 0:
        return np.array([[]]), np.array([[]]), np.array([[]])

    # Upscale 2x for better OCR
    h, w = lcd_region.shape[:2]
    up = cv2.resize(lcd_region, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)

    # Sharpen
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharp = cv2.filter2D(up, -1, kernel)

    # Otsu threshold (dark digits on bright background)
    _, otsu = cv2.threshold(sharp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Inverted (bright digits on dark background)
    inv = cv2.bitwise_not(otsu)

    return otsu, inv, up


def read_multimeter_display(
    frame: np.ndarray,
    roi: tuple[int, int, int, int] | None = None,
    search: bool = True,
) -> dict[str, Any]:
    """Analyse the DMM display region and read the resistance value.

    Args:
        frame: BGR camera frame.
        roi: Optional (x, y, w, h) of the LCD display in full-frame coords.
        search: If True and no *roi* given, auto-detect the multimeter LCD.

    Returns dict with ``raw_value`` (float or None), ``unit``, ``display_text``,
    ``lcd_roi``, ``body_roi``, and ``method``.
    """
    result: dict[str, Any] = {
        "raw_value": None,
        "unit": "ohm",
        "display_text": "",
        "lcd_roi": None,
        "body_roi": None,
        "method": "none",
    }

    if roi is None and search:
        detection = find_multimeter_display(frame)
        if detection["found"]:
            roi = detection["lcd_roi"]
            result["body_roi"] = detection["body_roi"]
            result["method"] = "auto_detect"
    elif roi is not None:
        result["method"] = "manual_roi"
    else:
        return result

    if roi is None:
        return result

    x, y, w, h = roi
    result["lcd_roi"] = (x, y, w, h)

    lcd_region = frame[y : y + h, x : x + w]
    if lcd_region.size == 0:
        return result

    gray = cv2.cvtColor(lcd_region, cv2.COLOR_BGR2GRAY)
    otsu, inv, up = _preprocess_lcd_for_ocr(gray)

    try:
        import pytesseract
    except ImportError:
        result["note"] = "pytesseract not installed"
        return result

    # Try multiple OCR configs
    configs = [
        ("otsu", otsu, "--psm 7 -c tessedit_char_whitelist=0123456789.kKMOm"),
        ("inv", inv, "--psm 7 -c tessedit_char_whitelist=0123456789.kKMOm"),
        ("up", up, "--psm 7 -c tessedit_char_whitelist=0123456789.kKMOm"),
        ("otsu_6", otsu, "--psm 6"),
    ]

    best_text = ""
    for label, img, cfg in configs:
        if img.size <= 1 or img.shape[0] < 4 or img.shape[1] < 4:
            continue
        try:
            text = pytesseract.image_to_string(img, config=cfg).strip()
        except Exception:
            text = ""
        if len(text) > len(best_text):
            best_text = text

    result["display_text"] = best_text

    # Parse the value
    parsed = _parse_dmm_display(best_text)
    if parsed is not None:
        result["raw_value"], result["unit"] = parsed

    return result


def _parse_dmm_display(text: str) -> tuple[float, str] | None:
    """Parse a DMM display string like '12.45kΩ' or '0.998M' into (ohms, unit)."""
    if not text:
        return None

    import re
    # Strip whitespace, replace common OCR confusions
    cleaned = text.strip()
    cleaned = cleaned.replace("O", "0").replace("o", "0")
    cleaned = cleaned.replace("l", "1").replace("I", "1")
    cleaned = cleaned.replace(",", ".")

    # Match patterns like: 12.45, 12.45k, 0.998M, 4.7kΩ, etc.
    m = re.match(r"([-+]?\d*\.?\d+)\s*([kKMmΩ]?)(?:Ω|ohm)?", cleaned)
    if not m:
        m = re.match(r"([-+]?\d*\.?\d+)\s*([kKMm]?)", cleaned)
    if not m:
        return None

    value = float(m.group(1))
    suffix = m.group(2)

    multiplier = _SUFFIX_MAP.get(suffix, 1)
    ohms = value * multiplier

    # Determine unit string
    if suffix in ("k", "K"):
        unit = "kΩ"
    elif suffix == "M":
        unit = "MΩ"
    elif suffix == "m":
        unit = "mΩ"
    else:
        unit = "Ω"

    return (ohms, unit)


# ── Chemical lookup by pH + resistivity ─────────────────────────────────

# Conductivity/resistivity ranges for common chemicals at typical concentrations
# Resistivity in Ω·cm (ohm-centimeters)
_CHEMICAL_DB: list[dict[str, Any]] = [
    {
        "name": "vinegar (acetic acid 5%)",
        "ph_min": 2.0, "ph_max": 3.5,
        "resistivity_min": 10, "resistivity_max": 100,  # Ω·cm
        "conductivity": "weak electrolyte",
    },
    {
        "name": "vinegar (acetic acid 5%)",
        "ph_min": 2.5, "ph_max": 4.0,
        "resistivity_min": 100, "resistivity_max": 500,
        "conductivity": "weak electrolyte",
    },
    {
        "name": "NaCl solution (saturated)",
        "ph_min": 6.0, "ph_max": 7.5,
        "resistivity_min": 5, "resistivity_max": 30,
        "conductivity": "strong electrolyte",
    },
    {
        "name": "NaCl solution (dilute)",
        "ph_min": 6.0, "ph_max": 7.5,
        "resistivity_min": 30, "resistivity_max": 200,
        "conductivity": "moderate electrolyte",
    },
    {
        "name": "baking soda (NaHCO₃)",
        "ph_min": 7.5, "ph_max": 9.0,
        "resistivity_min": 10, "resistivity_max": 100,
        "conductivity": "moderate electrolyte",
    },
    {
        "name": "borax (Na₂B₄O₇)",
        "ph_min": 8.5, "ph_max": 10.0,
        "resistivity_min": 20, "resistivity_max": 150,
        "conductivity": "moderate electrolyte",
    },
    {
        "name": "deionized water",
        "ph_min": 6.0, "ph_max": 7.5,
        "resistivity_min": 100_000, "resistivity_max": 18_000_000,
        "conductivity": "very weak",
    },
    {
        "name": "tap water",
        "ph_min": 6.0, "ph_max": 8.0,
        "resistivity_min": 1_000, "resistivity_max": 50_000,
        "conductivity": "weak",
    },
]


def lookup_by_ph_and_resistivity(
    ph: float,
    resistivity_ohms: float | None,
    probe_spacing_cm: float = 1.0,
) -> dict[str, Any]:
    """Look up the most likely chemical based on pH and resistivity.

    Args:
        ph: Measured pH value.
        resistivity_ohms: Measured resistance in ohms from the DMM.
            If None, only pH-based inference is used.
        probe_spacing_cm: Distance between probe tips in cm.
            The DMM reads R (ohms). Resistivity ρ = R × A / L, but for
            a two-probe measurement in solution we approximate
            ρ (Ω·cm) ≈ R (Ω) × probe_spacing_cm.

    Returns dict with ``identity``, ``confidence``, ``ph``, ``resistivity``,
    ``conductivity`` and ``matches`` list.
    """
    matches: list[dict[str, Any]] = []

    for entry in _CHEMICAL_DB:
        score = 0.0
        reasons: list[str] = []

        # pH match
        if entry["ph_min"] <= ph <= entry["ph_max"]:
            ph_range = entry["ph_max"] - entry["ph_min"]
            ph_center = (entry["ph_min"] + entry["ph_max"]) / 2
            ph_dist = abs(ph - ph_center) / max(ph_range, 0.1)
            ph_score = max(0, 1.0 - ph_dist)
            score += ph_score * 2
            reasons.append(f"pH {ph:.1f} in range [{entry['ph_min']}-{entry['ph_max']}]")

        if resistivity_ohms is not None:
            resistivity = resistivity_ohms * probe_spacing_cm
            if entry["resistivity_min"] <= resistivity <= entry["resistivity_max"]:
                res_range = entry["resistivity_max"] - entry["resistivity_min"]
                res_center = (entry["resistivity_min"] + entry["resistivity_max"]) / 2
                res_dist = abs(resistivity - res_center) / max(res_range, 0.1)
                res_score = max(0, 1.0 - res_dist)
                score += res_score * 3  # resistivity weighs more
                reasons.append(
                    f"resistivity {resistivity:.0f} Ω·cm in range "
                    f"[{entry['resistivity_min']}-{entry['resistivity_max']}]"
                )
        else:
            resistivity = None

        if score > 0:
            matches.append({
                "identity": entry["name"],
                "conductivity": entry["conductivity"],
                "score": round(score, 1),
                "reasons": reasons,
                "resistivity_ohm_cm": round(resistivity, 1) if resistivity else None,
            })

    matches.sort(key=lambda m: m["score"], reverse=True)

    best = matches[0] if matches else None
    confidence = best["score"] / 10 if best else 0.0

    return {
        "identity": best["identity"] if best else "unknown",
        "confidence": round(min(confidence, 1.0), 2),
        "ph": round(ph, 1),
        "resistivity_ohm_cm": round(resistivity_ohms * probe_spacing_cm, 1)
            if resistivity_ohms is not None else None,
        "conductivity": best["conductivity"] if best else "unknown",
        "matches": matches,
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
    """Draw vial bounding boxes (green) and liquid-only ROIs (cyan) with pH labels."""
    out = frame.copy()
    for i, vial in enumerate(vials):
        x, y, w, h = vial.roi
        cv2.rectangle(out, (x, y), (x + w, y + h), (0, 255, 0), 2)
        # Draw liquid-only ROI in cyan
        try:
            lx, ly, lw, lh = _liquid_roi_below_cap(frame, vial)
            cv2.rectangle(out, (lx, ly), (lx + lw, ly + lh), (255, 255, 0), 1)
        except Exception:
            pass
        if i < len(ph_results):
            label = f"Vial {i}: pH {ph_results[i].ph} ({ph_results[i].colour})"
            cv2.putText(out, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            # Also label liquid ROI colour
            cv2.putText(out, f"liquid", (lx, ly - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
    return out
