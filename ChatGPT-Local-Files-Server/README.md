# ChatGPT-Local-Files-Server

Server component for the ChatGPT-Local-Files extension.

## Configuration Management

The server uses a `config.toml` file to define workspace roots. To avoid polluting the repository with personal directories, follow these steps:

1. For development, copy `config.toml.example` to `config.toml`:
   ```bash
   cp config.toml.example config.toml
   ```

2. Customize your local `config.toml` with your preferred directories:
   ```toml
   [workspace]
   roots = ["Work", "C:\\MyPersonalProjects", "~/code"]
   ```

3. The `config.toml` file is listed in `.gitignore` to prevent committing personal paths.

4. When making changes to the configuration structure, update the `config.toml.example` file, which serves as the template for other contributors.

## Default Setup

By default, the server will use a relative `Work` directory for storage. This directory is also excluded from git to avoid polluting the repository with generated files.

## Setup

1. Make sure you have Python 3.x installed
2. Set up the virtual environment:

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On Windows (Command Prompt):
.\venv\Scripts\activate.bat
# On Unix or MacOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Running the Server

With the virtual environment activated, run:

```bash
python chatgpt-local-server.py
```

The server will start on `http://127.0.0.1:5000`

## Available Endpoints

- `GET /` - Server status check
- `POST /execute` - Execute Python code
- `POST /execute_ps` - Execute PowerShell commands
- `POST /execute_ps_stateful` - Execute PowerShell commands with state
- `POST /save` - Save file operations
- `POST /run` - Run commands
- `POST /list` - List directory contents
- `POST /open` - Open files
- `POST /peek` - Peek at file contents

## Development

To deactivate the virtual environment when you're done:

```bash
deactivate
``` 