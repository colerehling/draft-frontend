// Determine if we're in development or production
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

// Use localhost for development, Render URL for production
const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'
    : 'https://draft-backend-f40v.onrender.com/api';

// Socket.IO URL for multiplayer
const SOCKET_URL = isDevelopment 
    ? 'http://localhost:3000'
    : 'https://draft-backend-f40v.onrender.com';

console.log(`API running in ${isDevelopment ? 'development' : 'production'} mode`);
console.log(`API URL: ${API_BASE_URL}`);

// Game state variables
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
let draftType = 'snake';

// Timer variables
let timerInterval = null;
let timeRemaining = 180;
let TIMER_DURATION = 180;

// Multiplayer variables
let socket = null;
let isMultiplayer = false;
let isMyTurn = false;
let roomCode = null;
let isHost = false;
let draftState = null;  // Store the draft state for multiplayer

// ==================== CHECK GAME MODE ====================

function checkGameMode() {
    const multiplayerData = localStorage.getItem('multiplayerDraft');
    if (multiplayerData) {
        try {
            const data = JSON.parse(multiplayerData);
            isMultiplayer = true;
            isHost = data.isHost;
            roomCode = data.roomCode;
            draftState = data.draftState;
            console.log('Multiplayer mode detected - isHost:', isHost, 'roomCode:', roomCode);
            console.log('Players in draftState:', draftState?.players);
            return true;
        } catch (e) {
            console.error('Error parsing multiplayer data:', e);
        }
    }
    
    const localConfig = localStorage.getItem('draftConfig');
    if (localConfig) {
        console.log('Local mode detected');
        isMultiplayer = false;
        return true;
    }
    
    return false;
}

// Get player name - CRITICAL FIX: Use multiplayer names
function getPlayerName(playerIndex) {
    if (isMultiplayer && draftState && draftState.players) {
        const player = draftState.players[playerIndex];
        if (player && player.name) {
            return player.name;
        }
    }
    return 'Player ' + (playerIndex + 1);
}

// Get current player name
function getCurrentPlayerName() {
    const currentPlayerIndex = getCurrentPlayerIndex();
    if (currentPlayerIndex === -1) return 'Unknown';
    return getPlayerName(currentPlayerIndex);
}

function loadDraftConfig() {
    const multiplayerData = localStorage.getItem('multiplayerDraft');
    if (multiplayerData) {
        const parsed = JSON.parse(multiplayerData);
        console.log('Loading multiplayer draft config:', parsed);
        
        draftState = parsed.draftState;
        numPlayers = draftState.players.length;
        currentCategory = draftState.category;
        currentCategoryName = draftState.categoryName;
        numRounds = draftState.numRounds;
        timerMinutes = Math.floor(draftState.timerSeconds / 60);
        
        itemsWithScores = {};
        draftState.itemsWithScores.forEach(item => {
            itemsWithScores[item.item_name] = item.score;
        });
        MASTER_ITEMS = draftState.itemsWithScores.map(i => i.item_name);
        availableItems = [...draftState.availableItems];
        playersItems = draftState.playersItems.map(items => [...items]);
        draftOrder = draftState.draftOrder;
        currentPickIndex = draftState.currentPickIndex;
        currentRound = draftOrder[currentPickIndex]?.round || 1;
        totalPicks = numPlayers * numRounds;
        
        TIMER_DURATION = draftState.timerSeconds;
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
    
    const config = localStorage.getItem('draftConfig');
    if (!config) {
        showToast('No draft configuration found. Redirecting...');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return false;
    }
    
    const parsed = JSON.parse(config);
    console.log('Loading local draft config:', parsed);
    
    numPlayers = parsed.numPlayers;
    currentCategory = parsed.category;
    currentCategoryName = parsed.categoryName;
    numRounds = parsed.numRounds;
    timerMinutes = parsed.timerMinutes || 3;
    draftType = parsed.draftType || 'snake';
    
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

// ==================== MULTIPLAYER FUNCTIONS ====================

function initMultiplayerSocket() {
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true
    });
    
    socket.on('connect', () => {
        console.log('Socket connected, ID:', socket.id);
        socket.emit('joinGameRoom', roomCode);
    });
    
    socket.on('turnChange', (data) => {
        console.log('Turn change received:', data);
        console.log('My socket ID:', socket.id);
        console.log('Current player ID:', data.playerId);
        
        isMyTurn = (socket.id === data.playerId);
        console.log('Is my turn?', isMyTurn);
        
        if (isMyTurn) {
            startTimer(data.timeRemaining);
            renderGame();
            showToast(`YOUR TURN!`, 3000);
        } else {
            stopTimer();
            renderGame();
            showToast(`${data.playerName}'s turn`, 2000);
        }
    });
    
    socket.on('pickMade', (data) => {
        console.log('Pick made:', data);
        applyMultiplayerPick(data);
    });
    
    socket.on('draftComplete', (results) => {
        localStorage.setItem('draftResults', JSON.stringify(results));
        showToast('Draft complete!');
        setTimeout(() => window.location.href = 'results.html', 2000);
    });
    
    socket.on('pickError', (error) => {
        showToast(error, 2000);
    });
}

function applyMultiplayerPick(data) {
    const itemIndex = availableItems.indexOf(data.item);
    if (itemIndex !== -1) {
        availableItems.splice(itemIndex, 1);
    }
    
    let playerIndex = -1;
    if (currentPickIndex < draftOrder.length) {
        playerIndex = draftOrder[currentPickIndex].playerIndex;
    }
    
    if (playerIndex !== -1 && playerIndex < playersItems.length) {
        const score = itemsWithScores[data.item] || 0;
        playersItems[playerIndex].push({
            name: data.item,
            score: score
        });
    }
    
    currentPickIndex++;
    if (currentPickIndex < draftOrder.length) {
        currentRound = draftOrder[currentPickIndex].round;
    }
    
    renderGame();
}

// ==================== LOCAL DRAFT FUNCTIONS ====================

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
        console.error('Error loading items:', error);
        showToast('Error loading category items', 3000);
    }
}

function generateDraftOrder() {
    const order = [];
    for (let round = 1; round <= numRounds; round++) {
        if (draftType === 'regular') {
            for (let i = 0; i < numPlayers; i++) {
                order.push({ playerIndex: i, round: round });
            }
        } else {
            if (round % 2 === 1) {
                for (let i = 0; i < numPlayers; i++) {
                    order.push({ playerIndex: i, round: round });
                }
            } else {
                for (let i = numPlayers - 1; i >= 0; i--) {
                    order.push({ playerIndex: i, round: round });
                }
            }
        }
    }
    return order;
}

function startLocalDraft() {
    availableItems = [...MASTER_ITEMS];
    playersItems = [];
    for (let i = 0; i < numPlayers; i++) {
        playersItems.push([]);
    }
    
    totalPicks = numPlayers * numRounds;
    draftOrder = generateDraftOrder();
    currentPickIndex = 0;
    currentRound = 1;
    
    shuffleArray(availableItems);
    renderGame();
    startTimer();
    showToast(`Local draft started! ${numPlayers} players, ${numRounds} rounds.`);
}

// ==================== CORE DRAFT FUNCTIONS ====================

function performDraft(item) {
    if (isMultiplayer) {
        if (!isMyTurn) {
            showToast("Not your turn!", 2000);
            return false;
        }
        if (!socket) {
            showToast("Not connected!", 2000);
            return false;
        }
        socket.emit('makePick', { roomCode: roomCode, itemName: item });
        return true;
    }
    
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

function startTimer(duration = null) {
    if (timerInterval) clearInterval(timerInterval);
    
    if (duration !== null) {
        timeRemaining = duration;
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
        timerDisplayEl.textContent = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
        
        if (timeRemaining <= 10 && timeRemaining > 0) {
            timerDisplayEl.style.color = '#ef4444';
            timerDisplayEl.style.animation = 'pulse 1s infinite';
        } else if (timeRemaining <= 30 && timeRemaining > 0) {
            timerDisplayEl.style.color = '#ef4444';
        } else if (timeRemaining <= 60 && timeRemaining > 0) {
            timerDisplayEl.style.color = '#f97316';
        } else if (timeRemaining > 0) {
            timerDisplayEl.style.color = '#facc15';
            timerDisplayEl.style.animation = 'none';
        }
    }
    
    if (timerBarFillEl && TIMER_DURATION > 0) {
        const percentage = Math.max(0, (timeRemaining / TIMER_DURATION) * 100);
        timerBarFillEl.style.width = percentage + '%';
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
    
    showToast('⏰ Random pick for ' + getPlayerName(playerIndex) + ': "' + randomItem + '"', 3000);
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
    
    let currentPlace = 1;
    let previousScore = null;
    results.forEach((player, index) => {
        if (previousScore !== null && player.totalScore < previousScore) {
            currentPlace = index + 1;
        }
        player.place = currentPlace;
        previousScore = player.totalScore;
    });
    
    localStorage.setItem('draftResults', JSON.stringify(results));
    localStorage.removeItem('multiplayerDraft');
    window.location.href = 'results.html';
}

// ==================== RENDER FUNCTIONS ====================

function getCurrentPlayerIndex() {
    if (currentPickIndex >= draftOrder.length) return -1;
    return draftOrder[currentPickIndex].playerIndex;
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
    
    // Update round indicator
    if (roundIndicator) {
        roundIndicator.textContent = isDraftComplete 
            ? '🏁 Draft Complete! 🏁'
            : `Round ${currentRound} of ${numRounds} | Pick ${currentPickIndex + 1} of ${totalPicks}`;
    }
    
    // Update pool count
    if (poolCountSpan) {
        poolCountSpan.innerText = `${availableItems.length} items (${totalPicks - currentPickIndex} picks left)`;
    }
    
    // Render available items
    if (availableContainer) {
        if (availableItems.length === 0 || isDraftComplete) {
            availableContainer.innerHTML = '<div class="empty-state">🏁 Draft complete! Redirecting to results...</div>';
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
                if (canDraft) {
                    btn.addEventListener('click', () => performDraft(item));
                }
                availableContainer.appendChild(card);
            });
        }
    }
    
    // Render players
    if (playersContainer) {
        playersContainer.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const isCurrentTurn = (!isDraftComplete && currentPlayerIndex === i);
            const playerName = getPlayerName(i);
            const playerTotalScore = playersItems[i].reduce((sum, item) => sum + (item.score || 0), 0);
            
            const playerCol = document.createElement('div');
            playerCol.className = `player-col ${isCurrentTurn ? 'highlight-turn' : ''}`;
            playerCol.id = `player${i + 1}Col`;
            
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(i)} ${escapeHtml(playerName)}</div>
                    <div class="player-score">⭐ ${playerTotalScore}</div>
                </div>
                <div class="drafted-list">
                    ${playersItems[i].length === 0 
                        ? '<div class="empty-state">✨ Waiting for picks...</div>'
                        : playersItems[i].map((item, idx) => `
                            <div class="drafted-item">${idx + 1}. ${escapeHtml(item.name)} <span class="item-score-small">⭐${item.score || 0}</span></div>
                        `).join('')
                    }
                </div>
            `;
            playersContainer.appendChild(playerCol);
        }
    }
    
    // Update turn message with actual names
    if (isDraftComplete) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = "Complete!";
        if (turnMessageSpan) turnMessageSpan.innerText = "🏆 Draft is finished! 🏆";
    } else if (currentPlayerIndex !== -1) {
        const currentPlayerName = getPlayerName(currentPlayerIndex);
        const picksLeft = numRounds - playersItems[currentPlayerIndex].length;
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = currentPlayerName;
        if (turnMessageSpan) turnMessageSpan.innerText = `${currentPlayerName}'s turn to draft (${picksLeft} of ${numRounds} picks remaining)`;
    }
}

// ==================== UTILITY FUNCTIONS ====================

function forceSkipTurn() {
    if (currentPickIndex >= draftOrder.length) {
        showToast("Draft is complete!");
        return;
    }
    if (isMultiplayer && !isMyTurn) {
        showToast("Not your turn!", 2000);
        return;
    }
    stopTimer();
    makeRandomPick();
}

function resetDraft() {
    if (confirm('Reset the current draft? All progress will be lost.')) {
        stopTimer();
        if (isMultiplayer) {
            window.location.reload();
        } else {
            startLocalDraft();
        }
    }
}

function newDraft() {
    stopTimer();
    localStorage.removeItem('draftConfig');
    localStorage.removeItem('multiplayerDraft');
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
    if (resetGameBtn) resetGameBtn.addEventListener('click', () => resetDraft());
    if (forceEndTurnBtn) forceEndTurnBtn.addEventListener('click', () => forceSkipTurn());
}

// ==================== INITIALIZATION ====================

function init() {
    console.log('Initializing draft page');
    if (!checkGameMode()) {
        showToast('No draft configuration found. Redirecting...');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }
    if (!loadDraftConfig()) return;
    setupEventListeners();
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', init);