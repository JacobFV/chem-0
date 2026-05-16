#!/usr/bin/env python3
"""Stdio MCP server entrypoint for chem-0."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from chem0.mcp_server import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
