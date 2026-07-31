/* ================= НАСТРОЙКИ ИИ ================= */
const API_KEY = 'AQ.Ab8RN6KsSYcUo8R8oF2ulXa0oj2YuA-1VLomqIQt7sb2vVPsZg'; 

/* ================= ДАННЫЕ И СОСТОЯНИЕ ================= */
let chats = JSON.parse(localStorage.getItem('eleven_chats_v5')) || [];
let activeChatId = null;
let isGeneratingIncident = false;

// Инициализация звука
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playNotificationSound() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);
}

function saveChats() { localStorage.setItem('eleven_chats_v3', JSON.stringify(chats)); }
function getCurrentTime() {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/* ================= РЕНДЕР ИНТЕРФЕЙСА ================= */
function renderChatList(filter = '') {
    const listEl = document.getElementById('chat-list');
    listEl.innerHTML = '';
    
    if (chats.length === 0) {
        listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Список чатов пуст.<br>Ожидание сообщений...</div>';
        return;
    }

    const filtered = chats.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    
    filtered.forEach(chat => {
        const lastMsg = chat.messages[chat.messages.length - 1] || { text: 'Нет сообщений', time: '' };
        const dotClass = chat.status === 'online' ? 'online' : (chat.status === 'typing' ? 'typing' : '');
        const unreadCount = chat.messages.filter(m => m.unread).length;
        
        const div = document.createElement('div');
        div.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
        div.onclick = () => openChat(chat.id);
        div.innerHTML = `
            <div class="avatar">
                <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                ${dotClass ? `<div class="status-dot ${dotClass}"></div>` : ''}
            </div>
            <div class="chat-item-info">
                <div class="chat-item-header">
                    <span class="chat-item-name">${chat.name}</span>
                    <span class="chat-item-time">${lastMsg.time}</span>
                </div>
                <div class="chat-item-bottom">
                    <div class="chat-item-last-msg">${lastMsg.sender === 'support' ? 'Вы: ' : ''}${lastMsg.text}</div>
                    ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                </div>
            </div>
        `;
        listEl.appendChild(div);
    });
}

function openChat(id) {
    activeChatId = id;
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    
    chat.messages.forEach(m => m.unread = false);
    saveChats();

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('chat-area').style.display = 'flex';
    document.getElementById('app').classList.replace('view-list', 'view-chat');
    
    document.getElementById('active-chat-name').innerText = chat.name;
    updateStatusUI(chat);
    renderMessages();
    renderChatList(document.getElementById('search-input').value);
    
    setTimeout(() => document.getElementById('message-input').focus(), 100);
}

function closeChatMobile() { document.getElementById('app').classList.replace('view-chat', 'view-list'); }

function renderMessages() {
    const container = document.getElementById('messages-container');
    const typingIndicator = document.getElementById('typing-indicator');
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    Array.from(container.children).forEach(child => { if(child.id !== 'typing-indicator') child.remove(); });

    let currentDate = null;
    chat.messages.forEach(msg => {
        if (msg.date !== currentDate) {
            const divider = document.createElement('div');
            divider.className = 'date-divider';
            divider.innerHTML = `<span>${msg.date}</span>`;
            container.insertBefore(divider, typingIndicator);
            currentDate = msg.date;
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.sender === 'user' ? 'message-user' : 'message-support'}`;
        msgDiv.innerHTML = `${msg.text} <span class="message-time">${msg.time}</span>`;
        container.insertBefore(msgDiv, typingIndicator);
    });

    typingIndicator.style.display = chat.status === 'typing' ? 'block' : 'none';
    container.scrollTop = container.scrollHeight;
}

function updateStatusUI(chat) {
    const statusEl = document.getElementById('active-chat-status');
    if(activeChatId === chat.id) {
        statusEl.innerText = chat.statusText;
        statusEl.className = `chat-header-status ${chat.status === 'online' || chat.status === 'typing' ? 'online' : ''}`;
    }
}

/* ================= ОТПРАВКА СООБЩЕНИЙ И УМНЫЙ ИИ ================= */
function handleKeyPress(e) { if(e.key === 'Enter') sendMessage(); }

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !activeChatId) return;

    const chat = chats.find(c => c.id === activeChatId);
    chat.messages.push({ sender: 'support', text, time: getCurrentTime(), date: 'Сегодня', unread: false });
    input.value = '';
    
    saveChats();
    renderMessages();
    renderChatList();

    triggerUserAIResponse(chat, text);
}

async function askAI(promptText) {
    if (API_KEY === 'ТВОЙ_API_КЛЮЧ_GEMINI' || !API_KEY) return null;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        const data = await res.json();
        return data.candidates[0].content.parts[0].text.trim();
    } catch (e) {
        console.error('Ошибка ИИ:', e);
        return null;
    }
}

async function triggerUserAIResponse(chat, userText) {
    setTimeout(() => {
        chat.status = 'online'; chat.statusText = 'Онлайн';
        updateStatusUI(chat); renderChatList();
    }, 500);

    setTimeout(() => {
        chat.status = 'typing'; chat.statusText = 'Пользователь печатает...';
        updateStatusUI(chat); renderMessages(); renderChatList();
    }, 1500);

    // Сбор всей истории переписки
    const conversationHistory = chat.messages.map(m => 
        `${m.sender === 'user' ? 'Клиент' : 'Поддержка'}: ${m.text}`
    ).join('\n');

    const prompt = `Ты клиент сервиса аренды электросамокатов.
Вот вся история вашей переписки с поддержкой:
---
${conversationHistory}
---

Поддержка только что ответила тебе: "${userText}".
Напиши логичный ответ от лица клиента (1-2 предложения). 
КРИТИЧЕСКИ ВАЖНО:
- Строго соблюдай контекст всего диалога.
- Если поддержка попросила подождать — ответь "Хорошо, жду" или аналогично.
- Если тебе ответили на вопрос или решили проблему — поблагодари.
- Не говори "всё заработало", если специалист ещё ничего не сделал.`;

    let aiResponseText = await askAI(prompt);

    if (!aiResponseText) {
        const fallbacks = ["Хорошо, жду.", "Понял, спасибо за информацию.", "Отлично, сейчас проверю.", "Да, всё верно."];
        aiResponseText = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    setTimeout(() => {
        const isUnread = activeChatId !== chat.id;
        
        chat.messages.push({ sender: 'user', text: aiResponseText, time: getCurrentTime(), date: 'Сегодня', unread: isUnread });
        chat.status = 'online'; chat.statusText = 'Онлайн';
        
        saveChats();
        if(activeChatId === chat.id) renderMessages();
        renderChatList();
        
        if (activeChatId !== chat.id) {
            playNotificationSound();
            showToast(chat.name, aiResponseText);
        }

        setTimeout(() => {
            chat.status = 'offline'; chat.statusText = 'Был недавно';
            updateStatusUI(chat); renderChatList(); saveChats();
        }, 6000);

    }, 2000);
}

/* ================= ГЕНЕРАЦИЯ УНИКАЛЬНЫХ ОБРАЩЕНИЙ ================= */
const PROBLEM_CATEGORIES = [
    "ошибка списания средств или двойная оплата",
    "механическая поломка (пробитое колесо, отказали тормоза, люфт руля)",
    "сбой GPS (приложение показывает не то место, не получается завершить поездку)",
    "проблема со шлемом или заклинившим замком парковки",
    "вопрос по превышению скорости, штрафам или запрещенным зонам",
    "самокат не разблокируется при сканировании QR-кода",
    "забытые личные вещи в сумочке или на руле самоката",
    "вопрос по промокодам, подписке или баллам лояльности"
];

async function generateNewIncident() {
    if (isGeneratingIncident) return;
    isGeneratingIncident = true;

    try {
        const newId = Math.floor(Math.random() * 9000) + 1000;
        const randomCategory = PROBLEM_CATEGORIES[Math.floor(Math.random() * PROBLEM_CATEGORIES.length)];
        const seed = Math.floor(Math.random() * 1000000);
        
        let issueText = await askAI(`Придумай конкретную и уникальную проблему клиента сервиса аренды электросамокатов. Категория: "${randomCategory}". Уникальный ID: ${seed}. Без приветствия, от первого лица, ровно 1 короткое предложение с деталями.`);
        
        if (!issueText) {
            const fallbacks = [
                "У меня списали деньги за поездку дважды, верните пожалуйста.",
                "Тормоза на самокате почти не работают, чуть не врезался!",
                "Не могу завершить поездку, пишет 'вынесите из синей зоны', хотя я на парковке.",
                "Замок шлема заклинило, не могу его достать."
            ];
            issueText = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }

        const newChat = {
            id: newId,
            name: `Пользователь #${newId}`,
            status: 'online',
            statusText: 'Онлайн',
            messages: [{ sender: 'user', text: issueText, time: getCurrentTime(), date: 'Сегодня', unread: true }]
        };

        chats.unshift(newChat);
        saveChats();
        
        renderChatList(document.getElementById('search-input').value);
        playNotificationSound();
        showToast('Новое обращение', issueText);
    } finally {
        isGeneratingIncident = false;
    }
}

setInterval(generateNewIncident, 60000);

/* ================= МОДАЛЬНОЕ ОКНО И ТОСТЫ ================= */
function openModal() { document.getElementById('modal').classList.add('active'); }
function closeModal(e) { 
    if(e && e.target !== document.getElementById('modal')) return;
    document.getElementById('modal').classList.remove('active'); 
}

function leaveChat() {
    activeChatId = null;
    document.getElementById('chat-area').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    closeChatMobile(); closeModal(); renderChatList();
}

function endChat() {
    chats = chats.filter(c => c.id !== activeChatId);
    saveChats(); leaveChat();
    showToast('Система', 'Чат успешно завершен.');
}

function showToast(title, msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div><strong>${title}</strong><br><span style="color:var(--text-muted);font-size:13px;">${msg}</span></div>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}

/* ================= ПОИСК И ИНИЦИАЛИЗАЦИЯ ================= */
document.getElementById('search-input').addEventListener('input', (e) => renderChatList(e.target.value));

if (chats.length > 0 && document.getElementById('empty-state').style.display !== 'none') {
    document.getElementById('chat-area').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
}
renderChatList();
