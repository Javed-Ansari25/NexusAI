'use strict';

const CONFIG = {
  API_BASE:    'http://localhost:4000',
  SOCKET_URL:  'http://localhost:4000',
  MAX_HISTORY: 50,
  TYPING_SPEED: 8, // ms per character
};

const state = {
  user: null, authToken: null, socket: null,
  currentSessionId: null,   // frontend session id (localStorage)
  currentChatId: null,      // backend chatId (_id from MongoDB)
  chatSessions: [], isStreaming: false,
  attachedFiles: [],
  renamingId: null,
  stopRequested: false,
  userScrolled: false,
};

const stream = { buffer: '', el: null, wrapEl: null, typingQueue: [], typingTimer: null };
function streamReset() {
  stream.buffer = ''; stream.el = null; stream.wrapEl = null;
  stream.typingQueue = [];
  if (stream.typingTimer) { clearTimeout(stream.typingTimer); stream.typingTimer = null; }
  state.stopRequested = false;
}

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  createToastContainer();
  checkAuth();
  $('messageInput').addEventListener('input', syncSendBtn);
  const overlay = $('mobileOverlay');
  if (overlay) overlay.onclick = closeSidebar;

  // Smart scroll
  const msgContainer = $('messagesContainer');
  if (msgContainer) {
    let lastScrollTop = 0;
    msgContainer.addEventListener('scroll', () => {
      const current = msgContainer.scrollTop;
      const distanceFromBottom = msgContainer.scrollHeight - current - msgContainer.clientHeight;
      if (state.isStreaming) {
        if (current < lastScrollTop && distanceFromBottom > 40) state.userScrolled = true;
        if (distanceFromBottom < 40) state.userScrolled = false;
      }
      lastScrollTop = current;
    }, { passive: true });
  }
});

function syncSendBtn() {
  $('sendBtn').disabled = (!$('messageInput').value.trim() && !state.attachedFiles.length) || state.isStreaming;
  if (!state.isStreaming) hideStopBtn();
}

// ══ AUTH ═════════════════════════════════════════

async function checkAuth() {
  const savedUser = localStorage.getItem('nexus_user');
  if (savedUser) state.user = JSON.parse(savedUser);
  try {
    // Route: GET /api/auth/me
    const res = await apiFetch('/api/auth/me');
    if (res.ok) { state.user = (await res.json()).user || state.user; enterApp(); }
    else clearAuth();
  } catch { clearAuth(); }
}

function clearAuth() {
  localStorage.removeItem('nexus_user');
  state.authToken = null; state.user = null;
}

async function handleLogin() {
  const email    = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const errEl    = $('loginError');
  clearError(errEl);
  if (!email || !password) return showError(errEl, 'Please fill all fields.');
  const btn = document.querySelector('#loginForm .btn-primary');
  setLoading(btn, true);
  try {
    // Route: POST /api/auth/login
    const res  = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    state.user = data.user || { email };
    localStorage.setItem('nexus_user', JSON.stringify(state.user));
    enterApp();
  } catch (err) { showError(errEl, err.message); }
  finally { setLoading(btn, false); }
}

async function handleRegister() {
  const name     = $('regName').value.trim();
  const email    = $('regEmail').value.trim();
  const password = $('regPassword').value;
  const errEl    = $('registerError');
  clearError(errEl);
  if (!name || !email || !password) return showError(errEl, 'Please fill all fields.');
  if (password.length < 8) return showError(errEl, 'Password must be at least 8 characters.');
  const btn = document.querySelector('#registerForm .btn-primary');
  setLoading(btn, true);
  try {
    // Route: POST /api/auth/register
    const res  = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    state.user = data.user || { name, email };
    localStorage.setItem('nexus_user', JSON.stringify(state.user));
    enterApp();
    toast('Welcome to NexusAI!', 'success');
  } catch (err) { showError(errEl, err.message); }
  finally { setLoading(btn, false); }
}

async function handleLogout() {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
  if (state.socket) { state.socket.disconnect(); state.socket = null; }

  // ── Clear all state BEFORE clearAuth (so getUserId() still works if needed) ──
  state.chatSessions     = [];
  state.currentSessionId = null;
  state.currentChatId    = null;
  streamReset();

  // ── Wipe UI so next user never sees previous user's chats ──
  const chatHistory = $('chatHistory');
  if (chatHistory) chatHistory.innerHTML = '';          // clear sidebar history list
  const messages = $('messages');
  if (messages) messages.innerHTML = '';                // clear chat messages
  $('welcomeScreen').classList.remove('hidden');        // show welcome screen
  $('messagesContainer').classList.add('hidden');       // hide messages container

  clearAuth();   // sets state.user = null AFTER we're done needing getUserId()

  $('chatApp').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
  $('loginEmail').value    = '';
  $('loginPassword').value = '';
  $('regName').value       = '';
  $('regEmail').value      = '';
  $('regPassword').value   = '';
  showLogin();
}

function getUserId() {
  return (state.user && (state.user._id || state.user.id || state.user.email)) || 'guest';
}

function enterApp() {
  const u = state.user;
  if (u) {
    $('userName').textContent   = u.name  || u.email || 'User';
    $('userEmail').textContent  = u.email || '';
    $('userAvatar').textContent = (u.name || u.email || 'U')[0].toUpperCase();
  }
  $('authScreen').classList.add('hidden');
  $('chatApp').classList.remove('hidden');
  loadSessionsFromStorage();
  renderHistory();
  initSocket();
}

// ══ SOCKET ═══════════════════════════════════════

function initSocket() {
  if (typeof io === 'undefined') {
    const s = document.createElement('script');
    s.src     = CONFIG.SOCKET_URL + '/socket.io/socket.io.js';
    s.onload  = connectSocket;
    s.onerror = () => setStatus('REST mode', '');
    document.head.appendChild(s);
  } else connectSocket();
}

function connectSocket() {
  if (state.socket) return;
  setStatus('Connecting...', 'connecting');
  try {
    state.socket = io(CONFIG.SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 2000,
    });
    state.socket.on('connect',    () => { setStatus('Connected', 'connected'); setTimeout(() => setStatus('', ''), 3000); });
    state.socket.on('disconnect', () => setStatus('Disconnected — retrying...', 'error'));
    state.socket.on('connect_error', (err) => { console.warn('Socket error:', err.message); setStatus('REST mode active', ''); });

    // Backend emits "new_message" with full message objects (userMessage / aiMessage)
    state.socket.on('new_message', (msg) => {
      if (!msg || msg.role !== 'assistant') return; // only handle AI replies via socket
      const chunk = msg.content || '';
      if (chunk) onStreamChunk(chunk);
      onStreamDone(state.currentChatId);
    });

    // Keep legacy streaming events if backend supports them
    state.socket.on('ai:token', (data) => {
      const chunk = typeof data === 'string' ? data : (data && (data.token || data.chunk || data.text || data.content)) || '';
      if (chunk) onStreamChunk(String(chunk));
    });
    state.socket.on('ai:done',  (data) => onStreamDone(data && (data.chatId || data.sessionId)));
    state.socket.on('ai:error', (data) => onStreamError((data && data.message) || 'AI error'));
  } catch (err) {
    state.socket = null; setStatus('REST mode', '');
  }
}

// ══ SESSIONS (localStorage index + backend messages) ══════

function getSessionKey() {
  return 'nexus_sessions_' + getUserId();
}

function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(getSessionKey());
    state.chatSessions = raw ? JSON.parse(raw) : [];
    // Ensure messages array exists in memory
    state.chatSessions = state.chatSessions.map(s => ({ ...s, messages: s.messages || [] }));
  } catch { state.chatSessions = []; }
}

function saveSessionsToStorage() {
  // Only persist metadata — messages live on the backend
  const index = state.chatSessions.map(s => ({
    id: s.id,           // frontend session id
    chatId: s.chatId,   // backend MongoDB _id  ← KEY FIX
    title: s.title,
    createdAt: s.createdAt,
  }));
  localStorage.setItem(getSessionKey(), JSON.stringify(index.slice(0, CONFIG.MAX_HISTORY)));
}

// Route: GET /api/ai/history/:chatId
async function fetchChatHistory(chatId) {
  try {
    const res = await apiFetch('/api/ai/history/' + chatId);
    if (!res.ok) return [];
    const data = await res.json();
    const messages = data.messages || data.data || [];
    return messages.map(m => ({
      role:    m.role,
      content: m.content || '',
      time:    m.createdAt || m.time || new Date().toISOString(),
      files:   m.files || [],
    }));
  } catch (err) {
    console.warn('History fetch failed:', err.message);
    return [];
  }
}

// Create a new local session entry (no backend call yet — chat is created on first message)
function getOrCreateSession(firstMsg) {
  if (state.currentSessionId) {
    const f = state.chatSessions.find(s => s.id === state.currentSessionId);
    if (f) return f;
  }
  const session = {
    id:        'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    chatId:    null,   // filled after first backend response
    title:     firstMsg.slice(0, 55),
    messages:  [],
    createdAt: new Date().toISOString(),
  };
  state.chatSessions.unshift(session);
  state.currentSessionId = session.id;
  state.currentChatId    = null;
  saveSessionsToStorage();
  renderHistory();
  return session;
}

function newChat() {
  state.currentSessionId = null;
  state.currentChatId    = null;
  $('welcomeScreen').classList.remove('hidden');
  $('messagesContainer').classList.add('hidden');
  $('messages').innerHTML = '';
  document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
  closeSidebar();
}

async function openSession(id) {
  const session = state.chatSessions.find(s => s.id === id);
  if (!session) return;

  state.currentSessionId = id;
  state.currentChatId    = session.chatId || null;

  $('messages').innerHTML = '';
  $('welcomeScreen').classList.add('hidden');
  $('messagesContainer').classList.remove('hidden');
  closeSidebar();
  document.querySelectorAll('.history-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));

  // Only fetch from backend if we have a real chatId
  if (session.chatId) {
    showTyping();
    const msgs = await fetchChatHistory(session.chatId);
    removeTyping();
    if (msgs.length > 0) session.messages = msgs;
  }

  if (!session.messages || session.messages.length === 0) {
    renderMessage('ai', 'No messages in this chat yet.', false, new Date().toISOString());
  } else {
    session.messages.forEach(msg => renderMessage(msg.role, msg.content, false, msg.time, false, msg.files));
  }

  scrollToBottom(true);
}

function deleteSession(id, e) {
  e.stopPropagation();
  state.chatSessions = state.chatSessions.filter(s => s.id !== id);
  saveSessionsToStorage();
  if (state.currentSessionId === id) newChat();
  renderHistory();
}

// ── RENAME ──
function openRenameModal(id, e) {
  e.stopPropagation();
  const session = state.chatSessions.find(s => s.id === id);
  if (!session) return;
  state.renamingId = id;
  $('renameInput').value = session.title;
  $('renameModal').classList.remove('hidden');
  setTimeout(() => { $('renameInput').focus(); $('renameInput').select(); }, 50);
}
function closeRenameModal() { $('renameModal').classList.add('hidden'); state.renamingId = null; }
function confirmRename() {
  const newTitle = $('renameInput').value.trim();
  if (!newTitle || !state.renamingId) return closeRenameModal();
  const session = state.chatSessions.find(s => s.id === state.renamingId);
  if (session) { session.title = newTitle.slice(0, 60); saveSessionsToStorage(); renderHistory(); }
  closeRenameModal();
}
$('renameInput') && ($('renameInput').onkeydown = (e) => {
  if (e.key === 'Enter') confirmRename();
  if (e.key === 'Escape') closeRenameModal();
});

// ── SEARCH ──
function searchChats(query) {
  const clear = $('searchClear');
  if (query) clear.classList.remove('hidden'); else clear.classList.add('hidden');
  renderHistory(query.toLowerCase());
}
function clearSearch() {
  $('searchInput').value = '';
  $('searchClear').classList.add('hidden');
  renderHistory();
}

function renderHistory(searchQuery) {
  const c = $('chatHistory');
  let sessions = state.chatSessions;
  if (searchQuery) {
    sessions = sessions.filter(s =>
      s.title.toLowerCase().includes(searchQuery) ||
      s.messages.some(m => m.content && m.content.toLowerCase().includes(searchQuery))
    );
  }
  if (!sessions.length) {
    c.innerHTML = `<div class="history-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><p>${searchQuery ? 'No results found' : 'No conversations yet'}</p></div>`;
    return;
  }
  c.innerHTML = sessions.map(s => {
    const title = searchQuery
      ? s.title.replace(new RegExp(searchQuery, 'gi'), m => `<mark class="search-highlight">${m}</mark>`)
      : escHtml(s.title);
    return `
    <div class="history-item ${s.id === state.currentSessionId ? 'active' : ''}" data-id="${s.id}" onclick="openSession('${s.id}')">
      <div class="history-item-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>
      <div class="history-item-text">
        <div class="history-item-title">${searchQuery ? title : escHtml(s.title)}</div>
        <div class="history-item-meta">${timeAgo(s.createdAt)}</div>
      </div>
      <div class="history-item-actions">
        <button class="history-action-btn" onclick="openRenameModal('${s.id}', event)" title="Rename">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button class="history-action-btn delete" onclick="deleteSession('${s.id}', event)" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

// ══ FILE UPLOAD ═══════════════════════════════════

function triggerFileUpload() { $('fileInput').click(); }

async function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const entry   = { file, name: file.name, size: file.size, type: isImage ? 'image' : 'doc', dataUrl: null };
    if (isImage) entry.dataUrl = await readFileAsDataUrl(file);
    state.attachedFiles.push(entry);
  }
  e.target.value = '';
  renderFilePreviews();
  syncSendBtn();
}

function readFileAsDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}

function renderFilePreviews() {
  const bar       = $('filePreviewBar');
  const container = $('filePreviews');
  if (!state.attachedFiles.length) { bar.classList.add('hidden'); container.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  container.innerHTML = state.attachedFiles.map((f, i) => {
    if (f.type === 'image') {
      return `<div class="image-chip-wrap"><img src="${f.dataUrl}" alt="${escHtml(f.name)}"/><button class="file-chip-remove" onclick="removeFile(${i})">✕</button></div>`;
    }
    return `<div class="file-chip"><span class="file-chip-icon">${getFileIcon(f.name)}</span><span class="file-chip-name">${escHtml(f.name)}</span><button class="file-chip-remove" onclick="removeFile(${i})">✕</button></div>`;
  }).join('');
}

function removeFile(idx) { state.attachedFiles.splice(idx, 1); renderFilePreviews(); syncSendBtn(); }

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext))        return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['txt'].includes(ext))        return '📃';
  return '📎';
}

// ══ SEND MESSAGE ══════════════════════════════════

async function sendMessage() {
  const input    = $('messageInput');
  const text     = input.value.trim();
  const hasFiles = state.attachedFiles.length > 0;
  if ((!text && !hasFiles) || state.isStreaming) return;

  const session = getOrCreateSession(text || state.attachedFiles[0].name);
  $('welcomeScreen').classList.add('hidden');
  $('messagesContainer').classList.remove('hidden');

  const now           = new Date().toISOString();
  const filesSnapshot = [...state.attachedFiles];

  renderMessage('user', text, true, now, false, filesSnapshot);
  session.messages.push({ role: 'user', content: text, time: now, files: filesSnapshot.map(f => ({ name: f.name, type: f.type, dataUrl: f.dataUrl })) });
  saveSessionsToStorage();

  input.value = ''; input.style.height = '';
  state.attachedFiles = [];
  renderFilePreviews();
  state.isStreaming  = true;
  state.stopRequested = false;
  state.userScrolled  = false;
  syncSendBtn();
  showStopBtn();
  streamReset();
  showTyping();

  if (hasFiles) {
    await sendViaRESTWithFiles(text, session, filesSnapshot);
  } else {
    // Always use REST — backend uses HTTP for sendMessage (no streaming socket emit)
    await sendViaREST(text, session);
  }
}

// ══ STREAM (for socket-based streaming if backend adds it later) ═══

function onStreamChunk(chunk) {
  if (!stream.el) {
    removeTyping();
    stream.buffer = '';
    const wrap    = document.createElement('div');
    wrap.className = 'message ai';
    wrap.innerHTML = `<div class="msg-row"><div class="ai-avatar"><svg viewBox="0 0 32 32" fill="none"><path d="M16 2L28 8v16L16 30 4 24V8z" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg></div><div class="msg-bubble" id="streamBubble"></div></div><div class="msg-meta">NexusAI</div>`;
    $('messages').appendChild(wrap);
    stream.wrapEl = wrap;
    stream.el     = document.getElementById('streamBubble');
  }
  if (state.stopRequested) return;
  for (const ch of chunk) stream.typingQueue.push(ch);
  if (!stream.typingTimer) drainTypingQueue();
}

function drainTypingQueue() {
  if (state.stopRequested || !stream.typingQueue.length) { stream.typingTimer = null; return; }
  for (let i = 0; i < 3 && stream.typingQueue.length; i++) stream.buffer += stream.typingQueue.shift();
  if (stream.el) {
    stream.el.innerHTML = renderMarkdown(stream.buffer);
    if (!state.userScrolled) scrollToBottom();
  }
  stream.typingTimer = setTimeout(drainTypingQueue, CONFIG.TYPING_SPEED);
}

function onStreamDone(chatId) {
  const flush = () => {
    if (!state.stopRequested && stream.typingQueue.length > 0) { setTimeout(flush, CONFIG.TYPING_SPEED * 2); return; }
    removeTyping();
    hideStopBtn();
    state.userScrolled = false;
    if (stream.el) stream.el.removeAttribute('id');
    const finalText = stream.buffer;
    streamReset();
    if (finalText) {
      const session = state.chatSessions.find(s => s.id === state.currentSessionId);
      if (session) {
        session.messages.push({ role: 'assistant', content: finalText, time: new Date().toISOString() });
        renderHistory();
      }
    }
    state.isStreaming = false; syncSendBtn(); $('messageInput').focus();
  };
  flush();
}

function onStreamError(msg) {
  removeTyping(); hideStopBtn();
  if (stream.el) stream.el.removeAttribute('id');
  streamReset();
  renderMessage('ai', '⚠ ' + msg, true, new Date().toISOString(), true);
  state.isStreaming = false; syncSendBtn();
}

// ══ REST ══════════════════════════════════════════

/*
 * Route: POST /api/ai/chat
 * Body:  { message, chatId? }  — chatId is the MongoDB _id (null = create new chat)
 * Response: { success, chat, userMessage, aiMessage }
 */
async function sendViaREST(text, session) {
  try {
    const body = { message: text };
    if (session.chatId) body.chatId = session.chatId;

    const res  = await apiFetch('/api/ai/chat', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Server error'); }

    const data = await res.json();

    // Persist the backend chatId on the session (first message creates the chat)
    if (data.chat && data.chat._id) {
      session.chatId      = data.chat._id;
      state.currentChatId = data.chat._id;
      if (data.chat.title && data.chat.title !== 'New Chat') session.title = data.chat.title;
      saveSessionsToStorage();
    }

    const reply = (data.aiMessage && data.aiMessage.content)
               || data.reply || data.message || data.content || 'No response';

    // ── Pipe through typing effect ──
    removeTyping();
    streamReset();
    onStreamChunk(reply);                    // pushes all chars into typingQueue
    // Wait for typing to finish, then save to session
    const waitAndFinish = () => {
      if (stream.typingQueue.length > 0 || stream.typingTimer) {
        setTimeout(waitAndFinish, 50);
        return;
      }
      const finalText = stream.buffer;
      if (stream.el) stream.el.removeAttribute('id');
      streamReset();
      session.messages.push({ role: 'assistant', content: finalText || reply, time: new Date().toISOString() });
      renderHistory();
      state.isStreaming = false; syncSendBtn(); hideStopBtn(); $('messageInput').focus();
    };
    waitAndFinish();
    return; // finally block must not reset isStreaming — waitAndFinish handles it
  } catch (err) {
    removeTyping();
    renderMessage('ai', '⚠ ' + err.message, true, new Date().toISOString(), true);
    state.isStreaming = false; syncSendBtn(); hideStopBtn(); $('messageInput').focus();
  }
}

/*
 * Route: POST /api/ai/chat  (multipart/form-data with files)
 * Body:  FormData — message, chatId?, files[]
 * Response: { success, chat, userMessage, aiMessage }
 */
async function sendViaRESTWithFiles(text, session, files) {
  try {
    const fd = new FormData();
    fd.append('message', text);
    if (session.chatId) fd.append('chatId', session.chatId);
    files.forEach(f => fd.append('files', f.file));

    const res = await fetch(CONFIG.API_BASE + '/api/ai/chat', {
      method: 'POST', credentials: 'include', body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Server error'); }

    const data = await res.json();

    if (data.chat && data.chat._id) {
      session.chatId      = data.chat._id;
      state.currentChatId = data.chat._id;
      if (data.chat.title && data.chat.title !== 'New Chat') session.title = data.chat.title;
      saveSessionsToStorage();
    }

    const reply = (data.aiMessage && data.aiMessage.content)
               || data.reply || data.message || data.content || 'No response';

    // ── Pipe through typing effect ──
    removeTyping();
    streamReset();
    onStreamChunk(reply);
    const waitAndFinish = () => {
      if (stream.typingQueue.length > 0 || stream.typingTimer) {
        setTimeout(waitAndFinish, 50);
        return;
      }
      const finalText = stream.buffer;
      if (stream.el) stream.el.removeAttribute('id');
      streamReset();
      session.messages.push({ role: 'assistant', content: finalText || reply, time: new Date().toISOString() });
      renderHistory();
      state.isStreaming = false; syncSendBtn(); hideStopBtn(); $('messageInput').focus();
    };
    waitAndFinish();
    return;
  } catch (err) {
    removeTyping();
    renderMessage('ai', '⚠ ' + err.message, true, new Date().toISOString(), true);
    state.isStreaming = false; syncSendBtn(); hideStopBtn(); $('messageInput').focus();
  }
}

// ══ TYPING INDICATOR ══════════════════════════════

function showTyping() {
  removeTyping();
  const div = document.createElement('div');
  div.id        = 'typingIndicator'; div.className = 'message ai typing-indicator';
  div.innerHTML = `<div class="msg-row"><div class="ai-avatar"><svg viewBox="0 0 32 32" fill="none"><path d="M16 2L28 8v16L16 30 4 24V8z" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg></div><div class="msg-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  $('messages').appendChild(div);
  scrollToBottom();
}
function removeTyping() { const el = $('typingIndicator'); if (el) el.remove(); }

// ── STOP STREAMING ────────────────────────────────

function showStopBtn() {
  let btn = $('stopBtn');
  if (!btn) {
    btn         = document.createElement('button');
    btn.id      = 'stopBtn'; btn.className = 'stop-btn';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stop generating`;
    btn.onclick = stopStreaming;
    const inputArea = document.querySelector('.input-area');
    if (inputArea) inputArea.insertBefore(btn, inputArea.firstChild);
  }
  btn.classList.remove('hidden');
}
function hideStopBtn() { const btn = $('stopBtn'); if (btn) btn.classList.add('hidden'); }

function stopStreaming() {
  state.stopRequested = true;
  if (state.socket && state.socket.connected) state.socket.emit('ai:stop', { chatId: state.currentChatId });
  // Clear queue so drainTypingQueue exits immediately
  stream.typingQueue = [];
  if (stream.typingTimer) { clearTimeout(stream.typingTimer); stream.typingTimer = null; }
  // Finalize whatever was typed so far
  const finalText = stream.buffer;
  if (stream.el) stream.el.removeAttribute('id');
  streamReset();
  if (finalText) {
    const session = state.chatSessions.find(s => s.id === state.currentSessionId);
    if (session) { session.messages.push({ role: 'assistant', content: finalText, time: new Date().toISOString() }); renderHistory(); }
  }
  removeTyping();
  hideStopBtn();
  state.userScrolled = false;
  state.isStreaming   = false;
  syncSendBtn();
  $('messageInput').focus();
}

// ══ MESSAGE RENDER ════════════════════════════════

function renderMessage(role, content, animate, timestamp, isError, files) {
  const div  = document.createElement('div');
  div.className = 'message ' + role;
  const t    = formatTime(timestamp || new Date().toISOString());

  let filesHtml = '';
  if (files && files.length) {
    filesHtml = files.map(f => {
      if (f.type === 'image' && f.dataUrl) return `<img class="msg-image" src="${f.dataUrl}" alt="${escHtml(f.name)}" onclick="zoomImage(this)"/>`;
      return `<div class="msg-file"><span class="msg-file-icon">${getFileIcon(f.name)}</span><div><div class="msg-file-name">${escHtml(f.name)}</div><div class="msg-file-size">${formatSize(f.size || 0)}</div></div></div>`;
    }).join('');
  }

  if (role === 'user') {
    div.dataset.content = content;
    div.innerHTML = `
      ${filesHtml}
      <div class="msg-bubble">${content ? renderMarkdown(content) : ''}</div>
      <div class="msg-meta">${t}</div>
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="editMessage(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          Edit
        </button>
      </div>`;
  } else {
    div.innerHTML = `
      <div class="msg-row">
        <div class="ai-avatar"><svg viewBox="0 0 32 32" fill="none"><path d="M16 2L28 8v16L16 30 4 24V8z" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg></div>
        <div class="msg-bubble${isError ? ' error' : ''}">${isError ? escHtml(content) : renderMarkdown(content)}</div>
      </div>
      <div class="msg-meta">NexusAI · ${t}</div>
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="copyMessage(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy
        </button>
      </div>`;
  }
  $('messages').appendChild(div);
  scrollToBottom();
  return div;
}

// ══ EDIT MESSAGE ══════════════════════════════════

function editMessage(btn) {
  const msgDiv  = btn.closest('.message');
  const original = msgDiv.dataset.content || '';
  const bubble  = msgDiv.querySelector('.msg-bubble');
  if (msgDiv.querySelector('.edit-area')) return;

  const textarea  = document.createElement('textarea');
  textarea.className = 'edit-area';
  textarea.value  = original;
  textarea.rows   = Math.min(8, original.split('\n').length + 1);

  const btnsDiv   = document.createElement('div');
  btnsDiv.className = 'edit-btns';
  btnsDiv.innerHTML = `<button class="edit-save-btn" onclick="saveEdit(this)">Send</button><button class="edit-cancel-btn" onclick="cancelEdit(this)">Cancel</button>`;

  bubble.style.display = 'none';
  msgDiv.insertBefore(textarea, msgDiv.querySelector('.msg-meta'));
  msgDiv.insertBefore(btnsDiv, msgDiv.querySelector('.msg-meta'));
  textarea.focus();
}

function cancelEdit(btn) {
  const msgDiv = btn.closest('.message');
  msgDiv.querySelector('.msg-bubble').style.display = '';
  btn.closest('.edit-btns').remove();
  msgDiv.querySelector('.edit-area').remove();
}

async function saveEdit(btn) {
  const msgDiv   = btn.closest('.message');
  const textarea = msgDiv.querySelector('.edit-area');
  const newText  = textarea.value.trim();
  if (!newText) return;

  msgDiv.dataset.content = newText;
  const bubble = msgDiv.querySelector('.msg-bubble');
  bubble.innerHTML     = renderMarkdown(newText);
  bubble.style.display = '';
  btn.closest('.edit-btns').remove();
  textarea.remove();

  // Remove all messages after this one
  let next = msgDiv.nextElementSibling;
  while (next) { const tmp = next.nextElementSibling; next.remove(); next = tmp; }

  const session = state.chatSessions.find(s => s.id === state.currentSessionId);
  if (session) {
    const msgs = Array.from($('messages').children);
    const idx  = msgs.indexOf(msgDiv);
    session.messages = session.messages.slice(0, idx);
    session.messages.push({ role: 'user', content: newText, time: new Date().toISOString() });
    saveSessionsToStorage();

    state.isStreaming = true; syncSendBtn();
    streamReset(); showTyping();
    // Use REST for resend — passing existing chatId so backend appends to same chat
    await sendViaREST(newText, session);
  }
}

// ══ COPY ══════════════════════════════════════════

function copyMessage(btn) {
  const bubble = btn.closest('.message').querySelector('.msg-bubble');
  const text   = bubble ? (bubble.innerText || bubble.textContent) : '';
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
    }, 2000);
  });
}

// ══ MARKDOWN ══════════════════════════════════════

function renderMarkdown(raw) {
  if (!raw) return '';
  let t = escHtml(raw);
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = 'cb_' + Math.random().toString(36).slice(2, 7);
    return `<div class="code-block-wrap"><pre><code id="${id}">${code.trim()}</code></pre><button class="code-copy-btn" onclick="copyCode('${id}', this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</button></div>`;
  });
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  t = t.replace(/^###\s(.+)$/gm, '<p><strong>$1</strong></p>');
  t = t.replace(/^##\s(.+)$/gm,  '<p><strong>$1</strong></p>');
  t = t.replace(/^#\s(.+)$/gm,   '<p><strong>$1</strong></p>');
  t = t.replace(/^\s*[-*]\s(.+)$/gm, '<li>$1</li>');
  t = t.replace(/^\d+\.\s(.+)$/gm,   '<li>$1</li>');
  t = t.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  t = t.split(/\n{2,}/).map(p => {
    p = p.trim(); if (!p) return '';
    if (/^<(pre|ul|ol|p|strong|div|h)/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return t;
}

function copyCode(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText || el.textContent).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
    }, 2000);
  });
}

// ══ IMAGE ZOOM ════════════════════════════════════

function zoomImage(img) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(8px)';
  const big = document.createElement('img');
  big.src = img.src; big.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,0.8)';
  overlay.appendChild(big); overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

// ══ SIDEBAR / UI HELPERS ══════════════════════════

function openSidebar()  { $('sidebar').classList.add('open');    $('mobileOverlay').classList.add('show'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('mobileOverlay').classList.remove('show'); }
function showLogin()    { $('loginForm').classList.remove('hidden');    $('registerForm').classList.add('hidden');    clearError($('loginError')); }
function showRegister() { $('registerForm').classList.remove('hidden'); $('loginForm').classList.add('hidden');       clearError($('registerError')); }

function togglePass(id, btn) {
  const inp = $(id); inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.style.color = inp.type === 'text' ? 'var(--accent)' : '';
}

function useSuggestion(btn) {
  $('messageInput').value = btn.querySelector('span').textContent;
  $('messageInput').focus(); autoResize($('messageInput')); syncSendBtn();
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!$('sendBtn').disabled) sendMessage(); }
}
function autoResize(el) { el.style.height = ''; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; }
function scrollToBottom(force) {
  const c = $('messagesContainer');
  if (!c) return;
  if (force || !state.userScrolled) c.scrollTop = c.scrollHeight;
}

// ══ API ═══════════════════════════════════════════

function apiFetch(path, opts = {}) {
  return fetch(CONFIG.API_BASE + path, {
    ...opts, credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

// ══ HELPERS ═══════════════════════════════════════

function setStatus(msg, type) {
  const el = $('connectionStatus'); el.textContent = msg;
  el.className = 'connection-status' + (type ? ' ' + type : '');
}
function showError(el, msg) { el.textContent = msg; el.classList.add('show'); }
function clearError(el)     { el.textContent = ''; el.classList.remove('show'); }
function setLoading(btn, on) {
  const s = btn.querySelector('span');
  if (on) { btn._orig = s.textContent; s.textContent = 'Please wait...'; btn.classList.add('loading'); }
  else    { s.textContent = btn._orig || s.textContent; btn.classList.remove('loading'); }
}

let _toastEl;
function createToastContainer() { _toastEl = document.createElement('div'); _toastEl.className = 'toast-container'; document.body.appendChild(_toastEl); }
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el    = document.createElement('div'); el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span>' + escHtml(msg) + '</span>';
  _toastEl.appendChild(el); setTimeout(() => el.remove(), 3500);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
function formatSize(bytes) {
  if (bytes < 1024)        return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}
function timeAgo(iso) {
  try {
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'Just now'; if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  } catch { return ''; }
}