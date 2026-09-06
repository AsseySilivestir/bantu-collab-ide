// Splannes Thumb Pal — Collaborative IDE
// Chat (text + voice messages) + Real-time Code Editing

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}/`);
ws.binaryType = 'arraybuffer';

const connDot = document.querySelector('#conn-status .dot');
const connText = document.querySelector('#conn-status .conn-text');
ws.onopen = () => { connDot.className = 'dot connected'; connText.textContent = 'Connected'; };
ws.onclose = () => { connDot.className = 'dot disconnected'; connText.textContent = 'Disconnected'; };
ws.onerror = () => { connText.textContent = 'Error'; };
ws.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) { handleBinaryMessage(e.data); return; }
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
    if (type === 'system') {
        div.className = 'chat-msg system'; div.textContent = text;
    } else if (type === 'sent') {
        div.className = 'chat-msg sent';
        div.innerHTML = `<span class="from">${escapeHtml(name)}</span>${escapeHtml(text)}`;
    } else {
        div.className = 'chat-msg received';
        div.innerHTML = `<span class="from" style="color:${colorFor(name)}">${escapeHtml(name)}</span>${escapeHtml(text)}`;
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

// ─── Voice messages (WhatsApp-style) ────────────
const recordBtn = document.getElementById('record-btn');
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordTimer = null;
let recordSeconds = 0;

const recIndicator = document.createElement('div');
recIndicator.className = 'recording-indicator';
recIndicator.innerHTML = '<span class="rec-dot"></span><span>Recording</span><span class="rec-timer">0:00</span>';
document.body.appendChild(recIndicator);

recordBtn.onclick = async () => {
    if (isRecording) { stopRecording(); } else { await startRecording(); }
};

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        recordSeconds = 0;
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onload = () => {
                const audioData = new Uint8Array(reader.result);
                const framed = new Uint8Array(audioData.length + 1);
                framed[0] = 0xFF;
                framed.set(audioData, 1);
                if (ws.readyState === WebSocket.OPEN) ws.send(framed.buffer);
                addVoiceMessage('sent', nameInput.value || 'me', blob, recordSeconds);
            };
            reader.readAsArrayBuffer(blob);
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add('recording');
        recIndicator.classList.add('active');
        recordTimer = setInterval(() => {
            recordSeconds++;
            const m = Math.floor(recordSeconds / 60);
            const s = (recordSeconds % 60).toString().padStart(2, '0');
            recIndicator.querySelector('.rec-timer').textContent = `${m}:${s}`;
        }, 1000);
    } catch (e) { alert('Microphone access denied: ' + e.message); }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording');
    recIndicator.classList.remove('active');
    clearInterval(recordTimer);
}

function addVoiceMessage(type, name, blob, duration) {
    const div = document.createElement('div');
    div.className = `voice-msg ${type}`;
    const url = URL.createObjectURL(blob);

    // Create an actual <audio> element in the DOM (more reliable than detached Audio)
    const audio = document.createElement('audio');
    audio.src = url;
    audio.preload = 'auto';
    audio.style.display = 'none';
    div.appendChild(audio);

    // Error handling
    audio.addEventListener('error', (e) => {
        console.error('Audio error:', audio.error);
        console.error('Blob size:', blob.size, 'type:', blob.type);
        div.querySelector('.duration').textContent = 'Error';
    });

    // Get duration from metadata when available
    audio.addEventListener('loadedmetadata', () => {
        const d = audio.duration;
        if (d && d !== Infinity && d > 0) {
            const m = Math.floor(d / 60);
            const s = Math.floor(d % 60).toString().padStart(2, '0');
            div.querySelector('.duration').textContent = `${m}:${s}`;
        }
    });

    // Also try canplay event — some browsers need it
    audio.addEventListener('canplaythrough', () => {
        console.log('Audio can play, duration:', audio.duration);
    });

    const m = Math.floor(duration / 60);
    const s = (duration % 60).toString().padStart(2, '0');
    const numBars = 20;
    let barsHtml = '';
    for (let i = 0; i < numBars; i++) {
        const h = Math.floor(Math.random() * 16) + 4;
        barsHtml += `<div class="bar" style="height:${h}px"></div>`;
    }

    const controlsDiv = document.createElement('div');
    controlsDiv.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;';
    controlsDiv.innerHTML = `
        <button class="play-btn">▶</button>
        <div class="waveform">${barsHtml}</div>
        <span class="duration">${m}:${s}</span>
    `;
    div.insertBefore(controlsDiv, audio);

    const playBtn = controlsDiv.querySelector('.play-btn');
    const bars = controlsDiv.querySelectorAll('.bar');

    playBtn.addEventListener('click', () => {
        console.log('Play clicked, audio src:', audio.src.substring(0, 50));
        console.log('Audio readyState:', audio.readyState);
        if (audio.paused) {
            // Force reload if not loaded yet
            if (audio.readyState === 0) {
                audio.load();
            }
            audio.play().then(() => {
                console.log('Audio playing');
                playBtn.textContent = '⏸';
            }).catch(e => {
                console.error('Play failed:', e);
                // Try reloading
                audio.load();
                audio.play().then(() => {
                    playBtn.textContent = '⏸';
                }).catch(e2 => {
                    console.error('Play still failed:', e2);
                    alert('Cannot play audio: ' + e2.message);
                });
            });
            let i = 0;
            const interval = setInterval(() => {
                if (i < bars.length) bars[i].classList.add('played');
                i++;
                if (i >= bars.length) clearInterval(interval);
            }, Math.max(100, (duration * 1000) / bars.length));
            audio.onended = () => {
                playBtn.textContent = '▶';
                bars.forEach(b => b.classList.remove('played'));
            };
        } else {
            audio.pause();
            playBtn.textContent = '▶';
        }
    });

    if (type === 'received') {
        const fromDiv = document.createElement('span');
        fromDiv.className = 'from';
        fromDiv.style.color = colorFor(name);
        fromDiv.textContent = name;
        div.insertBefore(fromDiv, div.firstChild);
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleBinaryMessage(buf) {
    const data = new Uint8Array(buf);
    if (data.length > 0 && data[0] === 0xFF) {
        const audioData = data.slice(1);
        const blob = new Blob([audioData], { type: 'audio/webm' });
        // Duration unknown for received voice messages — will be detected
        // from the audio metadata in addVoiceMessage
        addVoiceMessage('received', 'voice', blob, 0);
    }
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
        div.innerHTML = `<div class="avatar" style="background:${colorFor(id)}">${initials(info.name)}</div><span class="name">${escapeHtml(info.name)}</span><span class="indicator"></span>`;
        usersList.appendChild(div);
    });
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'welcome':
            myId = msg.id;
            knownUsers[myId] = { name: nameInput.value || 'me' };
            send({ type: 'set-name', name: nameInput.value.trim() || 'guest' });
            updateUserList();
            break;
        case 'user-joined':
            if (msg.id !== myId) { knownUsers[msg.id] = { name: msg.id }; addChatMessage('system', null, `${msg.id} joined`); updateUserList(); }
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
        case 'code-edit':
            // Pass the ENTIRE message object, not just msg.changes
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
        // Full content snapshot — replace the entire editor
        const cursor = editor.getCursor();
        editor.setValue(msg.content);
        editor.setCursor(cursor);
        lastSentContent = msg.content;
    } else if (msg.changes) {
        // Legacy delta-based sync (fallback)
        try {
            const changes = typeof msg.changes === 'string' ? JSON.parse(msg.changes) : msg.changes;
            if (Array.isArray(changes)) {
                changes.forEach(c => editor.replaceRange(c.text, c.from, c.to));
            } else if (changes.text) {
                editor.replaceRange(changes.text, changes.from, changes.to);
            }
        } catch {}
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

// Language + preview tabs
document.getElementById('language-select').onchange = (e) => editor.setOption('mode', e.target.value);
const codeTab = document.getElementById('code-tab');
const previewTab = document.getElementById('preview-tab');
const editorWrapper = document.getElementById('editor-wrapper');
const previewWrapper = document.getElementById('preview-wrapper');
const previewFrame = document.getElementById('preview-frame');
codeTab.onclick = () => { codeTab.classList.add('active'); previewTab.classList.remove('active'); editorWrapper.style.display=''; previewWrapper.style.display='none'; };
previewTab.onclick = () => { previewTab.classList.add('active'); codeTab.classList.remove('active'); editorWrapper.style.display='none'; previewWrapper.style.display=''; previewFrame.srcdoc = editor.getValue(); };
