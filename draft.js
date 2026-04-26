// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'
    : 'https://draft-backend-f40v.onrender.com/api';

const SOCKET_URL = isDevelopment 
    ? 'http://localhost:3000'
    : 'https://draft-backend-f40v.onrender.com';

console.log('=== DRAFT PAGE LOADED ===');

// Game state
let MASTER_ITEMS = [];
let itemsWithScores = {};
let availableItems = [];
let playersItems = [];
let draftOrder = [];
let currentPickIndex = 0;
let currentRound = 1;
let numPlayers = 2;
let numRounds = 5;
let timerMinutes = 3;
let totalPicks = 0;
let currentCategory = null;
let currentCategoryName = '';

// Timer
let timerInterval = null;
let timeRemaining = 180;
let TIMER_DURATION = 180;

// Multiplayer
let socket = null;
let isMultiplayer = false;
let isMyTurn = false;
let roomCode = null;
let isHost = false;
let playersData = [];
let myPlayerName = '';

// ==================== CHECK GAME MODE ====================

function checkGameMode() {
    const multiplayerData = localStorage.getItem('multiplayerDraft');
    
    if (multiplayerData) {
        try {
            const data = JSON.parse(multiplayerData);
            isMultiplayer = true;
            isHost = data.isHost;
            roomCode = data.roomCode;
            console.log('✅ Multiplayer mode - isHost:', isHost, 'roomCode:', roomCode);
            return true;
        } catch (e) {
            console.error('Error parsing:', e);
        }
    }
    
    const localConfig = localStorage.getItem('draftConfig');
    if (localConfig) {
        console.log('✅ Local mode detected');
        isMultiplayer = false;
        return true;
    }
    
    return false;
}

function loadDraftConfig() {
    const multiplayerData = localStorage.getItem('multiplayerDraft');
    
    if (multiplayerData) {
        const parsed = JSON.parse(multiplayerData);
        const state = parsed.draftState;
        
        console.log('Loading multiplayer state');
        
        playersData = state.players;
        numPlayers = state.players.length;
        currentCategory = state.category;
        currentCategoryName = state.categoryName;
        numRounds = state.numRounds;
        timerMinutes = Math.floor(state.timerSeconds / 60);
        
        // Find my player name
        if (isHost) {
            myPlayerName = 'Host';
        } else {
            // For joiner, find name from stored data
            const storedName = localStorage.getItem('myPlayerName');
            myPlayerName = storedName || playersData.find(p => p.name !== 'Host')?.name || 'Player';
        }
        
        console.log('My player name:', myPlayerName);
        
        itemsWithScores = {};
        state.itemsWithScores.forEach(item => {
            itemsWithScores[item.item_name] = item.score;
        });
        MASTER_ITEMS = state.itemsWithScores.map(i => i.item_name);
        availableItems = [...state.availableItems];
        playersItems = state.playersItems.map(items => [...items]);
        draftOrder = state.draftOrder;
        currentPickIndex = state.currentPickIndex;
        currentRound = draftOrder[currentPickIndex]?.round || 1;
        totalPicks = numPlayers * numRounds;
        
        TIMER_DURATION = state.timerSeconds;
        timeRemaining = TIMER_DURATION;
        
        document.getElementById('categoryTitle').innerHTML = '📦 ' + currentCategoryName;
        
        const titleElement = document.querySelector('h1');
        if (titleElement) {
            titleElement.innerHTML = isHost ? '👑 HOSTING DRAFT' : '🎮 MULTIPLAYER DRAFT';
        }
        const subElement = document.querySelector('.sub');
        if (subElement) {
            subElement.innerHTML = `Room: ${roomCode} | ${currentCategoryName}`;
        }
        
        renderGame();
        initMultiplayerSocket();
        return true;
    }
    
    // Local game
    const config = localStorage.getItem('draftConfig');
    if (!config) {
        showToast('No draft config found');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return false;
    }
    
    const parsed = JSON.parse(config);
    numPlayers = parsed.numPlayers;
    currentCategory = parsed.category;
    currentCategoryName = parsed.categoryName;
    numRounds = parsed.numRounds;
    timerMinutes = parsed.timerMinutes || 3;
    
    TIMER_DURATION = timerMinutes * 60;
    timeRemaining = TIMER_DURATION;
    
    document.getElementById('categoryTitle').innerHTML = '📦 ' + currentCategoryName;
    
    if (parsed.items) {
        itemsWithScores = {};
        MASTER_ITEMS = [];
        parsed.items.forEach(item => {
            itemsWithScores[item.item_name] = item.score;
            MASTER_ITEMS.push(item.item_name);
        });
        startLocalDraft();
    } else {
        loadItemsForLocal();
    }
    
    return true;
}

// ==================== LOCAL DRAFT ====================

async function loadItemsForLocal() {
    showToast(`Loading ${currentCategoryName}...`);
    try {
        const response = await fetch(`${API_BASE_URL}/items/${currentCategory}/with-scores`);
        const data = await response.json();
        if (data.success) {
            itemsWithScores = {};
            MASTER_ITEMS = [];
            data.items.forEach(item => {
                itemsWithScores[item.item_name] = item.score;
                MASTER_ITEMS.push(item.item_name);
            });
            startLocalDraft();
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error loading items', 3000);
    }
}

function startLocalDraft() {
    availableItems = [...MASTER_ITEMS];
    playersItems = [];
    for (let i = 0; i < numPlayers; i++) playersItems.push([]);
    
    totalPicks = numPlayers * numRounds;
    draftOrder = generateDraftOrder();
    currentPickIndex = 0;
    currentRound = 1;
    
    shuffleArray(availableItems);
    renderGame();
    startTimer();
    showToast(`Local draft started!`);
}

function generateDraftOrder() {
    const order = [];
    for (let round = 1; round <= numRounds; round++) {
        if (round % 2 === 1) {
            for (let i = 0; i < numPlayers; i++) order.push({ playerIndex: i, round: round });
        } else {
            for (let i = numPlayers - 1; i >= 0; i--) order.push({ playerIndex: i, round: round });
        }
    }
    return order;
}

// ==================== MULTIPLAYER SETUP ====================

function initMultiplayerSocket() {
    console.log('🔌 Creating socket connection');
    
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true
    });
    
    socket.on('connect', () => {
        console.log('✅ Socket connected! ID:', socket.id);
        
        // Load stored socket ID from lobby
        const storedSocketId = localStorage.getItem('mySocketId');
        if (storedSocketId && storedSocketId !== socket.id) {
            console.log('📡 Syncing player ID with server...');
            socket.emit('syncPlayerId', {
                roomCode: roomCode,
                oldSocketId: storedSocketId,
                newSocketId: socket.id
            });
        }
        
        // Update stored socket ID
        localStorage.setItem('mySocketId', socket.id);
        
        socket.emit('joinGameRoom', roomCode);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected');
    });
    
    socket.on('draftStarted', (state) => {
        console.log('🎯 DRAFT STARTED!');
        showToast('Draft has started!', 2000);
    });
    
    socket.on('turnChange', (data) => {
        console.log('🔄 TURN CHANGE:', data);
        
        // Compare by player name instead of socket ID
        const currentPlayerName = data.playerName;
        isMyTurn = (currentPlayerName === myPlayerName);
        
        console.log('Current player:', currentPlayerName);
        console.log('My name:', myPlayerName);
        console.log('Is my turn?', isMyTurn);
        
        if (isMyTurn) {
            console.log('✅ IT IS MY TURN!');
            startTimer(data.timeRemaining);
            renderGame();
            showToast('🔥 YOUR TURN! Pick an item! 🔥', 4000);
        } else {
            console.log('⏳ Not my turn');
            stopTimer();
            renderGame();
            showToast(`${data.playerName}'s turn`, 2000);
        }
    });
    
    socket.on('pickMade', (data) => {
        console.log('📦 Pick made:', data);
        applyMultiplayerPick(data);
    });
    
    socket.on('draftComplete', (results) => {
        console.log('🏆 Draft complete!');
        localStorage.setItem('draftResults', JSON.stringify(results));
        showToast('Draft complete!');
        setTimeout(() => window.location.href = 'results.html', 2000);
    });
    
    socket.on('pickError', (error) => {
        console.error('❌ Pick error:', error);
        showToast(error, 2000);
    });
    
    socket.on('startDraftError', (error) => {
        console.error('❌ Start draft error:', error);
        showToast(error, 3000);
    });
}

function applyMultiplayerPick(data) {
    const itemIndex = availableItems.indexOf(data.item);
    if (itemIndex !== -1) availableItems.splice(itemIndex, 1);
    
    let playerIndex = -1;
    for (let i = 0; i < playersData.length; i++) {
        if (playersData[i].name === data.playerName) {
            playerIndex = i;
            break;
        }
    }
    
    if (playerIndex !== -1 && playerIndex < playersItems.length) {
        const score = itemsWithScores[data.item] || 0;
        playersItems[playerIndex].push({ name: data.item, score: score });
    }
    
    currentPickIndex++;
    if (currentPickIndex < draftOrder.length) {
        currentRound = draftOrder[currentPickIndex].round;
    }
    
    renderGame();
}

// ==================== PERFORM DRAFT ====================

function performDraft(item) {
    if (isMultiplayer) {
        if (!isMyTurn) {
            showToast("Not your turn!", 2000);
            return false;
        }
        if (!socket || !socket.connected) {
            showToast("Not connected!", 2000);
            return false;
        }
        console.log('📤 Sending pick:', item);
        socket.emit('makePick', { roomCode: roomCode, itemName: item });
        return true;
    }
    
    // Local game
    if (currentPickIndex >= draftOrder.length) {
        showToast("Draft is complete!");
        return false;
    }
    
    const currentPick = draftOrder[currentPickIndex];
    const playerIndex = currentPick.playerIndex;
    const itemIndex = availableItems.indexOf(item);
    
    if (itemIndex === -1) {
        showToast('❌ "' + item + '" is not available.');
        return false;
    }
    
    stopTimer();
    availableItems.splice(itemIndex, 1);
    const itemScore = itemsWithScores[item] || 0;
    playersItems[playerIndex].push({ name: item, score: itemScore });
    
    showToast('✅ ' + getPlayerName(playerIndex) + ' drafted "' + item + '"');
    currentPickIndex++;
    
    if (currentPickIndex >= draftOrder.length) {
        completeDraft();
    } else {
        currentRound = draftOrder[currentPickIndex].round;
        renderGame();
        startTimer();
    }
    return true;
}

// ==================== TIMER ====================

function startTimer(duration = null) {
    if (timerInterval) clearInterval(timerInterval);
    
    if (duration !== null) {
        timeRemaining = duration;
        TIMER_DURATION = duration;
    } else {
        timeRemaining = TIMER_DURATION;
    }
    
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            updateTimerDisplay();
            if (timeRemaining === 0 && !isMultiplayer) {
                clearInterval(timerInterval);
                timerInterval = null;
                makeRandomPick();
            }
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerDisplayEl = document.getElementById('timerDisplay');
    const timerBarFillEl = document.getElementById('timerBarFill');
    
    if (timerDisplayEl) {
        timerDisplayEl.textContent = timeRemaining <= 0 ? '00:00' : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeRemaining <= 10 && timeRemaining > 0) {
            timerDisplayEl.style.color = '#ef4444';
        } else if (timeRemaining <= 30 && timeRemaining > 0) {
            timerDisplayEl.style.color = '#ef4444';
        } else if (timeRemaining <= 60 && timeRemaining > 0) {
            timerDisplayEl.style.color = '#f97316';
        } else if (timeRemaining > 0) {
            timerDisplayEl.style.color = '#facc15';
        }
    }
    
    if (timerBarFillEl && TIMER_DURATION > 0 && timeRemaining >= 0) {
        timerBarFillEl.style.width = Math.max(0, (timeRemaining / TIMER_DURATION) * 100) + '%';
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function makeRandomPick() {
    if (currentPickIndex >= draftOrder.length) return;
    
    const currentPick = draftOrder[currentPickIndex];
    const playerIndex = currentPick.playerIndex;
    if (availableItems.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * availableItems.length);
    const randomItem = availableItems[randomIndex];
    const itemScore = itemsWithScores[randomItem] || 0;
    
    availableItems.splice(randomIndex, 1);
    playersItems[playerIndex].push({ name: randomItem, score: itemScore });
    
    showToast('⏰ Random pick for ' + getPlayerName(playerIndex), 3000);
    currentPickIndex++;
    
    if (currentPickIndex >= draftOrder.length) {
        completeDraft();
    } else {
        currentRound = draftOrder[currentPickIndex].round;
        renderGame();
        startTimer();
    }
}

function completeDraft() {
    stopTimer();
    const results = playersItems.map((items, index) => ({
        playerIndex: index,
        playerName: getPlayerName(index),
        totalScore: items.reduce((sum, item) => sum + (item.score || 0), 0)
    }));
    results.sort((a, b) => b.totalScore - a.totalScore);
    
    localStorage.setItem('draftResults', JSON.stringify(results));
    localStorage.removeItem('multiplayerDraft');
    window.location.href = 'results.html';
}

// ==================== RENDER ====================

function getCurrentPlayerIndex() {
    if (currentPickIndex >= draftOrder.length) return -1;
    return draftOrder[currentPickIndex].playerIndex;
}

function getPlayerName(playerIndex) {
    if (isMultiplayer && playersData && playersData[playerIndex]) {
        return playersData[playerIndex].name;
    }
    return 'Player ' + (playerIndex + 1);
}

function getPlayerColor(playerIndex) {
    const colors = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#06b6d4', '#ec489a'];
    return colors[playerIndex % colors.length];
}

function getPlayerIcon(playerIndex) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[playerIndex % icons.length];
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function renderGame() {
    const playersContainer = document.getElementById('playersContainer');
    const availableContainer = document.getElementById('availableList');
    const poolCountSpan = document.getElementById('poolCount');
    const activePlayerNameSpan = document.getElementById('activePlayerName');
    const turnMessageSpan = document.getElementById('turnMessage');
    const roundIndicator = document.getElementById('roundIndicator');
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isDraftComplete = currentPickIndex >= draftOrder.length;
    
    if (roundIndicator) {
        roundIndicator.textContent = isDraftComplete 
            ? '🏁 Draft Complete! 🏁'
            : `Round ${currentRound} of ${numRounds} | Pick ${currentPickIndex + 1} of ${totalPicks}`;
    }
    
    if (poolCountSpan) {
        poolCountSpan.innerText = `${availableItems.length} items (${totalPicks - currentPickIndex} picks left)`;
    }
    
    if (availableContainer) {
        if (availableItems.length === 0 || isDraftComplete) {
            availableContainer.innerHTML = '<div class="empty-state">🏁 Draft complete!</div>';
        } else {
            availableContainer.innerHTML = '';
            availableItems.forEach(item => {
                const canDraft = isMultiplayer ? isMyTurn : !isDraftComplete;
                const card = document.createElement('div');
                card.className = 'draft-card';
                card.innerHTML = `
                    <div class="item-info">
                        <span class="item-name">${escapeHtml(item)}</span>
                        <span class="item-score">⭐ ${itemsWithScores[item] || 0}</span>
                    </div>
                    <button class="draft-btn ${canDraft ? 'active-turn' : ''}" ${!canDraft ? 'disabled' : ''}>
                        ${canDraft ? '⚡ Draft' : (isMultiplayer ? '🔒 Locked' : '⚡ Draft')}
                    </button>
                `;
                const btn = card.querySelector('.draft-btn');
                if (canDraft) btn.addEventListener('click', () => performDraft(item));
                availableContainer.appendChild(card);
            });
        }
    }
    
    if (playersContainer) {
        playersContainer.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const isCurrentTurn = (!isDraftComplete && currentPlayerIndex === i);
            const playerName = getPlayerName(i);
            const playerTotalScore = playersItems[i].reduce((sum, item) => sum + (item.score || 0), 0);
            
            const playerCol = document.createElement('div');
            playerCol.className = `player-col ${isCurrentTurn ? 'highlight-turn' : ''}`;
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(i)} ${escapeHtml(playerName)}</div>
                    <div class="player-score">⭐ ${playerTotalScore}</div>
                </div>
                <div class="drafted-list">
                    ${playersItems[i].length === 0 
                        ? '<div class="empty-state">✨ No picks yet</div>'
                        : playersItems[i].map((item, idx) => `
                            <div class="drafted-item">${idx + 1}. ${escapeHtml(item.name)}</div>
                        `).join('')
                    }
                </div>
            `;
            playersContainer.appendChild(playerCol);
        }
    }
    
    if (isDraftComplete) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = "Complete!";
        if (turnMessageSpan) turnMessageSpan.innerText = "🏆 Draft is finished! 🏆";
    } else if (currentPlayerIndex !== -1) {
        const currentPlayerName = getPlayerName(currentPlayerIndex);
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = currentPlayerName;
        if (turnMessageSpan) {
            if (isMultiplayer && isMyTurn) {
                turnMessageSpan.innerHTML = '🎯 YOUR TURN! Click on an item! 🎯';
                turnMessageSpan.style.color = '#facc15';
            } else {
                turnMessageSpan.innerHTML = `${currentPlayerName}'s turn...`;
                turnMessageSpan.style.color = '#94a3b8';
            }
        }
    }
}

// ==================== UTILITY ====================

function newDraft() {
    stopTimer();
    localStorage.removeItem('draftConfig');
    localStorage.removeItem('multiplayerDraft');
    localStorage.removeItem('mySocketId');
    localStorage.removeItem('myPlayerName');
    window.location.href = 'index.html';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
}

let toastTimeout;
function showToast(message, duration = 2200) {
    const toastEl = document.getElementById('toastMsg');
    if (toastTimeout) clearTimeout(toastTimeout);
    if (toastEl) {
        toastEl.innerText = message;
        toastEl.style.opacity = '1';
        toastTimeout = setTimeout(() => toastEl.style.opacity = '0', duration);
    }
    console.log('Toast:', message);
}

function setupEventListeners() {
    const backToStartBtn = document.getElementById('backToStartBtn');
    const resetGameBtn = document.getElementById('resetGameBtn');
    const forceEndTurnBtn = document.getElementById('forceEndTurnBtn');
    
    if (backToStartBtn) backToStartBtn.addEventListener('click', () => newDraft());
    if (resetGameBtn) resetGameBtn.addEventListener('click', () => {
        if (confirm('Reset draft?')) window.location.reload();
    });
    if (forceEndTurnBtn) forceEndTurnBtn.addEventListener('click', () => {
        if (isMultiplayer && !isMyTurn) showToast("Not your turn!", 2000);
        else if (timerInterval) makeRandomPick();
    });
}

function init() {
    console.log('=== INITIALIZING DRAFT PAGE ===');
    if (!checkGameMode()) {
        showToast('No draft config found. Redirecting...');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }
    if (!loadDraftConfig()) return;
    setupEventListeners();
    
    if (isMultiplayer) {
        showToast('Waiting for game to start...', 3000);
    }
}

document.addEventListener('DOMContentLoaded', init);