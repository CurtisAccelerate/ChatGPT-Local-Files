# path: ChatGPT-Server/routes.py
import io
import os
import shutil
import subprocess
import textwrap
import json
import datetime
import pathlib
from contextlib import redirect_stdout
from typing import Any, Optional, Tuple
from flask import request, jsonify
import tomllib

# ── Directory configuration ─────────────────────────────
CONFIG_FILE = pathlib.Path(__file__).with_name("config.toml")
DEFAULT_CONFIG = {"workspace": {"roots": ["Work"]}}

if CONFIG_FILE.exists():
    with open(CONFIG_FILE, "rb") as f:
        _cfg = tomllib.load(f)
else:
    _cfg = DEFAULT_CONFIG

WORK_ROOTS = [pathlib.Path(p).expanduser().resolve()
              for p in _cfg.get("workspace", {}).get("roots", ["Work"])]

for root in WORK_ROOTS:
    root.mkdir(parents=True, exist_ok=True)

WORK_PATH = WORK_ROOTS[0]
TARGET_PATH = str(WORK_PATH / "work.py")
if not os.path.exists(TARGET_PATH):
    open(TARGET_PATH, "w", encoding="utf-8").close()

# ── Python exec environment ─────────────────────────────
exec_globals: dict[str, Any] = {}
with open(TARGET_PATH, 'r', encoding='utf-8') as f:
    exec(f.read(), exec_globals)

def _run_python(code: str) -> str:
    buf = io.StringIO()
    with redirect_stdout(buf):
        try:
            exec(code, exec_globals)
            printed = buf.getvalue().strip()
            last_line = code.strip().split('\n')[-1]
            val = eval(last_line, exec_globals)
            return printed or (str(val) if val is not None else "None")
        except Exception as e:
            return f"❌ {e}"

def execute_code(code: str) -> dict:
    with open(TARGET_PATH, 'a', encoding='utf-8') as f:
        f.write("\n# User code\n" + textwrap.dedent(code) + "\n")
    result = _run_python(code)
    return {"result": result}

def execute_powershell(cmd: str, cwd: Optional[str] = None, timeout: int = 15) -> dict:
    shell = "pwsh" if shutil.which("pwsh") else "powershell"
    target = WORK_PATH
    if cwd:
        try:
            target, _ = _resolve_inside_work(cwd)
        except ValueError as e:
            return {"stdout": "", "stderr": str(e), "code": -1}
    if not target.is_dir():
        return {"stdout": "", "stderr": f"Directory missing: {target}", "code": -1}
    try:
        proc = subprocess.run(
            [shell, "-NoLogo", "-NoProfile", "-Command", cmd],
            cwd=str(target),
            capture_output=True, text=True, timeout=timeout
        )
        return {"stdout": proc.stdout.rstrip(), "stderr": proc.stderr.rstrip(), "code": proc.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Timeout expired", "code": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "code": -1}

def execute_powershell_stateful(cmd: str, timeout: int = 15) -> dict:
    PIPE = r'\\.\pipe\gptPipe'
    req = json.dumps({"cmd": cmd}) + "\n"
    try:
        with open(PIPE, 'r+b', buffering=0) as pipe:
            pipe.write(req.encode('utf-8'))
            resp = b""
            while not resp.endswith(b"\n"):
                chunk = pipe.read(1)
                if not chunk:
                    break
                resp += chunk
        return json.loads(resp.decode('utf-8'))
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "code": 1}

def api_save_file():
    data = request.get_json(force=True)
    rel = pathlib.Path(data.get('path', '')).expanduser()
    try:
        dst, base = _resolve_inside_work(rel)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        # Create .baks directory in the same directory as the file
        bak_dir = dst.parent / '.baks'
        bak_dir.mkdir(exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        bak = bak_dir / f"{dst.name}.bak-{stamp}"
        shutil.copy2(dst, bak)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(data.get('content', ''))
    return jsonify(ok=True, saved=str(dst.relative_to(base)))

def api_run_command():
    data = request.get_json(force=True)
    return jsonify(execute_powershell(data.get('command', ''), cwd=data.get('cwd')))

def server_status() -> dict:
    return {"status": "running"}

# ─────────────────────────────────────────────────────────
# NEW: directory & file helpers
# ─────────────────────────────────────────────────────────

def _resolve_inside_work(rel_path: str) -> Tuple[pathlib.Path, pathlib.Path]:
    rel = pathlib.Path(rel_path).expanduser()
    for base in WORK_ROOTS:
        dst = (base / rel).resolve()
        if str(dst).startswith(str(base)):
            return dst, base
    raise ValueError("Path escape")

def api_list_dir():
    data = request.get_json(force=True)
    print(f"[DEBUG] api_list_dir payload: {data}")
    try:
        tgt, base = _resolve_inside_work(data.get("path", "."))
        if not tgt.exists():
            return jsonify(ok=False, error="Not found"), 404
        if tgt.is_file():
            return jsonify(ok=False, error="Not a directory"), 400
        out = []
        for p in tgt.iterdir():
            stat = p.stat()
            out.append({
                "name": p.name,
                "is_dir": p.is_dir(),
                "size": stat.st_size,
                "modified": datetime.datetime.fromtimestamp(stat.st_mtime)\
.isoformat(timespec="seconds")
            })
        out.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
        return jsonify(ok=True, path=str(tgt.relative_to(base)), entries=out)
    except ValueError as e:
        print(f"[DEBUG] api_list_dir error: {e}")
        return jsonify(ok=False, error=str(e)), 400

def api_open_file():
    data = request.get_json(force=True)
    print(f"[DEBUG] api_open_file payload: {data}")
    try:
        tgt, base = _resolve_inside_work(data.get("path", ""))
        if not tgt.exists():
            return jsonify(ok=False, error="Not found"), 404
        if tgt.is_dir():
            return jsonify(ok=False, error="Is a directory"), 400
        with open(tgt, "r", encoding="utf-8") as f:
            content = f.read()
        return jsonify(ok=True, path=str(tgt.relative_to(base)), content=content)
    except UnicodeDecodeError:
        print("[DEBUG] api_open_file decode error")
        return jsonify(ok=False, error="Binary or non-UTF8 file"), 415
    except ValueError as e:
        print(f"[DEBUG] api_open_file error: {e}")
        return jsonify(ok=False, error=str(e)), 400

def api_peek_file():
    data = request.get_json(force=True)
    print(f"[DEBUG] api_peek_file payload: {data}")
    limit = int(data.get("limit", 50))
    try:
        tgt, base = _resolve_inside_work(data.get("path", ""))
        if tgt.is_dir():
            return jsonify(ok=False, error="Is a directory"), 400
        lines = []
        with open(tgt, "r", encoding="utf-8") as f:
            for _ in range(limit):
                line = f.readline()
                if not line:
                    break
                lines.append(line)
        preview = "".join(lines)
        return jsonify(ok=True, path=str(tgt.relative_to(base)), preview=preview, lines=len(lines))
    except UnicodeDecodeError:
        print("[DEBUG] api_peek_file decode/empty error")
        return jsonify(ok=False, error="Binary, non-UTF8, or empty fil\
e"), 415
    except ValueError as e:
        print(f"[DEBUG] api_peek_file error: {e}")
        return jsonify(ok=False, error=str(e)), 400
