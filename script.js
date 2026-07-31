/* ================= НАСТРОЙКИ ИИ ================= */
const API_KEY = 'AQ.Ab8RN6LFXCoLcr_m5H5dmU4QIecHnXwum7O4xcPM6rOQjZAsjQ'; 

/* ================= ДАННЫЕ И СОСТОЯНИЕ ================= */
let chats = JSON.parse(localStorage.getItem('eleven_chats_v3')) || [];
let activeChatId = null;
let isGeneratingIncident = false; // Блокировка от одновременных вызовов (исправление дубликатов)

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

/* ================= ОТПРАВКА СООБЩЕНИЙ И ОТВЕТ ИИ ================= */
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

    const prompt = `Ты клиент сервиса аренды самокатов. Поддержка только что написала тебе: "${userText}". Ответь коротко, в 1-2 предложения, от лица клиента.`;
    let aiResponseText = await askAI(prompt);

    if (!aiResponseText) {
        const fallbacks = ["Спасибо за помощь!", "Понял, сейчас попробую.", "А можно еще один вопрос?", "Супер, всё заработало!"];
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

/* ================= ГЕНЕРАЦИЯ НОВЫХ ЧАТОВ (С ЗАЩИТОЙ ОТ ДУБЛЕЙ) ================= */
async function generateNewIncident() {
    if (isGeneratingIncident) return; // Защита от дублирования
    isGeneratingIncident = true;

    try {
        const newId = Math.floor(Math.random() * 9000) + 1000;
        const seed = Math.floor(Math.random() * 1000000); // Рандом для уникальности ИИ
        
        let issueText = await askAI(`Придумай УНИКАЛЬНУЮ и оригинальную проблему с арендой электросамоката. Рандомный код: #${seed}. Без приветствия, только суть проблемы в 1 короткое предложение.`);
        
        if (!issueText) {
            const issues = [
                "Не могу завершить поездку в приложении, выдает ошибку.",
                "Самокат разрядился прямо во время поездки!",
                "Списались деньги, но самокат не разблокировался.",
                "Тормоз плохо работает, ехать опасно.",
                "Замок шлема не открывается.",
                "Приложение показывает, что я вне зоны парковки."
            ];
            issueText = issues[Math.floor(Math.random() * issues.length)];
        }

        // Дополнительная проверка: нет ли уже точно такого же текста в чатах
        const isDuplicate = chats.some(c => c.messages.some(m => m.text === issueText));
        if (isDuplicate) {
            issueText += ` (Ошибка #${Math.floor(Math.random() * 90) + 10})`;
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
        isGeneratingIncident = false; // Снимаем замок
    }
}

// Запуск раз в минуту
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
