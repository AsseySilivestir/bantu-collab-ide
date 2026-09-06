// ════════════════════════════════════════════════════════════════════
//  Bantu Collaborative IDE — frontend logic
//  Chat + Voice + Real-time Code Editing via WebSocket
// ════════════════════════════════════════════════════════════════════

// ─── WebSocket connection ──────────────────────────────────────────
// Use wss:// when on HTTPS (Render forces HTTPS), ws:// for localhost
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}/`);
ws.binaryType = 'arraybuffer';  // for voice data

const statusEl = document.getElementById('connection-status');

ws.onopen = () => {
    statusEl.className = 'status connected';
    statusEl.title = 'Connected';
    addChatMessage('system', '', 'Connected to Bantu Collaborative IDE');
};
ws.onclose = () => {
    statusEl.className = 'status disconnected';
    statusEl.title = 'Disconnected';
    addChatMessage('system', '', 'Disconnected from server');
};
ws.onerror = (e) => { console.error('WS error:', e); };

ws.onmessage = (e) => {
    // Binary frame = voice data
    if (e.data instanceof ArrayBuffer) {
        handleVoiceData(e.data);
        return;
    }
    // Text frame = JSON message
    try {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
    } catch {
        // Plain text — display as chat
        addChatMessage('guest', '', e.data);
    }
};

function send(msg) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

// ─── Chat ──────────────────────────────────────────────────────────
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const nameInput = document.getElementById('name-input');

function addChatMessage(from, name, text) {
    const div = document.createElement('div');
    div.className = 'chat-msg' + (from === 'system' ? ' system' : '');
    if (from === 'system') {
        div.textContent = text;
    } else {
        const fromSpan = document.createElement('span');
        fromSpan.className = 'from';
        fromSpan.textContent = name || from;
        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = ': ' + text;
        div.appendChild(fromSpan);
        div.appendChild(textSpan);
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    const name = nameInput.value.trim() || 'guest';
    send({ type: 'chat', name, text });
    addChatMessage('me', name, text);
    chatInput.value = '';
}

chatSend.onclick = sendChat;
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
});

nameInput.addEventListener('change', () => {
    send({ type: 'set-name', name: nameInput.value.trim() || 'guest' });
});

// ─── Users list ────────────────────────────────────────────────────
const usersList = document.getElementById('users');
const voiceIndicators = document.getElementById('voice-indicators');

function updateUserList() {
    usersList.innerHTML = '';
    Object.entries(knownUsers).forEach(([id, info]) => {
        const li = document.createElement('li');
        li.textContent = info.name || id;
        usersList.appendChild(li);
    });
}

let knownUsers = {};

function handleMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            myId = msg.id;
            send({ type: 'set-name', name: nameInput.value.trim() || 'guest' });
            break;
        case 'user-joined':
            knownUsers[msg.id] = { name: msg.id, hasVoice: false };
            addChatMessage('system', '', `${msg.id} joined`);
            updateUserList();
            break;
        case 'user-left':
            delete knownUsers[msg.id];
            addChatMessage('system', '', `${msg.id} left`);
            updateUserList();
            // Remove voice indicator
            const dot = document.querySelector(`[data-voice-id="${msg.id}"]`);
            if (dot) dot.remove();
            break;
        case 'name-change':
            if (knownUsers[msg.id]) {
                knownUsers[msg.id].name = msg.name;
            }
            updateUserList();
            break;
        case 'chat':
            addChatMessage(msg.from, msg.name, msg.text);
            break;
        case 'voice-start':
            if (knownUsers[msg.id]) knownUsers[msg.id].hasVoice = true;
            addVoiceIndicator(msg.id, msg.name || msg.id);
            break;
        case 'voice-stop':
            if (knownUsers[msg.id]) knownUsers[msg.id].hasVoice = false;
            const vdot = document.querySelector(`[data-voice-id="${msg.id}"]`);
            if (vdot) vdot.remove();
            break;
        case 'code-edit':
            applyRemoteEdit(msg.changes);
            break;
        case 'cursor':
            updateRemoteCursor(msg.from, msg.line, msg.ch);
            break;
    }
}

let myId = null;

// ─── Voice (WebRTC audio) ─────────────────────────────────────────
const micBtn = document.getElementById('mic-btn');
const micLabel = document.getElementById('mic-label');
let voiceActive = false;
let audioContext = null;
let mediaStream = null;
let processor = null;

micBtn.onclick = async () => {
    if (voiceActive) {
        stopVoice();
    } else {
        await startVoice();
    }
};

async function startVoice() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(mediaStream);

        // Use ScriptProcessor for raw audio chunks (deprecated but simple)
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            // Convert Float32 to Int16 (compress for transmission)
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            // Send as binary WebSocket frame
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(int16Data.buffer);
            }
        };
        source.connect(processor);
        processor.connect(audioContext.destination);

        voiceActive = true;
        micBtn.classList.add('active');
        micLabel.textContent = 'Stop Voice';
        send({ type: 'voice-start' });
        addVoiceIndicator(myId, nameInput.value || 'me');
    } catch (e) {
        alert('Microphone access denied: ' + e.message);
    }
}

function stopVoice() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    voiceActive = false;
    micBtn.classList.remove('active');
    micLabel.textContent = 'Start Voice';
    send({ type: 'voice-stop' });
    const myDot = document.querySelector(`[data-voice-id="${myId}"]`);
    if (myDot) myDot.remove();
}

function addVoiceIndicator(id, name) {
    if (document.querySelector(`[data-voice-id="${id}"]`)) return;
    const dot = document.createElement('div');
    dot.className = 'voice-dot';
    dot.dataset.voiceId = id;
    dot.textContent = '🔊 ' + name;
    voiceIndicators.appendChild(dot);
}

// ─── Voice playback (receive binary audio from server) ─────────────
let playbackContext = null;
let playbackQueue = [];

function handleVoiceData(arrayBuffer) {
    // Received a binary frame containing Int16 audio data from another client.
    // The server broadcasts it to all clients.
    // We decode it and play it back.
    if (!playbackContext) {
        playbackContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const int16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 0x8000;
    }
    const buffer = playbackContext.createBuffer(1, float32.length, 44100);
    buffer.getChannelData(0).set(float32);
    const src = playbackContext.createBufferSource();
    src.buffer = buffer;
    src.connect(playbackContext.destination);
    src.start();
}

// ─── CodeMirror editor ─────────────────────────────────────────────
const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
    mode: 'javascript',
    theme: 'dracula',
    lineNumbers: true,
    autoCloseTags: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentUnit: 2,
    value: '// Bantu Collaborative IDE\n// Start typing — changes sync to all participants in real-time!\n\nconsole.log("Hello from Bantu IDE!");\n'
});

// Send code changes to server (debounced)
let sendTimeout = null;
let isApplyingRemote = false;

editor.on('change', (instance, changes) => {
    if (isApplyingRemote) return;
    if (sendTimeout) clearTimeout(sendTimeout);
    sendTimeout = setTimeout(() => {
        send({ type: 'code-edit', changes: JSON.stringify(changes) });
    }, 100);
});

// Send cursor position
editor.on('cursorActivity', (instance) => {
    if (isApplyingRemote) return;
    const pos = instance.getCursor();
    send({ type: 'cursor', line: pos.line, ch: pos.ch });
});

// Apply remote edit
function applyRemoteEdit(changesStr) {
    try {
        const changes = JSON.parse(changesStr);
        isApplyingRemote = true;
        // Handle different change types from CodeMirror
        if (Array.isArray(changes)) {
            changes.forEach(c => editor.replaceRange(c.text, c.from, c.to));
        } else if (changes.text) {
            editor.replaceRange(changes.text, changes.from, changes.to);
        }
        isApplyingRemote = false;
    } catch (e) {
        console.error('Failed to apply remote edit:', e);
        isApplyingRemote = false;
    }
}

// Remote cursor markers
const remoteCursors = {};
const cursorColors = ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#89b4fa', '#cba6f7'];

function updateRemoteCursor(clientId, line, ch) {
    if (clientId === myId) return;
    // Remove old cursor
    if (remoteCursors[clientId]) {
        remoteCursors[clientId].clear();
    }
    // Add new cursor with a color based on clientId
    const colorIdx = clientId.charCodeAt(clientId.length - 1) % cursorColors.length;
    const color = cursorColors[colorIdx];
    const cursorCoords = editor.charCoords({ line, ch }, 'local');
    const marker = editor.setBookmark({ line, ch }, {
        widget: (() => {
            const el = document.createElement('div');
            el.className = 'remote-cursor';
            el.style.borderColor = color;
            el.style.height = '1.2em';
            return el;
        })()
    });
    remoteCursors[clientId] = marker;
}

// Language selector
document.getElementById('language-select').onchange = (e) => {
    editor.setOption('mode', e.target.value);
};
