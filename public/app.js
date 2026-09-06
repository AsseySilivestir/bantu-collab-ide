// Splannes Thumb Pal — Collaborative IDE
// Chat + Live Voice + Real-time Code Editing via WebSocket

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}/`);
ws.binaryType = 'arraybuffer';

const connDot = document.querySelector('#conn-status .dot');
const connText = document.querySelector('#conn-status .conn-text');
ws.onopen = () => { connDot.className = 'dot connected'; connText.textContent = 'Connected'; };
ws.onclose = () => { connDot.className = 'dot disconnected'; connText.textContent = 'Disconnected'; };
ws.onerror = () => { connText.textContent = 'Error'; };
ws.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) { handleVoiceData(e.data); return; }
    try { handleMessage(JSON.parse(e.data)); }
    catch { addChatMessage('system', null, e.data); }
};
function send(msg) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

// ─── Chat ───────────────────────────────────────
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const nameInput = document.getElementById('name-input');
const myAvatar = document.getElementById('my-avatar');
const colors = ['#6c5ce7','#00d4a0','#ff6b81','#ffa502','#3742fa','#a29bfe','#fd79a8','#55efc4'];
function colorFor(id) { if(!id) return colors[0]; return colors[id.charCodeAt(id.length-1) % colors.length]; }
function initials(name) { return (name || '?').substring(0,2).toUpperCase(); }
function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function addChatMessage(type, name, text) {
    const div = document.createElement('div');
    if (type === 'system') { div.className = 'chat-msg system'; div.textContent = text; }
    else if (type === 'sent') { div.className = 'chat-msg sent'; div.innerHTML = `<span class="from">${escapeHtml(name)}</span>${escapeHtml(text)}`; }
    else { div.className = 'chat-msg received'; div.innerHTML = `<span class="from" style="color:${colorFor(name)}">${escapeHtml(name)}</span>${escapeHtml(text)}`; }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    const name = nameInput.value.trim() || 'guest';
    myAvatar.textContent = initials(name);
    send({ type: 'chat', name, text });
    addChatMessage('sent', name, text);
    chatInput.value = '';
}
chatSend.onclick = sendChat;
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim() || 'guest';
    myAvatar.textContent = initials(name);
    send({ type: 'set-name', name });
});

// ─── Live Voice (real-time streaming via binary WS) ──────────
// Audio is captured in real-time, sent as binary WebSocket frames,
// relayed by the C++ server to all other clients instantly.
// This is the "old approach" — direct live voice like a phone call.

const micBtn = document.getElementById('record-btn');
const micLabel = document.querySelector('#record-btn');
let voiceActive = false;
let audioContext = null;
let mediaStream = null;
let processor = null;
let playbackContext = null;

micBtn.onclick = async () => {
    if (voiceActive) { stopVoice(); } else { await startVoice(); }
};

async function startVoice() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(mediaStream);
        
        // Use ScriptProcessor for real-time audio chunks
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            // Convert Float32 to Int16 for compact transmission
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            // Send as binary WebSocket frame — C++ relay forwards to other clients
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(int16.buffer);
            }
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        voiceActive = true;
        micBtn.classList.add('recording');
        micBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg> <span>Leave Voice</span>';
        send({ type: 'voice-start' });
        addChatMessage('system', null, '🎤 Voice started — speak now');
    } catch (e) {
        alert('Microphone access denied: ' + e.message);
    }
}

function stopVoice() {
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (processor) { processor.disconnect(); processor = null; }
    voiceActive = false;
    micBtn.classList.remove('recording');
    micBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg> <span>Join Voice</span>';
    send({ type: 'voice-stop' });
    addChatMessage('system', null, '🔇 Voice stopped');
}

// Receive live voice data from other clients (binary frames)
function handleVoiceData(arrayBuffer) {
    // The C++ relay forwarded this binary frame to us.
    // It contains Int16 audio samples from another client's microphone.
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

// ─── Users ──────────────────────────────────────
const usersList = document.getElementById('users-list');
const userCount = document.getElementById('user-count');
let knownUsers = {};
let myId = null;

function updateUserList() {
    usersList.innerHTML = '';
    userCount.textContent = Object.keys(knownUsers).length;
    Object.entries(knownUsers).forEach(([id, info]) => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `<div class="avatar" style="background:${colorFor(id)}">${initials(info.name)}</div><span class="name">${escapeHtml(info.name)}</span><span class="indicator" style="background:${info.voice ? 'var(--orange)' : 'var(--green)'}"></span>`;
        usersList.appendChild(div);
    });
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            myId = msg.id;
            knownUsers[myId] = { name: nameInput.value || 'me', voice: false };
            send({ type: 'set-name', name: nameInput.value.trim() || 'guest' });
            updateUserList();
            break;
        case 'user-joined':
            if (msg.id !== myId) { knownUsers[msg.id] = { name: msg.id, voice: false }; addChatMessage('system', null, `${msg.id} joined`); updateUserList(); }
            break;
        case 'user-left':
            delete knownUsers[msg.id];
            addChatMessage('system', null, `${msg.id} left`);
            updateUserList();
            break;
        case 'name-change':
            if (knownUsers[msg.id]) knownUsers[msg.id].name = msg.name;
            updateUserList();
            break;
        case 'chat':
            addChatMessage('received', msg.name, msg.text);
            break;
        case 'voice-start':
            if (knownUsers[msg.id]) knownUsers[msg.id].voice = true;
            addChatMessage('system', null, `🎤 ${msg.id} joined voice`);
            updateUserList();
            break;
        case 'voice-stop':
            if (knownUsers[msg.id]) knownUsers[msg.id].voice = false;
            addChatMessage('system', null, `🔇 ${msg.id} left voice`);
            updateUserList();
            break;
        case 'code-edit':
            applyRemoteEdit(msg);
            break;
        case 'cursor':
            updateRemoteCursor(msg.from, msg.line, msg.ch);
            break;
    }
}

// ─── CodeMirror with content-snapshot sync ──────
const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
    mode: 'javascript', theme: 'material-darker', lineNumbers: true,
    autoCloseTags: true, autoCloseBrackets: true, tabSize: 2, indentUnit: 2,
    value: '// Splannes Thumb Pal\n// Type and watch it sync!\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));\n'
});

let sendTimeout = null;
let isApplyingRemote = false;
let lastSentContent = editor.getValue();

editor.on('change', (inst) => {
    if (isApplyingRemote) return;
    if (sendTimeout) clearTimeout(sendTimeout);
    sendTimeout = setTimeout(() => {
        const content = inst.getValue();
        if (content !== lastSentContent) {
            send({ type: 'code-edit', content: content });
            lastSentContent = content;
        }
    }, 150);
});

editor.on('cursorActivity', (inst) => {
    if (isApplyingRemote) return;
    const pos = inst.getCursor();
    send({ type: 'cursor', line: pos.line, ch: pos.ch });
});

function applyRemoteEdit(msg) {
    isApplyingRemote = true;
    if (msg.content !== undefined) {
        const cursor = editor.getCursor();
        editor.setValue(msg.content);
        editor.setCursor(cursor);
        lastSentContent = msg.content;
    }
    isApplyingRemote = false;
}

const remoteCursors = {};
function updateRemoteCursor(clientId, line, ch) {
    if (clientId === myId) return;
    if (remoteCursors[clientId]) remoteCursors[clientId].clear();
    const el = document.createElement('div');
    el.style.cssText = `border-left:2px solid ${colorFor(clientId)};height:1.3em;`;
    remoteCursors[clientId] = editor.setBookmark({line, ch}, {widget: el});
}

document.getElementById('language-select').onchange = (e) => editor.setOption('mode', e.target.value);
const codeTab = document.getElementById('code-tab');
const previewTab = document.getElementById('preview-tab');
const editorWrapper = document.getElementById('editor-wrapper');
const previewWrapper = document.getElementById('preview-wrapper');
const previewFrame = document.getElementById('preview-frame');
codeTab.onclick = () => { codeTab.classList.add('active'); previewTab.classList.remove('active'); editorWrapper.style.display=''; previewWrapper.style.display='none'; };
previewTab.onclick = () => { previewTab.classList.add('active'); codeTab.classList.remove('active'); editorWrapper.style.display='none'; previewWrapper.style.display=''; previewFrame.srcdoc = editor.getValue(); };
