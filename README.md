# CodeLight

> A Windows AI coding launcher optimised for 4 GB RAM machines.  
> Runs [Qwen2.5-Coder](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF) and other lightweight GGUF models locally via [llama.cpp](https://github.com/ggml-org/llama.cpp), with no cloud, no subscription, and no GPU required.

---

## Features

- **Primary model — Qwen2.5-Coder 3B Q4_K_M** (~1.8 GB RAM) — best-in-class coding model for small machines
- **Add-on models** — Qwen2.5-Coder 0.5B / 1.5B, StarCoder2 3B, DeepSeek-Coder 1.3B, Phi-3.5 Mini
- **Real-time RAM monitor** — warns before you hit the ceiling
- **OpenAI-compatible local API** at `localhost:11434` — works with the [Continue](https://continue.dev) VS Code extension
- **One-click model download** from Hugging Face
- **4-bit quantisation** (Q4_K_M) by default — half the RAM, nearly identical quality

---

## Requirements

| Requirement | Minimum |
|---|---|
| OS | Windows 10 / 11 (64-bit) |
| RAM | 4 GB total (3.5 GB free recommended) |
| CPU | x64 with AVX2 (Intel Haswell 2013+ / AMD Ryzen) |
| Disk | 5 GB free for models |
| Node.js | v18+ |

> **No GPU required.** All inference runs on the CPU.

---

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/yourname/codelight.git
cd codelight

# 2. Install Node dependencies
npm install

# 3. Download the llama.cpp Windows binary (one-time setup)
npm run download-llamacpp

# 4. Start the app in dev mode
npm run dev
```

The first time you run, no models are downloaded yet. Click **"Download model"** on the home screen to fetch Qwen2.5-Coder 3B (~1.8 GB) from Hugging Face.

---

## Building a distributable .exe

```bash
npm run build
# Output: dist/CodeLight-Setup-0.1.0.exe
```

---

## Connecting VS Code (Continue extension)

1. Install the [Continue](https://marketplace.visualstudio.com/items?itemName=Continue.continue) extension
2. Open Continue settings and add a provider:

```json
{
  "models": [{
    "title": "CodeLight — Qwen2.5-Coder 3B",
    "provider": "openai",
    "model": "qwen2.5-coder-3b",
    "apiBase": "http://localhost:11434",
    "apiKey": "none"
  }]
}
```

3. Launch your model in CodeLight — VS Code autocomplete will now use it.

---

## Project structure

```
codelight/
├── src/
│   ├── main/
│   │   ├── index.js            ← Electron main process & IPC handlers
│   │   ├── preload.js          ← Secure renderer ↔ main bridge
│   │   ├── model-manager.js    ← Catalogue, downloads, state persistence
│   │   ├── inference-engine.js ← llama.cpp process manager + streaming chat
│   │   ├── ram-monitor.js      ← System RAM reader
│   │   └── api-server.js       ← Local OpenAI-compatible REST API
│   └── renderer/
│       ├── index.html          ← App shell
│       ├── style.css           ← UI styles (light + dark mode)
│       └── app.js              ← All UI logic, pages, IPC calls
├── scripts/
│   └── download-llamacpp.js    ← One-time binary downloader
├── bin/                        ← llama-server.exe goes here (after setup)
├── assets/
│   └── icon.ico                ← App icon (add your own)
└── package.json
```

---

## Adding new models

Edit the `CATALOGUE` array in `src/main/model-manager.js`:

```js
{
  id:       'my-model-id',
  name:     'My Model Name',
  role:     'addon',           // 'primary' or 'addon'
  ramGb:    1.2,
  quant:    'Q4_K_M',
  hfRepo:   'username/repo-GGUF',
  hfFile:   'filename.Q4_K_M.gguf',
  tags:     ['Code', 'Fast'],
  contextLen: 2048,
  license:  'Apache 2.0',
}
```

---

## RAM usage guide

| Model | RAM | Use case |
|---|---|---|
| Qwen2.5-Coder 3B Q4 | ~1.8 GB | Primary coding model |
| Qwen2.5-Coder 1.5B Q4 | ~1.0 GB | Always-on autocomplete / FIM |
| Qwen2.5-Coder 0.5B Q4 | ~0.5 GB | Background linting |
| DeepSeek-Coder 1.3B Q4 | ~0.9 GB | Algorithm reasoning |
| StarCoder2 3B Q4 | ~1.8 GB | Uncommon languages |
| Phi-3.5 Mini Q4 | ~2.0 GB | Docs + Q&A |

On a 4 GB machine the recommended setup is **Qwen2.5-Coder 3B** (primary) + **Qwen2.5-Coder 0.5B** (FIM), using ~2.3 GB total.

---

## License

MIT
