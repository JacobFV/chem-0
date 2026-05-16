#!/usr/bin/env python3
"""Stdio MCP framing for chem-0.

Robot, camera, kinematics, and tool implementation live in `chem0.core`.
This module is intentionally only JSON-RPC/MCP transport glue.
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

from chem0.core import HANDLERS, RESOURCES, STATE, TOOLS, read_resource


PROTOCOL_VERSION = "2024-11-05"


def _jsonrpc_result(msg_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _jsonrpc_error(msg_id: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": msg_id, "error": err}


def _write_message(message: dict[str, Any]) -> None:
    body = json.dumps(message, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii"))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def handle(request: dict[str, Any]) -> dict[str, Any] | None:
    method = request.get("method")
    msg_id = request.get("id")

    if msg_id is None:
        return None

    try:
        if method == "initialize":
            return _jsonrpc_result(
                msg_id,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {}, "resources": {}},
                    "serverInfo": {"name": "lerobot-mcp", "version": "0.1.0"},
                },
            )
        if method == "resources/list":
            return _jsonrpc_result(msg_id, {"resources": RESOURCES})
        if method == "resources/read":
            params = request.get("params") or {}
            return _jsonrpc_result(msg_id, read_resource(params.get("uri", "")))
        if method == "tools/list":
            return _jsonrpc_result(msg_id, {"tools": TOOLS})
        if method == "tools/call":
            params = request.get("params") or {}
            name = params.get("name")
            args = params.get("arguments") or {}
            if name not in HANDLERS:
                return _jsonrpc_error(msg_id, -32602, f"Unknown tool: {name}")
            return _jsonrpc_result(msg_id, HANDLERS[name](args))
        return _jsonrpc_error(msg_id, -32601, f"Method not found: {method}")
    except Exception as exc:
        return _jsonrpc_error(
            msg_id,
            -32000,
            str(exc),
            {"traceback": traceback.format_exc(limit=8)},
        )


def _read_message() -> dict[str, Any] | None:
    """Read one MCP stdio message.

    MCP stdio uses Content-Length framing. A newline-delimited JSON fallback is
    kept for easy shell smoke tests.
    """
    first = sys.stdin.buffer.readline()
    if not first:
        return None

    if first.lstrip().startswith(b"{"):
        return json.loads(first)

    headers: dict[str, str] = {}
    line = first
    while line not in (b"\r\n", b"\n", b""):
        name, _, value = line.decode("ascii").partition(":")
        headers[name.lower()] = value.strip()
        line = sys.stdin.buffer.readline()

    length = int(headers["content-length"])
    body = sys.stdin.buffer.read(length)
    return json.loads(body)


def main() -> int:
    while True:
        try:
            request = _read_message()
        except Exception as exc:
            _write_message(_jsonrpc_error(None, -32700, f"Parse error: {exc}"))
            continue

        if request is None:
            break

        response = handle(request)
        if response is not None:
            _write_message(response)

    if STATE.connected:
        STATE.robot.disconnect()
    return 0
