ChatGPT-Local-Files

 ![image](https://github.com/user-attachments/assets/e7f5b96b-7513-4463-b01c-175238f976bc)


ChatGPT-Local-Files by Curtis White
A browser extension that empowers ChatGPT with true local project management: save, run, and edit files on your machine directly from the chat interface.

🔍 Overview

Modern AI–powered chat interfaces (like ChatGPT) offer tremendous coding assistance, but they lack stateful local file management. This extension solves that gap by:
Emitting path comments in code blocks to identify file names and locations
Saving code snippets to your local drive (existing files are automatically backed up and you get history!)
Running scripts (Python, PowerShell, Node, .NET) against a local agent service
Opening files in your editor of choice (Notepad, VS Code)
Maintaining command history and logs directly in the chat UI
Error Handling: Automatically copies errors to the clipboard and, if enabled, auto-inserts them into your chat prompt (toggle via the ENABLE_AUTO_INSERT flag in content.js).
Built as a Manifest V3 extension, it leverages a background service worker to bypass CORS and securely communicate with a local Flask agent at http://127.0.0.1:5000.

⚙️ Technical Details

Architecture
Content Script (content.js): Injects buttons and UI into ChatGPT’s markdown panels. Detects // path: relative/to/project/file.ext comments to map code to local files.

Background Service Worker (background.js): Handles privileged fetch calls to the local agent (no CORS removal hacks required). Processes save and execute requests.
Local Agent: A small Flask server listening on port 5000, exposing /save and /execute_ps endpoints. Responsible for writing files, running commands, and returning stdout/stderr JSON.
Supported Languages & Commands
Python (.py): python "file.py"
Node.js (.js): node "file.js"
PowerShell (.ps1): powershell -ExecutionPolicy Bypass -File "file.ps1"
.NET Console (.csproj folder): dotnet run --project "project-folder"

UI Elements

Inline Buttons: Save ↗, Run ▶, Exec, Rrfsh, Notepad, VStudio
Log Panel: Pinned at the bottom of the chat window, showing last 20 operations and allowing prefix configuration

State Management

Prefix path stored in localStorage for consistent saves
Command history (cb_cmd_history) in localStorage for quick recall

🚀 Installation

Clone the repo

git clone https://github.com/CurtisAccelerate/ChatGPT-Local-Files.git
cd ChatGPT-Local-Files

Install & run the local server

cd chatgpt-localserver
pip install -r requirements.txt    # or your environment setup
python server.py                   # starts Flask agent on http://127.0.0.1:5000

***QUICK INSTALL LOAD EXTENSION****
In Chrome/Edge: open chrome://extensions, enable Developer mode, click Load unpacked, and select the root ChatGPT-Local-Files folder.

Configure

All files are stored relative to Work.  You can specify project paths for ChatGPT to use. You can also "enforce" your prefix you using the Prefix Folder.

Click “Prefix 📂” in the log panel to set your project root (e.g., C:/Users/You/Projects/MyApp).

🛠️ Usage

In ChatGPT, ask for code and include a // path: comment at the top:

// path: src/index.js
console.log('Hello, world!');

Click Save ↗ to write src/index.js to disk.
Click Run ▶ to execute it via your local agent.
Edit or re-run as needed; errors will be copied or auto-inserted into your prompt.
Use the Log & History panel to recall previous commands or clear logs.

⚠️ Limitations

USE AT OWN RISK. THIS IS EARLY ALPHA AND BUGS LIKELY EXIST.

Only works with code block files; Canvas or inline images (diagrams, UI previews) are not supported.

Windows only: uses PowerShell Start-Process, notepad, and code CLI commands.
Requires a running local Flask agent on http://127.0.0.1:5000; other ports or hosts are not configurable.

Watches dynamic chat output via MutationObserver on div.markdown pre; non-standard containers or future UI changes may break detection.
Command history is limited to the last 20 entries; use ↑/↓ arrows in the log panel input to navigate.
Error auto-copy and insertion can be toggled with the ENABLE_AUTO_INSERT flag in content.js.
Uses localStorage keys cb_save_prefix and cb_cmd_history for state; clearing browser storage resets configuration.

Tampermonkey version: if using the legacy userscript, you must install a CORS unblocker extension (or launch your browser with CORS disabled) to allow cross-origin requests to the local agent.

📝 TODO
Add support for Canvas content blocks

💡 Development

Extension (ChatGPT-Local-Files)
Content script: content.js
Background Worker: background.js
Manifest: manifest.json

Local Agent & Server (ChatGPT-LocalServer)
Path: chatgpt-localserver/
Main files: server.py, routes.py

Requirements: see chatgpt-localserver/requirements.txt

Feel free to fork, explore, and contribute! Issues and feature requests welcome.

📄 License
This project is licensed under the MIT License. Enjoy hacking locally from ChatGPT!

Built with ❤️ by Curtis White — Orchestrated by Curtis White, Consult Gemini 2.5 Pro, Coding by with o4-mini-High
