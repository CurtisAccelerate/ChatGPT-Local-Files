## ChatGPT-Local-Files / ChatGPT Workspace Commander by Curtis White

# Action Buttons
![image](https://github.com/user-attachments/assets/3734ebe6-f929-429c-9534-c447cb4a59d8)

# Diff Viewer
![image](https://github.com/user-attachments/assets/43511b37-feee-46bb-b531-a7ea1fbe478f)
![image](https://github.com/user-attachments/assets/d4c0c5e3-42fc-4e53-9c30-61f17ef9dd49)

# Workspace Commander / Local File Explorer
![image](https://github.com/user-attachments/assets/ebc5672a-59d6-460f-ac02-c4f49e615f23)

# Save Button (with path) for Canvas
![image](https://github.com/user-attachments/assets/9ab68d20-e994-4a89-afb5-ee2e6908576c)

A browser extension that empowers ChatGPT with true local project management: save, generate a diff and view in-line, apply partial line diffs, , run, edit, apply ChatGPT genned diffs, and reload files on your machine directly from the chat interface include a Wowrkspace commander for quick insert files into thte text area with file path and name meta-data.

Challenges of LLM are solve tasks of:

- Orchestration
- Context
- State management
- Containment
- Agency/automation
- Ground-truthing

Most AI code editors are focused on LOW ORCHESTRATION (high context) AI-coding. While ChatGPT is high orchestration (low context).

This project aimes to bridge the gap and works excellent side-by-side Visual Studio by creating a HIGH orchestration HIGH context environment.

---

## 🚀 Quickstart

### 1. Install & Start the Local Flask Server (Python Agent)

```bash
git clone https://github.com/CurtisAccelerate/ChatGPT-Local-Files.git
cd ChatGPT-Local-Files/ChatGPT-Local-Files-Server
pip install -r requirements.txt
python chatgpt-local-server.py
```

> The server will start at: `http://127.0.0.1:5000`

📂 **All code is saved relative to this folder:**  
`ChatGPT-Local-Files-Server/Work/`

---

### 2. Import the Browser Extension (Chrome/Edge)

New-- you must build with npm run build:extension

1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the root `ChatGPT-Local-Files/` folder

---

## 📁 File Structure

```txt
ChatGPT-Local-Files/
├── manifest.json                 # Extension manifest
├── content.js                   # Injected button logic
├── background.js                # Messaging bridge

chatgpt-Local-Files-Server/
├── server.py                    # Flask server entry
├── routes.py                    # Request handling logic
├── requirements.txt             # Dependencies
└── Work/                        # 🔹 Code files are saved here (relative paths!)
```

---

## 🔍 Overview

⚠️ Caution: While extensive testing was conducted, this is a rapid AI genned codebase. Future chatgpt UI changes could easily cause breaking or unexpected changes. Always take care to protect critical files and work.

This tool bridges ChatGPT with your local file system and terminal:

- `path:` comments in code blocks map files to disk locations
- Save snippets to disk (with history + backup)
- Run Python, PowerShell, Node, or .NET commands
- Open files in Notepad or VS Code
- Displays a bottom panel for logs, history, and prefix management
- Auto-copies errors to clipboard and (if enabled) inserts them directly into the chat input area
- Draggable File Commander for dumping files into chat with one-click with context!!!
- Adds download link to path for Canvas 'docs' too

## 🔍 Working Tips

- Refresh will refresh the file and save contents. Sometimes DOM delay requires refresh. Always have Studio up for verification
- View diffs incredibly powerful. Line diffs appear to work but caution is warranted. Chunks section is planned for removal.
- ChaGPT genned sounded great but ChatGPT rarely generates perfect diffs. Likely should be removed in future update.
- Sometimes can be slight delay on reload file from server-- if making many file operations quickly give a second to ensure the write operations have complete.
- It works best to instruct ChatGPT to never use canvas if you want to use the full functionality. Canvas also seems to hurt model coding performance.
---

## ⚙️ Technical Details

### Platforms:
Supported/Tested Windows Only

### Architecture

- **content.js**: Injects UI into ChatGPT
- **background.js**: CORS-safe bridge to Flask
- **chatgpt-localserver/**: Flask server exposing `/save`, `/execute`, `/execute_ps`

### Supported Commands

| Language     | File Type | Command Line |
|--------------|-----------|--------------|
| Python       | `.py`     | `python "file.py"` |
| Node.js      | `.js`     | `node "file.js"` |
| PowerShell   | `.ps1`    | `powershell -ExecutionPolicy Bypass -File "file.ps1"` |
| .NET Console | `.csproj` | `dotnet run --project "folder"` |

---

## 🧩 UI Buttons

- `Save ↗`: Write file to disk (backups are automatically generated)
- `View Diff`: Open diff viewer for changed file and file on disk. It is also possible to apply line-level selection.
- `Run ▶`: Execute code via agent
- `Exec`: Run PowerShell directly
- `Rrfsh`: Reload file & path from code block, if code block not complete mutex could fail. Sometimes events/doms cause contents not to load. ALWAYS have editor up side-by-side to verify.
- `Notepad`: Open file in Notepad
- `VStudio`: Open file in VS Code

- 

## WorkSpace Commander

- Click to open/copy or peek file contents into text area with path metadata included
  

## 🧠 State Management & Command History

- **Prefix path** stored in `localStorage` (`cb_save_prefix`)
- **Command history** stored in `cb_cmd_history`
  - Use `↑` / `↓` arrow keys in the command input field to cycle through history
- Use the “Prefix 📂” button to change your root (default: `Work/`)



---

## ⚠️ Error Handling

When a command fails:

- The **error message is automatically copied** to your clipboard
- If the `ENABLE_AUTO_INSERT` flag is set to `true` in `content.js`,  
  ➤ the error will also be **pasted directly into your ChatGPT input box**, so you can quickly ask for help or debugging

You can toggle this behavior by editing:

```js
const ENABLE_AUTO_INSERT = true; // in content.js
```



---

## ✏️ Prompt Format Guide

### Always begin code blocks with a `path:` header on **line 1**  
This tells the extension where to save the file, relative to `Work/`.

### Comment Syntax by Language:

- `//` for JS, TS, C, C++, Java, Go
- `#` for Python, Shell, Ruby
- `<!-- -->` for HTML, XML



📁 **Working path:** `YourPathHere'

---

## 🧪 Sample Prompt and Code Examples

💬 **Prompt Example:**

> Give me a working Python file and a C# app to print π, with proper `path:` headers.

---

### ✅ Python – Working

```python
# path: NewProject01/scripts/pi_calc.py
import math
print("π =", math.pi)
```

---


---

### ✅ JavaScript – Working

```js
// path: NewProject01/web/index.js
console.log("Hello from JS!");
```

---

### ✅ C# – Working You can use the project tab to execute C# using dotnet!! 

```csharp
// path: NewProject01/MyApp/Program.cs
using System;

class Program {
    static void Main() {
        Console.WriteLine(Math.PI);
    }
}
```

---

## 📝 Updates

- Added Directory, Open, Peek -> Input Commands to the text area
- Fixed ability to rename and save file
- Enhanced History Console / Shell for executing shell commands
- INput field now supports press-enter (save) and ctrl-enter (execute)
- Added download button for canvas documents. Recommend not to use canvas / avoid for this plugin but now supports it.
- 

## 📝 TODO

- [ ] Add ChatGPT initated commmands

## 📝 Known bugs / To Be Fixed

- Sometimes when pasting into the text area it can braek the React DOM. If you don't see File Commander, clear the text input area.

---

## 📄 License

MIT License

Built with ❤️ by Curtis White  
**Orchestration**: Curtis White  
**Consult**: Gemini 2.5 Pro  
**Coding**: o4-mini-High
