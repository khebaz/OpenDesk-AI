# OpenDesk AI

**A Fully Offline AI Coding Assistant for Windows**

OpenDesk AI is a lightweight, privacy-first AI coding assistant designed to run entirely on local Windows machines — even systems with as little as **4 GB RAM**.

Built on [llama.cpp](https://github.com/ggml-org/llama.cpp), OpenDesk AI runs modern GGUF coding models such as Qwen2.5-Coder, DeepSeek-Coder, and StarCoder2 directly on your CPU without requiring a GPU, cloud connection, API key, or subscription.

All code analysis, file operations, and command execution occur locally on your device, ensuring complete privacy and control over your data.

---

## Screenshots

| Home Screen | Code Chat |
|---|---|
| ![Home Screen](Screen-Shots/Screenshot%20(17).png) | ![Code Chat](Screen-Shots/Screenshot%20(19).png) |

| Settings | Model Library | File Browser |
|---|---|---|
| ![Settings](Screen-Shots/Screenshot%20(18).png) | ![Model Library](Screen-Shots/Screenshot%20(20).png) | ![File Browser](Screen-Shots/Screenshot%20(21).png) |

---

## Key Features

### AI Coding Assistant
- Generate, explain, debug, and refactor code across 40+ languages
- Streaming responses for a responsive real-time experience
- Context-aware with file attachment support

### Fully Offline Operation
- No cloud dependency or data collection
- No internet required after model download
- Complete privacy — code never leaves your machine

### Local Tool Agent
The AI can safely interact with your local environment on command:
- Read files from disk
- Write and edit files
- Browse and list directories
- Execute PowerShell commands
- All actions are user-initiated and visible in the chat

### Model Management
- One-click model downloads from Hugging Face
- Multiple model support with primary and add-on roles
- Automatic model unloading when idle to free RAM
- Adjustable quantization levels (Q2_K through Q8_0)

### Developer Integrations
- OpenAI-compatible local API server at `localhost:11434`
- Works with VS Code [Continue](https://continue.dev) extension
- Exposes FIM (Fill-in-Middle) endpoint for autocomplete

### Performance Controls
- Adjustable CPU thread count (2-8 threads)
- Configurable context length (512-2048 tokens)
- RAM usage ceiling limits
- Swap-to-disk for memory-constrained scenarios
- Optional iGPU offload layer support
- One-click RAM boost to close memory-heavy processes

### Built-In Workspace
- File browser with tree navigation
- Built-in code editor with save functionality
- Real-time system RAM monitor
- Dark mode support (follows system preference)

---

## Why OpenDesk AI?

| | OpenDesk AI | Ollama | Cloud Assistants |
|---|---|---|---|
| **Offline** | ✅ Yes | ✅ Yes | ❌ No |
| **RAM Required** | 4 GB | 8 GB+ | N/A |
| **GPU Required** | No | Recommended | Yes (for speed) |
| **Privacy** | Complete — local only | Local only | Data sent to cloud |
| **Subscription** | None | None | Monthly fee |
| **Setup** | 3 commands | 3 commands | Sign-up required |
| **File Editing** | Built-in agent | No | Limited |
| **API Compatible** | OpenAI | OpenAI | Vendor-specific |
| **Data Collection** | No | No | Yes |

---

## System Requirements

| Component | Requirement |
|---|---|
| Operating System | Windows 10 / 11 (64-bit) |
| RAM | 4 GB minimum (3.5 GB free recommended) |
| CPU | x64 with AVX2 (Intel Haswell 2013+ / AMD Ryzen) |
| Storage | 5 GB free disk space |
| Node.js | Version 18 or newer |

**No GPU required.** All inference runs on CPU.

---

## Quick Start

```powershell
# 1. Install dependencies
npm install

# 2. Download llama.cpp Windows binary (one-time)
npm run download-llamacpp

# 3. Launch OpenDesk AI
npm run dev
```

On the **Home** screen, click **Download model** to fetch Qwen2.5-Coder 3B (~1.8 GB) from Hugging Face. Once downloaded, click **Launch model**, then open the **Code chat** tab to start coding.

---

## Using the AI Tool Agent

The AI assistant can interact with your local file system and run commands when you ask it to:

| Tag | Action |
|---|---|
| `<cmd>command</cmd>` | Run a PowerShell command |
| `<read>filepath</read>` | Read a file from disk |
| `<list>dirpath</list>` | List directory contents |
| `<write path="path">...</write>` | Write content to a file |

You can also attach files directly to chat messages using the **📎** button. The AI will analyse file content without needing disk access.

### Example prompts
- *"How many files are on my desktop?"*
- *"Read C:\Users\me\project\main.js and explain what it does"*
- *"Create hello.py that prints Hello World"*
- *"List the contents of my Documents folder"*
- *"Edit index.html and add a dark mode toggle button"*

---

## Security

- All tool execution is user-visible in the chat transcript
- Commands and file operations only run when the AI produces explicit tool tags — no silent background execution
- File access is limited to readable text files (max 1 MB)
- Command execution has a 15-second timeout
- No telemetry, analytics, or external network calls
- API keys and secrets are excluded from version control via `.gitignore`

---

## Architecture

OpenDesk AI is composed of four layers:

1. **Electron Desktop Application** — Custom frameless window with 5-page UI, communicates via secure IPC bridge
2. **llama.cpp Inference Engine** — Spawns `llama-server.exe` per model, streaming OpenAI-compatible API
3. **Tool Execution Layer** — PowerShell commands via `child_process`, file I/O via Node.js `fs`, all with context isolation
4. **API Server** — OpenAI-compatible REST API at `localhost:11434` for VS Code integration

---

## VS Code Integration (Continue Extension)

1. Install the [Continue](https://marketplace.visualstudio.com/items?itemName=Continue.continue) extension
2. Add this provider in Continue settings:

```json
{
  "models": [{
    "title": "OpenDesk AI — Qwen2.5-Coder 3B",
    "provider": "openai",
    "model": "qwen2.5-coder-3b",
    "apiBase": "http://localhost:11434",
    "apiKey": "none"
  }]
}
```

3. Launch a model in OpenDesk AI — VS Code will use it for autocomplete and inline chat.

---

## RAM Usage Guide

| Model | RAM | Use Case |
|---|---|---|
| Qwen2.5-Coder 3B Q4_K_M | ~1.8 GB | Primary coding model |
| Qwen2.5-Coder 1.5B Q4_K_M | ~1.0 GB | Always-on autocomplete / FIM |
| Qwen2.5-Coder 0.5B Q4_K_M | ~0.5 GB | Background linting |
| DeepSeek-Coder 1.3B Q4_K_M | ~0.9 GB | Algorithm reasoning |
| StarCoder2 3B Q4_K_M | ~1.8 GB | Uncommon languages |
| SmolLM2 1.7B Q4_K_M | ~1.1 GB | Instruction following |

**Recommended for 4 GB machines:** Qwen2.5-Coder 3B (primary) + Qwen2.5-Coder 0.5B (FIM) — ~2.3 GB total.

---

## Build Distributable

```powershell
npm run build
```

Output: `dist/OpenDesk AI-Setup-0.1.0.exe`

---

## Adding Custom Models

Edit the `CATALOGUE` array in `src/main/model-manager.js`:

```js
{
  id:         'my-model',
  name:       'My Model Name',
  role:       'addon',            // 'primary' or 'addon'
  ramGb:      1.2,
  quant:      'Q4_K_M',
  hfRepo:     'username/repo-GGUF',
  hfFile:     'model-file.Q4_K_M.gguf',
  tags:       ['Code', 'Fast'],
  contextLen: 2048,
  license:    'Apache 2.0',
}
```

---

## Project Structure

```
OpenDesk AI/
├── src/
│   ├── main/
│   │   ├── index.js              Main process, IPC handlers
│   │   ├── preload.js            Secure renderer-main bridge
│   │   ├── model-manager.js      Catalogue, downloads, state
│   │   ├── inference-engine.js   llama.cpp process + streaming
│   │   ├── ram-monitor.js        System RAM reader
│   │   ├── api-server.js         Local OpenAI-compatible API
│   │   ├── idle-manager.js       Auto-unload on inactivity
│   │   └── updater.js            GitHub release checker
│   └── renderer/
│       ├── index.html            App shell
│       ├── style.css             Light + dark mode styles
│       └── app.js                UI logic and IPC calls
├── scripts/
│   └── download-llamacpp.js      Binary downloader
├── Screen-Shots/                 Application screenshots
├── bin/                          llama-server.exe (after setup)
├── assets/
│   └── icon.ico                  Application icon
└── package.json
```

---

## Roadmap

- [ ] Web search integration (online-only toggle)
- [ ] Multi-turn conversation memory improvements
- [ ] Additional model format support (GGML, AWQ)
- [ ] Custom tool/plugin system for extended automation
- [ ] Improved code editing with diff preview
- [ ] Portable mode (no install required)
- [ ] ARM64 Windows support

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Credits

Built by **Kabelo Ramapulana**

Powered by:
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [Qwen2.5-Coder](https://huggingface.co/Qwen)
- [DeepSeek-Coder](https://huggingface.co/deepseek-ai)
- [StarCoder2](https://huggingface.co/bigcode)
- [Electron](https://www.electronjs.org)
- [Hugging Face](https://huggingface.co)
