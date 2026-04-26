// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const SOCKET_URL = isDevelopment 
    ? 'http://localhost:3000'
    : 'https://draft-backend-f40v.onrender.com';

console.log('Connecting to Socket.IO at:', SOCKET_URL);

// Load draft data from localStorage
const draftData = JSON.parse(localStorage.getItem('multiplayerDraft'));
console.log('Draft data loaded:', draftData);

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
let timeRemaining = 0;

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
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    socket.on('connect', () => {
        console.log('Socket connected, ID:', socket.id);
        connectionStatus.innerHTML = '🟢 Connected';
        connectionStatus.style.color = '#10b981';
        
        // Re-join the room
        socket.emit('joinGameRoom', roomCode);
        console.log('Joined game room:', roomCode);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket error:', error);
        connectionStatus.innerHTML = '🔴 Disconnected';
        connectionStatus.style.color = '#ef4444';
        showToast('Connection lost! Trying to reconnect...', 3000);
    });
    
    socket.on('pickMade', (data) => {
        console.log('Pick made received:', data);
        applyPick(data);
    });
    
    socket.on('turnChange', (data) => {
        console.log('Turn change received:', data);
        console.log('My socket ID:', socket.id);
        console.log('Current player ID:', data.playerId);
        
        isMyTurn = (socket.id === data.playerId);
        console.log('Is my turn?', isMyTurn);
        
        draftState.currentPlayer = { id: data.playerId, name: data.playerName };
        
        renderGame();
        
        if (isMyTurn) {
            const minutes = Math.floor(data.timeRemaining / 60);
            const seconds = data.timeRemaining % 60;
            showToast(`YOUR TURN! You have ${minutes}:${seconds.toString().padStart(2, '0')} to pick`, 5000);
            startTimer(data.timeRemaining);
        } else {
            stopTimer();
            showToast(`${data.playerName}'s turn`, 2000);
        }
    });
    
    socket.on('draftComplete', (results) => {
        console.log('Draft complete:', results);
        localStorage.setItem('draftResults', JSON.stringify(results));
        showToast('Draft complete! Redirecting to results...');
        setTimeout(() => window.location.href = 'results.html', 2000);
    });
    
    socket.on('pickError', (error) => {
        console.error('Pick error:', error);
        showToast(error, 2000);
    });
    
    socket.on('draftStarted', (state) => {
        console.log('Draft started event received:', state);
        draftState = state;
        renderGame();
        showToast('Draft has started!', 2000);
    });
}

// Apply pick to UI
function applyPick(data) {
    console.log('Applying pick:', data);
    
    // Remove from available items
    const index = draftState.availableItems.indexOf(data.item);
    if (index !== -1) {
        draftState.availableItems.splice(index, 1);
    }
    
    // Add to player's items
    const playerIndex = draftState.players.findIndex(p => p.id === data.playerId);
    if (playerIndex !== -1) {
        const scoreItem = draftState.itemsWithScores.find(i => i.item_name === data.item);
        const score = scoreItem ? scoreItem.score : 0;
        draftState.playersItems[playerIndex].push({
            name: data.item,
            score: score
        });
    }
    
    // Update UI
    renderGame();
}

// Timer functions
function startTimer(duration) {
    stopTimer();
    timeRemaining = duration;
    updateTimerDisplay(timeRemaining);
    
    timerInterval = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            updateTimerDisplay(timeRemaining);
            
            if (timeRemaining <= 0) {
                stopTimer();
            }
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
    
    const totalTime = draftState.timerSeconds || 180;
    const percentage = Math.max(0, (seconds / totalTime) * 100);
    
    if (timerBarFill) {
        timerBarFill.style.width = `${percentage}%`;
    }
    
    if (seconds <= 10) {
        timerDisplay.style.color = '#ef4444';
    } else if (seconds <= 30) {
        timerDisplay.style.color = '#f97316';
    } else {
        timerDisplay.style.color = '#facc15';
    }
}

// Make a pick
function makePick(itemName) {
    console.log('makePick called. isMyTurn:', isMyTurn, 'item:', itemName);
    
    if (!isMyTurn) {
        showToast("Not your turn!", 2000);
        return;
    }
    
    if (!socket) {
        showToast("Not connected to server!", 2000);
        return;
    }
    
    console.log('Emitting makePick for item:', itemName);
    socket.emit('makePick', {
        roomCode: roomCode,
        itemName: itemName
    });
}

// Render game UI
function renderGame() {
    if (!draftState) return;
    
    console.log('Rendering game, isMyTurn:', isMyTurn);
    
    categoryTitle.innerHTML = `📦 ${draftState.categoryName || draftState.category}`;
    
    // Render players
    if (playersContainer) {
        playersContainer.innerHTML = '';
        
        draftState.players.forEach((player, index) => {
            const playerCol = document.createElement('div');
            playerCol.className = 'player-col';
            const isCurrent = draftState.currentPlayer?.id === player.id;
            if (isCurrent) playerCol.classList.add('highlight-turn');
            
            const playerTotalScore = draftState.playersItems[index].reduce((sum, item) => sum + (item.score || 0), 0);
            
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(index)} ${escapeHtml(player.name)}</div>
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
    
    // Update pool count
    if (poolCountSpan) {
        const picksLeft = draftState.draftOrder.length - draftState.currentPickIndex;
        poolCountSpan.innerText = `${draftState.availableItems.length} items (${picksLeft} picks left)`;
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
                
                const scoreItem = draftState.itemsWithScores.find(i => i.item_name === item);
                const score = scoreItem ? scoreItem.score : 0;
                
                card.innerHTML = `
                    <div class="item-info">
                        <span class="item-name">${escapeHtml(item)}</span>
                        <span class="item-score">⭐ ${score}</span>
                    </div>
                    <button class="draft-btn ${isMyTurn ? 'active-turn' : ''}" ${!isMyTurn ? 'disabled' : ''}>
                        ${isMyTurn ? '⚡ Draft' : '🔒 Locked'}
                    </button>
                `;
                
                const btn = card.querySelector('.draft-btn');
                if (isMyTurn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        console.log('Draft button clicked for:', item);
                        makePick(item);
                    });
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
        if (isMyTurn) {
            turnMessageSpan.innerHTML = '🎯 YOUR TURN TO DRAFT! Click on an item above! 🎯';
            turnMessageSpan.style.color = '#facc15';
            turnMessageSpan.style.fontWeight = 'bold';
        } else {
            turnMessageSpan.innerHTML = `${draftState.currentPlayer?.name}'s turn to draft...`;
            turnMessageSpan.style.color = '#94a3b8';
            turnMessageSpan.style.fontWeight = 'normal';
        }
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
    console.log('Toast:', message);
}

// Initialize
function init() {
    if (!draftState) {
        console.error('No draft state found');
        return;
    }
    
    console.log('Initializing multiplayer draft page');
    console.log('Is host:', isHost);
    console.log('Room code:', roomCode);
    
    draftTitle.innerHTML = isHost ? '👑 HOSTING DRAFT' : '🎮 MULTIPLAYER DRAFT';
    draftSubtitle.innerHTML = `Room: ${roomCode} | ${draftState.categoryName || draftState.category}`;
    
    renderGame();
    initSocket();
}

document.addEventListener('DOMContentLoaded', init);