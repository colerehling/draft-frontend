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

// Check if this is a multiplayer draft
function isMultiplayerGame() {
    const multiplayerData = localStorage.getItem('multiplayerDraft');
    if (multiplayerData) {
        const data = JSON.parse(multiplayerData);
        isMultiplayer = true;
        isHost = data.isHost;
        roomCode = data.roomCode;
        return true;
    }
    return false;
}

// Load draft configuration from localStorage
function loadDraftConfig() {
    // First check for multiplayer draft
    const multiplayerData = localStorage.getItem('multiplayerDraft');
    if (multiplayerData) {
        const parsed = JSON.parse(multiplayerData);
        console.log('Loading multiplayer draft config:', parsed);
        
        numPlayers = parsed.draftState.players.length;
        currentCategory = parsed.draftState.category;
        currentCategoryName = parsed.draftState.categoryName;
        numRounds = parsed.draftState.numRounds;
        timerMinutes = Math.floor(parsed.draftState.timerSeconds / 60);
        
        // Load draft state from multiplayer data
        itemsWithScores = {};
        parsed.draftState.itemsWithScores.forEach(item => {
            itemsWithScores[item.item_name] = item.score;
        });
        MASTER_ITEMS = parsed.draftState.itemsWithScores.map(i => i.item_name);
        availableItems = [...parsed.draftState.availableItems];
        playersItems = parsed.draftState.playersItems.map(items => [...items]);
        draftOrder = parsed.draftState.draftOrder;
        currentPickIndex = parsed.draftState.currentPickIndex;
        currentRound = draftOrder[currentPickIndex]?.round || 1;
        totalPicks = numPlayers * numRounds;
        
        TIMER_DURATION = parsed.draftState.timerSeconds;
        timeRemaining = TIMER_DURATION;
        
        return true;
    }
    
    // Local game config
    const config = localStorage.getItem('draftConfig');
    if (!config) {
        showToast('No draft configuration found. Redirecting to setup...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return false;
    }
    
    const parsed = JSON.parse(config);
    numPlayers = parsed.numPlayers;
    currentCategory = parsed.category;
    currentCategoryName = parsed.categoryName;
    numRounds = parsed.numRounds;
    timerMinutes = parsed.timerMinutes || 3;
    draftType = parsed.draftType || 'snake';
    
    // Load items from config if present (for local games)
    if (parsed.items) {
        itemsWithScores = {};
        MASTER_ITEMS = [];
        parsed.items.forEach(item => {
            const scoreValue = typeof item.score === 'string' ? parseFloat(item.score) : item.score;
            itemsWithScores[item.item_name] = scoreValue;
            MASTER_ITEMS.push(item.item_name);
        });
        startDraft();
    } else {
        loadItems();
    }
    
    TIMER_DURATION = timerMinutes * 60;
    timeRemaining = TIMER_DURATION;
    
    return true;
}

// Load items for the selected category (local game only)
async function loadItems() {
    showToast(`Loading ${currentCategoryName}...`);
    
    try {
        const response = await fetch(`${API_BASE_URL}/items/${currentCategory}/with-scores`);
        const data = await response.json();
        
        if (data.success) {
            itemsWithScores = {};
            MASTER_ITEMS = [];
            data.items.forEach(item => {
                const scoreValue = typeof item.score === 'string' ? parseFloat(item.score) : item.score;
                itemsWithScores[item.item_name] = scoreValue;
                MASTER_ITEMS.push(item.item_name);
            });
            
            startDraft();
        }
    } catch (error) {
        console.error('Error loading items:', error);
        showToast('Error loading category items', 3000);
    }
}

// Generate draft order based on type
function generateDraftOrder() {
    const order = [];
    
    if (draftType === 'regular') {
        for (let round = 1; round <= numRounds; round++) {
            for (let i = 0; i < numPlayers; i++) {
                order.push({ playerIndex: i, round: round });
            }
        }
    } else {
        for (let round = 1; round <= numRounds; round++) {
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

// Start the draft
function startDraft() {
    if (!isMultiplayer) {
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
    }
    
    renderGame();
    
    document.getElementById('categoryTitle').innerHTML = '📦 ' + currentCategoryName;
    
    if (isMultiplayer) {
        const draftTypeName = isHost ? '👑 Hosting' : '🎮 Playing';
        showToast(`${draftTypeName} multiplayer draft! ${numPlayers} players, ${numRounds} rounds.`, 3000);
        initMultiplayerSocket();
    } else {
        const draftTypeName = draftType === 'snake' ? '🐍 Snake' : '📋 Regular';
        showToast(`${draftTypeName} draft started! ${numPlayers} players, ${numRounds} rounds. ${timerMinutes} minutes per pick. Player 1 picks first!`);
        startTimer();
    }
}

// Initialize multiplayer socket connection
function initMultiplayerSocket() {
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true
    });
    
    socket.on('connect', () => {
        console.log('Socket connected for multiplayer draft');
        socket.emit('joinGameRoom', roomCode);
    });
    
    socket.on('pickMade', (data) => {
        console.log('Pick made by other player:', data);
        applyMultiplayerPick(data);
    });
    
    socket.on('turnChange', (data) => {
        console.log('Turn change received:', data);
        console.log('My socket ID:', socket.id);
        console.log('Current player ID:', data.playerId);
        
        isMyTurn = (socket.id === data.playerId);
        
        if (isMyTurn) {
            startTimer(data.timeRemaining);
            renderGame();
            showToast(`YOUR TURN! You have ${Math.floor(data.timeRemaining / 60)}:${(data.timeRemaining % 60).toString().padStart(2, '0')} to pick`, 3000);
        } else {
            stopTimer();
            renderGame();
            showToast(`${data.playerName}'s turn`, 2000);
        }
    });
    
    socket.on('draftComplete', (results) => {
        localStorage.setItem('draftResults', JSON.stringify(results));
        showToast('Draft complete! Redirecting to results...');
        setTimeout(() => window.location.href = 'results.html', 2000);
    });
    
    socket.on('pickError', (error) => {
        showToast(error, 2000);
    });
}

// Apply pick from multiplayer
function applyMultiplayerPick(data) {
    // Remove from available items
    const index = availableItems.indexOf(data.item);
    if (index !== -1) {
        availableItems.splice(index, 1);
    }
    
    // Add to player's items
    const playerIndex = draftOrder[currentPickIndex]?.playerIndex;
    if (playerIndex !== undefined) {
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

// Make a pick (handles both local and multiplayer)
function performDraft(item) {
    if (isMultiplayer) {
        if (!isMyTurn) {
            showToast("Not your turn!", 2000);
            return false;
        }
        
        if (!socket) {
            showToast("Not connected to server!", 2000);
            return false;
        }
        
        console.log('Sending multiplayer pick:', item);
        socket.emit('makePick', {
            roomCode: roomCode,
            itemName: item
        });
        return true;
    }
    
    // Local game pick logic
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
    let itemScore = itemsWithScores[item] || 0;
    itemScore = typeof itemScore === 'string' ? parseFloat(itemScore) : itemScore;
    
    playersItems[playerIndex].push({
        name: item,
        score: itemScore
    });
    
    showToast('✅ ' + getPlayerName(playerIndex) + ' drafted "' + item + '"');
    
    currentPickIndex++;
    
    if (currentPickIndex >= draftOrder.length) {
        completeDraft();
    } else {
        const nextPick = draftOrder[currentPickIndex];
        currentRound = nextPick.round;
        renderGame();
        startTimer();
    }
    
    return true;
}

// Timer functions
function startTimer(duration = null) {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
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
            
            const playerCol = document.getElementById('player' + (getCurrentPlayerIndex() + 1) + 'Col');
            if (playerCol) {
                if (timeRemaining <= 30) {
                    playerCol.classList.add('timer-critical');
                    playerCol.classList.remove('timer-warning');
                } else if (timeRemaining <= 60) {
                    playerCol.classList.add('timer-warning');
                    playerCol.classList.remove('timer-critical');
                } else {
                    playerCol.classList.remove('timer-warning', 'timer-critical');
                }
            }
            
            if (timeRemaining === 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                if (!isMultiplayer) {
                    makeRandomPick();
                }
            }
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerDisplay = document.getElementById('timerDisplay');
    const timerBarFill = document.getElementById('timerBarFill');
    
    if (timerDisplay) {
        timerDisplay.textContent = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
        
        if (timeRemaining <= 30) {
            timerDisplay.style.color = '#ef4444';
            if (timerBarFill) {
                timerBarFill.classList.add('critical');
                timerBarFill.classList.remove('warning');
            }
        } else if (timeRemaining <= 60) {
            timerDisplay.style.color = '#f97316';
            if (timerBarFill) {
                timerBarFill.classList.add('warning');
                timerBarFill.classList.remove('critical');
            }
        } else {
            timerDisplay.style.color = '#facc15';
            if (timerBarFill) {
                timerBarFill.classList.remove('warning', 'critical');
            }
        }
    }
    
    if (timerBarFill) {
        const percentage = (timeRemaining / TIMER_DURATION) * 100;
        timerBarFill.style.width = percentage + '%';
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function makeRandomPick() {
    if (currentPickIndex >= draftOrder.length) {
        return;
    }
    
    const currentPick = draftOrder[currentPickIndex];
    const playerIndex = currentPick.playerIndex;
    
    if (availableItems.length === 0) {
        showToast("No items left to draft!");
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * availableItems.length);
    const randomItem = availableItems[randomIndex];
    let itemScore = itemsWithScores[randomItem] || 0;
    itemScore = typeof itemScore === 'string' ? parseFloat(itemScore) : itemScore;
    
    availableItems.splice(randomIndex, 1);
    playersItems[playerIndex].push({
        name: randomItem,
        score: itemScore
    });
    
    showToast('⏰ Time\'s up! Random pick for ' + getPlayerName(playerIndex) + ': "' + randomItem + '"', 3000);
    
    currentPickIndex++;
    
    if (currentPickIndex >= draftOrder.length) {
        completeDraft();
    } else {
        const nextPick = draftOrder[currentPickIndex];
        currentRound = nextPick.round;
        renderGame();
        startTimer();
    }
}

function completeDraft() {
    stopTimer();
    
    const results = playersItems.map((items, index) => {
        let totalScore = 0;
        for (let i = 0; i < items.length; i++) {
            const score = typeof items[i].score === 'number' ? items[i].score : parseFloat(items[i].score);
            totalScore += isNaN(score) ? 0 : score;
        }
        
        return {
            playerIndex: index,
            playerName: getPlayerName(index),
            totalScore: totalScore
        };
    });
    
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
    window.location.href = 'results.html';
}

// Helper functions
function getCurrentPlayerIndex() {
    if (currentPickIndex >= draftOrder.length) return -1;
    return draftOrder[currentPickIndex].playerIndex;
}

function getPlayerName(playerIndex) {
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
        if (!isDraftComplete) {
            roundIndicator.textContent = 'Round ' + currentRound + ' of ' + numRounds + ' | Pick ' + (currentPickIndex + 1) + ' of ' + totalPicks;
        } else {
            roundIndicator.textContent = '🏁 Draft Complete! 🏁';
        }
    }
    
    if (poolCountSpan) {
        poolCountSpan.innerText = availableItems.length + ' items (' + (totalPicks - currentPickIndex) + ' picks left)';
    }
    
    if (availableItems.length === 0 || isDraftComplete) {
        availableContainer.innerHTML = '<div class="empty-state">🏁 Draft complete! Redirecting to results...</div>';
    } else {
        availableContainer.innerHTML = '';
        availableItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'draft-card';
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'item-info';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'item-name';
            nameSpan.textContent = item;
            
            infoDiv.appendChild(nameSpan);
            
            const draftBtn = document.createElement('button');
            draftBtn.className = 'draft-btn';
            
            if (isMultiplayer) {
                if (isMyTurn && !isDraftComplete) {
                    draftBtn.classList.add('active-turn');
                    draftBtn.textContent = '⚡ Draft';
                } else {
                    draftBtn.disabled = true;
                    draftBtn.textContent = '🔒 Locked';
                }
            } else {
                if (!isDraftComplete) {
                    draftBtn.classList.add('active-turn');
                    draftBtn.textContent = '⚡ Draft';
                } else {
                    draftBtn.disabled = true;
                    draftBtn.textContent = '✅ Complete';
                }
            }
            
            draftBtn.setAttribute('data-item', item);
            
            card.appendChild(infoDiv);
            card.appendChild(draftBtn);
            
            availableContainer.appendChild(card);
        });
    }
    
    if (playersContainer) {
        playersContainer.innerHTML = '';
        
        for (let i = 0; i < numPlayers; i++) {
            const playerCol = document.createElement('div');
            playerCol.className = 'player-col';
            
            let isCurrentTurn = false;
            if (!isDraftComplete && !isMultiplayer) {
                isCurrentTurn = (currentPlayerIndex === i);
            } else if (!isDraftComplete && isMultiplayer) {
                const currentPlayerId = draftOrder[currentPickIndex]?.playerIndex;
                isCurrentTurn = (currentPlayerId === i);
            }
            
            if (isCurrentTurn) {
                playerCol.classList.add('highlight-turn');
            }
            playerCol.id = 'player' + (i + 1) + 'Col';
            
            let playerTotalScore = 0;
            for (let j = 0; j < playersItems[i].length; j++) {
                const score = typeof playersItems[i][j].score === 'number' ? playersItems[i][j].score : parseFloat(playersItems[i][j].score);
                playerTotalScore += isNaN(score) ? 0 : score;
            }
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'player-header';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'player-name';
            nameDiv.innerHTML = '<span>' + getPlayerIcon(i) + '</span><span class="player' + (i + 1) + '-name" style="color: ' + getPlayerColor(i) + '">' + getPlayerName(i) + '</span>';
            
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'player-score';
            scoreDiv.innerHTML = '<div>' + playersItems[i].length + '/' + numRounds + '</div><div style="font-size: 0.7rem; color: #facc15;">⭐ ' + playerTotalScore + '</div>';
            
            headerDiv.appendChild(nameDiv);
            headerDiv.appendChild(scoreDiv);
            
            const itemsDiv = document.createElement('div');
            itemsDiv.id = 'player' + (i + 1) + 'Items';
            itemsDiv.className = 'drafted-list player' + (i + 1) + '-items';
            
            if (playersItems[i].length === 0) {
                itemsDiv.innerHTML = '<div class="empty-state">✨ Waiting for picks...</div>';
            } else {
                itemsDiv.innerHTML = '';
                playersItems[i].forEach((item, idx) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'drafted-item';
                    itemDiv.innerHTML = '<span>' + (idx + 1) + '.</span> ' + escapeHtml(item.name);
                    itemsDiv.appendChild(itemDiv);
                });
            }
            
            playerCol.appendChild(headerDiv);
            playerCol.appendChild(itemsDiv);
            playersContainer.appendChild(playerCol);
        }
    }
    
    if (isDraftComplete) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = "Complete!";
        if (turnMessageSpan) turnMessageSpan.innerText = "🏆 Draft is finished! 🏆";
        removeHighlights();
    } else if (currentPlayerIndex !== -1) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = getPlayerName(currentPlayerIndex);
        if (turnMessageSpan) {
            const picksLeftForPlayer = numRounds - playersItems[currentPlayerIndex].length;
            turnMessageSpan.innerText = getPlayerName(currentPlayerIndex) + "'s turn to draft (" + picksLeftForPlayer + " of " + numRounds + " picks remaining)";
        }
    }
    
    attachDraftEvents();
}

function removeHighlights() {
    for (let i = 0; i < numPlayers; i++) {
        const playerCol = document.getElementById('player' + (i + 1) + 'Col');
        if (playerCol) {
            playerCol.classList.remove('highlight-turn', 'timer-warning', 'timer-critical');
        }
    }
}

function attachDraftEvents() {
    const allDraftBtns = document.querySelectorAll('#availableList .draft-btn');
    allDraftBtns.forEach(btn => {
        const itemName = btn.getAttribute('data-item');
        if (!itemName) return;
        
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetItem = newBtn.getAttribute('data-item');
            if (!targetItem) return;
            if (currentPickIndex >= draftOrder.length) {
                showToast("Draft is complete!");
                return;
            }
            performDraft(targetItem);
        });
    });
}

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
        startDraft();
    }
}

function newDraft() {
    stopTimer();
    localStorage.removeItem('draftConfig');
    localStorage.removeItem('multiplayerDraft');
    window.location.href = 'index.html';
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

let toastTimeout;
function showToast(message, duration = 2200) {
    const toastEl = document.getElementById('toastMsg');
    if (toastTimeout) clearTimeout(toastTimeout);
    if (toastEl) {
        toastEl.innerText = message;
        toastEl.style.opacity = '1';
        toastTimeout = setTimeout(() => {
            toastEl.style.opacity = '0';
        }, duration);
    }
}

function setupEventListeners() {
    const backToStartBtn = document.getElementById('backToStartBtn');
    const resetGameBtn = document.getElementById('resetGameBtn');
    const forceEndTurnBtn = document.getElementById('forceEndTurnBtn');
    
    if (backToStartBtn) {
        backToStartBtn.addEventListener('click', () => newDraft());
    }
    
    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', () => resetDraft());
    }
    
    if (forceEndTurnBtn) {
        forceEndTurnBtn.addEventListener('click', () => {
            if (currentPickIndex < draftOrder.length) {
                forceSkipTurn();
            } else {
                showToast("Draft is already complete!");
            }
        });
    }
}

function init() {
    if (!loadDraftConfig()) return;
    setupEventListeners();
    
    // Update header to show multiplayer status
    if (isMultiplayer) {
        const titleElement = document.querySelector('h1');
        if (titleElement) {
            titleElement.innerHTML = isHost ? '👑 HOSTING DRAFT' : '🎮 MULTIPLAYER DRAFT';
        }
        const subElement = document.querySelector('.sub');
        if (subElement) {
            subElement.innerHTML = `Room: ${roomCode} | ${currentCategoryName}`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    init();
});