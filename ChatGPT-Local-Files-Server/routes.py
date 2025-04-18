# path: ChatGPT-Local-Files/routes.py
import io
import os
import shutil
import subprocess
import textwrap
import json
import datetime
import pathlib
from contextlib import redirect_stdout
from typing import Any, Optional
from flask import request, jsonify

# ── Directory configuration ─────────────────────────────
WORK_DIR = "Work"
TARGET_PATH = os.path.join(WORK_DIR, "work.py")
WORK_PATH = pathlib.Path(WORK_DIR).resolve()

os.makedirs(WORK_DIR, exist_ok=True)
if not os.path.exists(TARGET_PATH):
    # create empty work.py if missing
    open(TARGET_PATH, 'w', encoding='utf-8').close()

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
            # evaluate last expression if any
            last_line = code.strip().split('\n')[-1]
            val = eval(last_line, exec_globals)
            return printed or (str(val) if val is not None else "None")
        except Exception as e:
            return f"❌ {e}"

def execute_code(code: str) -> dict:
    """
    Append code to work.py and run it.
    """
    with open(TARGET_PATH, 'a', encoding='utf-8') as f:
        f.write("\n# User code\n" + textwrap.dedent(code) + "\n")
    result = _run_python(code)
    return {"result": result}

def execute_powershell(cmd: str, cwd: Optional[str] = None, timeout: int = 15) -> dict:
    """
    Run a one-off PowerShell command in WORK_DIR or subfolder.
    """
    shell = "pwsh" if shutil.which("pwsh") else "powershell"
    target = WORK_PATH
    if cwd:
        rel = pathlib.Path(cwd)
        if rel.is_absolute() or ".." in rel.parts:
            return {"stdout": "", "stderr": f"Invalid prefix path: {cwd}", "code": -1}
        target = (WORK_PATH / rel).resolve()
        if not str(target).startswith(str(WORK_PATH)):
            return {"stdout": "", "stderr": f"Path escape: {cwd}", "code": -1}
    if not target.is_dir():
        return {"stdout": "", "stderr": f"Directory missing: {target}", "code": -1}

    try:
        proc = subprocess.run(
            [shell, "-NoLogo", "-NoProfile", "-Command", cmd],
            cwd=str(target),
            capture_output=True, text=True, timeout=timeout
        )
        return {
            "stdout": proc.stdout.rstrip(),
            "stderr": proc.stderr.rstrip(),
            "code": proc.returncode
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Timeout expired", "code": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "code": -1}

def execute_powershell_stateful(cmd: str, timeout: int = 15) -> dict:
    """
    Send cmd via named pipe to stateful PowerShell service.
    """
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
    """
    POST /save {path, content}
    """
    data = request.get_json(force=True)
    rel = pathlib.Path(data.get('path', '')).expanduser()
    dst = (WORK_PATH / rel).resolve()
    if not str(dst).startswith(str(WORK_PATH)):
        return jsonify(ok=False, error="Path escape"), 400
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        bak = dst.with_name(dst.name + f".bak-{stamp}")
        shutil.copy2(dst, bak)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(data.get('content', ''))
    return jsonify(ok=True, saved=str(dst.relative_to(WORK_PATH)))

def api_run_command():
    """
    POST /run {command, cwd}
    """
    data = request.get_json(force=True)
    return jsonify(execute_powershell(data.get('command', ''), cwd=data.get('cwd')))

def server_status() -> dict:
    return {"status": "running"}
