// ════════════════════════════════════════════════════════════════════
//  Splannes Thumb Pal — Collaborative IDE
//  Chat + Voice + Real-time Code Editing via WebSocket
// ════════════════════════════════════════════════════════════════════

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}/`);
ws.binaryType = 'arraybuffer';

const connStatus = document.getElementById('conn-status');
const connDot = connStatus.querySelector('.dot');
const connText = connStatus.querySelector('.conn-text');

ws.onopen = () => {
    connDot.className = 'dot connected';
    connText.textContent = 'Connected';
};
ws.onclose = () => {
    connDot.className = 'dot disconnected';
    connText.textContent = 'Disconnected';
};
ws.onerror = () => { connText.textContent = 'Error'; };

ws.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) { handleVoiceData(e.data); return; }
    try { handleMessage(JSON.parse(e.data)); }
    catch { addChatMessage('system', null, e.data); }
};

function send(msg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// ─── Chat ────────────────────────────────────────
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const nameInput = document.getElementById('name-input');
const myAvatar = document.getElementById('my-avatar');

const colors = ['#6c5ce7','#00d4a0','#ff6b81','#ffa502','#3742fa','#a29bfe','#fd79a8','#55efc4'];
function colorFor(id) { return colors[((id || '').charCodeAt((id || '').length-1) || 0) % colors.length]; }
function initials(name) { return (name || '?').substring(0,2).toUpperCase(); }

function addChatMessage(type, name, text) {
    const div = document.createElement('div');
    if (type === 'system') {
        div.className = 'chat-msg system';
        div.textContent = text;
    } else if (type === 'sent') {
        div.className = 'chat-msg sent';
        div.innerHTML = `<span class="from">${name}</span>${text}`;
    } else {
        div.className = 'chat-msg received';
        div.innerHTML = `<span class="from" style="color:${colorFor(name)}">${name}</span>${text}`;
    }
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

// ─── Users ──────────────────────────────────────
const usersList = document.getElementById('users-list');
const userCount = document.getElementById('user-count');
const voiceParticipants = document.getElementById('voice-participants');
let knownUsers = {};
let myId = null;

function updateUserList() {
    usersList.innerHTML = '';
    const count = Object.keys(knownUsers).length;
    userCount.textContent = count;
    Object.entries(knownUsers).forEach(([id, info]) => {
        const div = document.createElement('div');
        div.className = 'user-item';
        const color = colorFor(id);
        div.innerHTML = `
            <div class="avatar" style="background:${color}">${initials(info.name)}</div>
            <span class="name">${info.name}</span>
            ${info.voice ? '<span class="indicator voice"></span>' : '<span class="indicator"></span>'}
        `;
        usersList.appendChild(div);
    });
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            myId = msg.id;
            knownUsers[myId] = { name: nameInput.value || 'me', voice: false };
            const name = nameInput.value.trim() || 'guest';
            send({ type: 'set-name', name });
            updateUserList();
            break;
        case 'user-joined':
            if (msg.id !== myId) {
                knownUsers[msg.id] = { name: msg.id, voice: false };
                addChatMessage('system', null, `${msg.id} joined`);
                updateUserList();
            }
            break;
        case 'user-left':
            delete knownUsers[msg.id];
            addChatMessage('system', null, `${msg.id} left`);
            updateUserList();
            const pill = document.querySelector(`[data-voice="${msg.id}"]`);
            if (pill) pill.remove();
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
            addVoicePill(msg.id, knownUsers[msg.id]?.name || msg.id);
            updateUserList();
            break;
        case 'voice-stop':
            if (knownUsers[msg.id]) knownUsers[msg.id].voice = false;
            const vp = document.querySelector(`[data-voice="${msg.id}"]`);
            if (vp) vp.remove();
            updateUserList();
            break;
        case 'code-edit':
            applyRemoteEdit(msg.changes);
            break;
        case 'cursor':
            updateRemoteCursor(msg.from, msg.line, msg.ch);
            break;
    }
}

// ─── Voice ───────────────────────────────────────
const micBtn = document.getElementById('mic-btn');
const micLabel = document.getElementById('mic-label');
let voiceActive = false;
let audioContext = null;
let mediaStream = null;
let processor = null;

micBtn.onclick = async () => {
    if (voiceActive) stopVoice();
    else await startVoice();
};

async function startVoice() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            if (ws.readyState === WebSocket.OPEN) ws.send(int16.buffer);
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
        voiceActive = true;
        micBtn.classList.add('active');
        micLabel.textContent = 'Leave Voice';
        send({ type: 'voice-start' });
        if (myId) addVoicePill(myId, nameInput.value || 'me');
    } catch (e) {
        alert('Microphone access denied: ' + e.message);
    }
}

function stopVoice() {
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (processor) { processor.disconnect(); processor = null; }
    voiceActive = false;
    micBtn.classList.remove('active');
    micLabel.textContent = 'Join Voice';
    send({ type: 'voice-stop' });
    if (myId) { const p = document.querySelector(`[data-voice="${myId}"]`); if (p) p.remove(); }
}

function addVoicePill(id, name) {
    if (document.querySelector(`[data-voice="${id}"]`)) return;
    const pill = document.createElement('div');
    pill.className = 'voice-pill';
    pill.dataset.voice = id;
    pill.textContent = name;
    voiceParticipants.appendChild(pill);
}

// Voice playback
let playbackCtx = null;
function handleVoiceData(buf) {
    if (!playbackCtx) playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    const int16 = new Int16Array(buf);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
    const buffer = playbackCtx.createBuffer(1, f32.length, 44100);
    buffer.getChannelData(0).set(f32);
    const src = playbackCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(playbackCtx.destination);
    src.start();
}

// ─── CodeMirror ──────────────────────────────────
const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
    mode: 'javascript',
    theme: 'material-darker',
    lineNumbers: true,
    autoCloseTags: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentUnit: 2,
    value: '// Splannes Thumb Pal — Collaborative IDE\n// Start typing — changes sync in real-time!\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));\n'
});

let sendTimeout = null;
let isApplyingRemote = false;

editor.on('change', (inst, changes) => {
    if (isApplyingRemote) return;
    if (sendTimeout) clearTimeout(sendTimeout);
    sendTimeout = setTimeout(() => {
        send({ type: 'code-edit', changes: JSON.stringify(changes) });
    }, 100);
});

editor.on('cursorActivity', (inst) => {
    if (isApplyingRemote) return;
    const pos = inst.getCursor();
    send({ type: 'cursor', line: pos.line, ch: pos.ch });
});

function applyRemoteEdit(changesStr) {
    try {
        const changes = JSON.parse(changesStr);
        isApplyingRemote = true;
        if (Array.isArray(changes)) {
            changes.forEach(c => editor.replaceRange(c.text, c.from, c.to));
        } else if (changes.text) {
            editor.replaceRange(changes.text, changes.from, changes.to);
        }
        isApplyingRemote = false;
    } catch { isApplyingRemote = false; }
}

const remoteCursors = {};
function updateRemoteCursor(clientId, line, ch) {
    if (clientId === myId) return;
    if (remoteCursors[clientId]) remoteCursors[clientId].clear();
    const color = colorFor(clientId);
    const el = document.createElement('div');
    el.style.cssText = `border-left:2px solid ${color};height:1.3em;`;
    remoteCursors[clientId] = editor.setBookmark({line, ch}, {widget: el});
}

// Language selector + Preview tab
document.getElementById('language-select').onchange = (e) => editor.setOption('mode', e.target.value);

const codeTab = document.getElementById('code-tab');
const previewTab = document.getElementById('preview-tab');
const editorWrapper = document.getElementById('editor-wrapper');
const previewWrapper = document.getElementById('preview-wrapper');
const previewFrame = document.getElementById('preview-frame');

codeTab.onclick = () => {
    codeTab.classList.add('active'); previewTab.classList.remove('active');
    editorWrapper.style.display = ''; previewWrapper.style.display = 'none';
};
previewTab.onclick = () => {
    previewTab.classList.add('active'); codeTab.classList.remove('active');
    editorWrapper.style.display = 'none'; previewWrapper.style.display = '';
    previewFrame.srcdoc = editor.getValue();
};
