# Bantu Collaborative IDE

Real-time collaborative code editor with chat + voice, built with **Bantu v1.3.2** + `sua.ws` (WebSocket).

## Features

- **Real-time chat** — WebSocket text messages, instant delivery
- **Voice transmission** — microphone audio via WebSocket binary frames
- **Live code editing** — CodeMirror editor synced in real-time
- **Remote cursors** — see other participants' cursors
- **User list** — see who's online + who's speaking

## Quick Start

```bash
# Clone + run
git clone https://github.com/AsseySilivestir/bantu-collab-ide.git
cd bantu-collab-ide
bantu run server.b

# Open http://localhost:8080 in 2+ browser tabs
```

## How it works

```
Browser A ──WebSocket──> Bantu v1.3.2 (sua.ws) <──WebSocket── Browser B
  │                         │                                    │
  │ text frames (chat)      │ text frames (chat)                 │
  │ binary frames (voice)   │ binary frames (voice)              │
  │ code edits (JSON)       │ code edits (JSON)                 │
  └─ CodeMirror             └─ CodeMirror                        └─ CodeMirror
```

## Tech Stack

- **Backend:** Bantu v1.3.2 + Sua HTTP + `sua.ws` (WebSocket)
- **Frontend:** vanilla HTML/CSS/JS + CodeMirror 5.65
- **Voice:** Web Audio API → Int16 PCM → WebSocket binary frames

## License

MIT
