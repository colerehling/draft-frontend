// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const SOCKET_URL = isDevelopment 
    ? 'http://localhost:3000'
    : 'https://draft-backend-f40v.onrender.com';

console.log('Connecting to Socket.IO at:', SOCKET_URL);

// Load draft data from localStorage
const draftData = JSON.parse(localStorage.getItem('multiplayerDraft'));
console.log('Draft data:', draftData);

if (!draftData) {
    showToast('No draft data found. Redirecting...');
    setTimeout(() => window.location.href = 'index.html', 2000);
}

// Game state variables
let socket = null;
let isMyTurn = false;
let draftState = draftData.draftState;
let isHost = draftData.isHost;
let roomCode = draftData.roomCode;
let timerInterval = null;

// DOM Elements
const playersContainer = document.getElementById('playersContainer');
const availableList = document.getElementById('availableList');
const poolCountSpan = document.getElementById('poolCount');
const activePlayerNameSpan = document.getElementById('activePlayerName');
const turnMessageSpan = document.getElementById('turnMessage');
const timerDisplay = document.getElementById('timerDisplay');
const timerBarFill = document.getElementById('timerBarFill');
const categoryTitle = document.getElementById('categoryTitle');
const connectionStatus = document.getElementById('connectionStatus');
const draftTitle = document.getElementById('draftTitle');
const draftSubtitle = document.getElementById('draftSubtitle');

// Initialize Socket.IO
function initSocket() {
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true
    });
    
    socket.on('connect', () => {
        console.log('Socket connected');
        connectionStatus.innerHTML = '🟢 Connected';
        connectionStatus.style.color = '#10b981';
        
        // Re-join the room
        socket.emit('joinGameRoom', roomCode);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket error:', error);
        connectionStatus.innerHTML = '🔴 Disconnected';
        connectionStatus.style.color = '#ef4444';
    });
    
    socket.on('pickMade', (data) => {
        console.log('Pick made:', data);
        applyPick(data);
    });
    
    socket.on('turnChange', (data) => {
        console.log('Turn change:', data);
        updateTurn(data);
    });
    
    socket.on('draftComplete', (results) => {
        console.log('Draft complete:', results);
        localStorage.setItem('draftResults', JSON.stringify(results));
        showToast('Draft complete! Redirecting to results...');
        setTimeout(() => window.location.href = 'results.html', 2000);
    });
    
    socket.on('timerSync', (timeRemaining) => {
        updateTimerDisplay(timeRemaining);
    });
}

// Make a pick
function makePick(itemName) {
    if (!isMyTurn) {
        showToast("Not your turn!", 2000);
        return;
    }
    
    socket.emit('makePick', {
        roomCode: roomCode,
        itemName: itemName
    });
}

// Apply pick to UI
function applyPick(data) {
    // Remove from available items
    const index = draftState.availableItems.indexOf(data.item);
    if (index !== -1) {
        draftState.availableItems.splice(index, 1);
    }
    
    // Add to player's items
    const playerIndex = draftState.players.findIndex(p => p.id === data.playerId);
    if (playerIndex !== -1) {
        const score = draftState.itemsWithScores.find(i => i.item_name === data.item)?.score || 0;
        draftState.playersItems[playerIndex].push({
            name: data.item,
            score: score
        });
    }
    
    // Update UI
    renderGame();
}

// Update turn
function updateTurn(data) {
    isMyTurn = (socket && socket.id === data.playerId);
    draftState.currentPlayer = { id: data.playerId, name: data.playerName };
    
    renderGame();
    
    if (isMyTurn) {
        showToast(`Your turn! You have ${Math.floor(data.timeRemaining / 60)}:${(data.timeRemaining % 60).toString().padStart(2, '0')}`, 3000);
        startTimer(data.timeRemaining);
    } else {
        stopTimer();
        showToast(`${data.playerName}'s turn`, 2000);
    }
}

// Timer functions
function startTimer(duration) {
    stopTimer();
    let timeLeft = duration;
    updateTimerDisplay(timeLeft);
    
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(timeLeft);
        
        if (timeLeft <= 0) {
            stopTimer();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay(seconds) {
    if (!timerDisplay) return;
    
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    if (timerBarFill) {
        const totalTime = draftState.timerSeconds || 180;
        const percentage = (seconds / totalTime) * 100;
        timerBarFill.style.width = `${percentage}%`;
    }
    
    if (seconds <= 30) {
        timerDisplay.style.color = '#ef4444';
    } else if (seconds <= 60) {
        timerDisplay.style.color = '#f97316';
    } else {
        timerDisplay.style.color = '#facc15';
    }
}

// Render game UI
function renderGame() {
    categoryTitle.innerHTML = `📦 ${draftState.categoryName || draftState.category}`;
    poolCountSpan.innerText = `${draftState.availableItems.length} items left`;
    
    // Render players
    if (playersContainer) {
        playersContainer.innerHTML = '';
        
        draftState.players.forEach((player, index) => {
            const playerCol = document.createElement('div');
            playerCol.className = 'player-col';
            const isCurrent = isMyTurn && draftState.currentPlayer?.id === player.id;
            if (isCurrent) playerCol.classList.add('highlight-turn');
            
            const playerTotalScore = draftState.playersItems[index].reduce((sum, item) => sum + item.score, 0);
            
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(index)} ${player.name}</div>
                    <div class="player-score">⭐ ${playerTotalScore}</div>
                </div>
                <div class="drafted-list">
                    ${draftState.playersItems[index].map((item, idx) => `
                        <div class="drafted-item">${idx + 1}. ${escapeHtml(item.name)}</div>
                    `).join('') || '<div class="empty-state">✨ No picks yet</div>'}
                </div>
            `;
            
            playersContainer.appendChild(playerCol);
        });
    }
    
    // Render available items
    if (availableList) {
        if (draftState.availableItems.length === 0) {
            availableList.innerHTML = '<div class="empty-state">🏁 Draft complete!</div>';
        } else {
            availableList.innerHTML = '';
            draftState.availableItems.forEach(item => {
                const card = document.createElement('div');
                card.className = 'draft-card';
                card.innerHTML = `
                    <div class="item-info">
                        <span class="item-name">${escapeHtml(item)}</span>
                    </div>
                    <button class="draft-btn ${isMyTurn ? 'active-turn' : ''}" ${!isMyTurn ? 'disabled' : ''}>
                        ${isMyTurn ? '⚡ Draft' : '🔒 Locked'}
                    </button>
                `;
                
                const btn = card.querySelector('.draft-btn');
                if (isMyTurn) {
                    btn.addEventListener('click', () => makePick(item));
                }
                
                availableList.appendChild(card);
            });
        }
    }
    
    // Update turn message
    if (activePlayerNameSpan) {
        activePlayerNameSpan.innerText = draftState.currentPlayer?.name || 'Waiting...';
    }
    if (turnMessageSpan) {
        turnMessageSpan.innerText = isMyTurn ? "Your turn to draft!" : `${draftState.currentPlayer?.name}'s turn`;
    }
}

function getPlayerIcon(index) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[index % icons.length];
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, (m) => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function showToast(message, duration = 2200) {
    const toastEl = document.getElementById('toastMsg');
    if (toastEl) {
        toastEl.innerText = message;
        toastEl.style.opacity = '1';
        setTimeout(() => {
            toastEl.style.opacity = '0';
        }, duration);
    }
}

// Initialize
function init() {
    if (!draftState) return;
    
    draftTitle.innerHTML = isHost ? '👑 HOSTING DRAFT' : '🎮 MULTIPLAYER DRAFT';
    draftSubtitle.innerHTML = `Room: ${roomCode} | ${draftState.categoryName || draftState.category}`;
    
    renderGame();
    initSocket();
}

document.addEventListener('DOMContentLoaded', init);