// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'
    : 'https://draft-backend-f40v.onrender.com/api';

const SOCKET_URL = isDevelopment 
    ? 'http://localhost:3000'
    : 'https://draft-backend-f40v.onrender.com';

console.log('=== DYNAMIC DRAFT PAGE LOADED ===');

// Game state
let socket = null;
let isHost = false;
let roomCode = null;
let playersData = [];
let myPlayerName = '';
let myPlayerId = null;
let gameStarted = false;
let isMyTurn = false;
let currentPickIndex = 0;
let currentRound = 1;
let numPlayers = 2;
let numRounds = 0;
let totalPicks = 0;
let timerInterval = null;
let timeRemaining = 180;
let TIMER_DURATION = 180;
let playersItems = [];
let availableItems = [];
let draftOrder = [];
let draftPositions = [];
let playerFilledSlots = [];
let currentTemplateDisplayName = '';

// Load setup from localStorage
function loadSetup() {
    const setup = localStorage.getItem('draftSetup');
    if (!setup) {
        console.error('No setup found');
        window.location.href = 'index.html';
        return false;
    }
    
    const config = JSON.parse(setup);
    isHost = config.isHost;
    
    if (isHost) {
        myPlayerName = config.hostName || 'Host';
        numPlayers = config.numPlayers;
        TIMER_DURATION = config.timerMinutes * 60;
        timeRemaining = TIMER_DURATION;
        currentTemplateDisplayName = config.templateDisplayName;
        
        localStorage.setItem('gameConfig', JSON.stringify({
            templateName: config.templateName,
            templateDisplayName: config.templateDisplayName,
            numPlayers: config.numPlayers,
            timerMinutes: config.timerMinutes,
            draftType: config.draftType,
            hostName: config.hostName || 'Host'
        }));
        
        // Host loads data from API
        loadDraftPositions();
        loadItems();
    } else {
        myPlayerName = config.playerName;
        roomCode = config.roomCode;
    }
    
    return true;
}

async function loadDraftPositions() {
    try {
        const gameConfig = JSON.parse(localStorage.getItem('gameConfig'));
        const response = await fetch(`${API_BASE_URL}/dynamic-positions/${gameConfig.templateName}`);
        const data = await response.json();
        
        if (data.success && data.positions) {
            draftPositions = data.positions;
            numRounds = draftPositions.length;
            console.log('Host loaded draft positions:', draftPositions);
        }
    } catch (error) {
        console.error('Error loading draft positions:', error);
    }
}

async function loadItems() {
    try {
        const gameConfig = JSON.parse(localStorage.getItem('gameConfig'));
        const response = await fetch(`${API_BASE_URL}/dynamic-items/${gameConfig.templateName}/with-scores`);
        const data = await response.json();
        
        if (data.success && data.items) {
            availableItems = data.items.map(item => ({
                name: item.item_name,
                category: item.category,
                score: parseFloat(item.score) || 0
            }));
            console.log(`Host loaded ${availableItems.length} items`);
        }
    } catch (error) {
        console.error('Error loading items:', error);
        showToast('Error loading draft items', 3000);
    }
}

// Socket event handlers
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        myPlayerId = socket.id;
        document.getElementById('connectionStatus').innerHTML = '🟢 Connected';
        
        if (isHost) {
            createGameRoom();
        } else {
            joinGameRoom();
        }
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        document.getElementById('connectionStatus').innerHTML = '🔴 Disconnected';
        showToast('Connection error!', 3000);
    });
    
    socket.on('playerJoined', (players) => {
        playersData = players;
        updatePlayersList();
    });
    
    socket.on('playerLeft', (players) => {
        playersData = players;
        updatePlayersList();
        showToast('A player left the game', 2000);
        if (isHost) {
            document.getElementById('startGameBtn').style.display = 'none';
        }
    });
    
    socket.on('playerReadyUpdate', (players) => {
        playersData = players;
        updatePlayersList();
        
        if (isHost) {
            const allReady = players.every(p => p.isReady === true);
            const fullPlayers = players.length === numPlayers;
            
            if (allReady && fullPlayers) {
                document.getElementById('startGameBtn').style.display = 'block';
                showToast('All players ready! Click Start Game!', 3000);
            } else {
                document.getElementById('startGameBtn').style.display = 'none';
            }
        }
    });
    
    socket.on('allPlayersReady', () => {
        if (isHost) {
            document.getElementById('startGameBtn').style.display = 'block';
        }
    });
    
    // THE FIX: Both host and guest get slots from the server's draftStarted event
    socket.on('draftStarted', (state) => {
    console.log('===== FULL DRAFT STARTED DATA =====');
    console.log(JSON.stringify(state, null, 2));
    console.log('====================================');
    
    // Try all possible locations for positions
    if (state.positions) {
        console.log('Found positions at state.positions:', state.positions);
        draftPositions = state.positions;
    } else if (state.draftState && state.draftState.positions) {
        console.log('Found positions at state.draftState.positions:', state.draftState.positions);
        draftPositions = state.draftState.positions;
    } else if (state.draftState && state.draftState.draftPositions) {
        console.log('Found positions at state.draftState.draftPositions:', state.draftState.draftPositions);
        draftPositions = state.draftState.draftPositions;
    } else {
        console.error('NO POSITIONS FOUND IN STATE!');
        console.log('Available keys in state:', Object.keys(state));
        if (state.draftState) {
            console.log('Available keys in draftState:', Object.keys(state.draftState));
        }
    }
    
    numRounds = draftPositions.length;
    console.log('Final draftPositions:', draftPositions);
        
        // Extract positions from the server data
        if (state.positions) {
            draftPositions = state.positions;
            numRounds = draftPositions.length;
            console.log('✅ Slots loaded from server:', draftPositions);
        } else if (state.draftState && state.draftState.positions) {
            draftPositions = state.draftState.positions;
            numRounds = draftPositions.length;
            console.log('✅ Slots loaded from draftState:', draftPositions);
        }
        
        // Extract items
        if (state.availableItems) {
            availableItems = state.availableItems;
        } else if (state.draftState && state.draftState.availableItems) {
            availableItems = state.draftState.availableItems;
        } else if (state.itemsWithScores && Array.isArray(state.itemsWithScores)) {
            availableItems = state.itemsWithScores.map(item => ({
                name: item.item_name,
                category: item.category,
                score: item.score
            }));
        }
        
        // Get template name
        if (state.categoryName) {
            currentTemplateDisplayName = state.categoryName;
        } else if (state.draftState && state.draftState.categoryName) {
            currentTemplateDisplayName = state.draftState.categoryName;
        }
        
        startDraftGame(state);
    });
    
    socket.on('turnChange', (data) => {
        console.log('Turn change:', data);
        isMyTurn = (data.playerId === myPlayerId);
        
        if (isMyTurn) {
            startTimer(data.timeRemaining);
            renderDraftScreen();
            const currentSlot = getCurrentSlotName();
            showToast(`🔥 YOUR TURN! Pick a ${currentSlot}! 🔥`, 4000);
        } else {
            stopTimer();
            renderDraftScreen();
            showToast(`${data.playerName}'s turn`, 2000);
        }
    });
    
    socket.on('pickMade', (data) => {
        console.log('Pick made:', data);
        applyPick(data);
    });
    
    socket.on('draftComplete', (results) => {
        localStorage.setItem('draftResults', JSON.stringify(results));
        showToast('Draft complete! Redirecting...');
        setTimeout(() => window.location.href = 'results.html', 2000);
    });
    
    socket.on('pickError', (error) => {
        showToast(error, 2000);
    });
    
    socket.on('startDraftError', (error) => {
        showToast(error, 3000);
    });
}

function createGameRoom() {
    const gameConfig = JSON.parse(localStorage.getItem('gameConfig'));
    
    const config = {
        numPlayers: numPlayers,
        draftMode: 'dynamic',
        timerMinutes: gameConfig.timerMinutes,
        draftType: gameConfig.draftType,
        templateName: gameConfig.templateName,
        templateDisplayName: gameConfig.templateDisplayName,
        playerName: gameConfig.hostName || 'Host'
    };
    
    socket.emit('createGame', config, (response) => {
        if (response.success) {
            roomCode = response.roomCode;
            document.getElementById('roomCodeDisplay').textContent = roomCode;
            document.getElementById('maxPlayers').textContent = numPlayers;
            document.getElementById('lobbyTitle').innerHTML = '👑 You are the Host';
            document.getElementById('lobbySubtitle').innerHTML = `Share code: ${roomCode} with up to ${numPlayers - 1} friends`;
            setupLobbyButtons();
        }
    });
}

function joinGameRoom() {
    socket.emit('joinGame', { roomCode: roomCode, playerName: myPlayerName }, (response) => {
        if (response.success) {
            document.getElementById('roomCodeDisplay').textContent = roomCode;
            document.getElementById('maxPlayers').textContent = '?';
            document.getElementById('lobbyTitle').innerHTML = '🎮 Waiting for Host';
            document.getElementById('lobbySubtitle').innerHTML = `Room: ${roomCode}`;
            
            const readyDiv = document.getElementById('readyStatus');
            readyDiv.style.display = 'block';
            const readyBtn = document.getElementById('readyBtn');
            readyBtn.onclick = () => {
                socket.emit('playerReady', roomCode);
                readyBtn.disabled = true;
                readyBtn.textContent = '✓ Ready!';
                showToast('You are ready! Waiting for host...', 2000);
            };
        } else {
            showToast(response.error, 3000);
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    });
}

function setupLobbyButtons() {
    document.getElementById('copyRoomCodeBtn').onclick = () => {
        navigator.clipboard.writeText(roomCode);
        showToast('Room code copied!', 1500);
    };
    
    document.getElementById('cancelGameBtn').onclick = () => {
        window.location.href = 'index.html';
    };
    
    document.getElementById('startGameBtn').onclick = () => {
        console.log('Starting draft for room:', roomCode);
        socket.emit('startDraft', roomCode);
        document.getElementById('startGameBtn').disabled = true;
        document.getElementById('startGameBtn').textContent = 'Starting...';
    };
}

function updatePlayersList() {
    const container = document.getElementById('playersList');
    const playerCountSpan = document.getElementById('playerCount');
    
    if (!container) return;
    
    container.innerHTML = '';
    playersData.forEach((player, index) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerHTML = `
            <span>${getPlayerIcon(index)} ${escapeHtml(player.name)}</span>
            <span style="color: ${player.isReady ? '#22c55e' : '#facc15'}">
                ${player.isReady ? '✓ Ready' : '⏳ Waiting...'}
            </span>
        `;
        container.appendChild(div);
    });
    
    if (playerCountSpan) {
        playerCountSpan.textContent = playersData.length;
    }
}

function getCurrentSlotName() {
    if (!draftPositions || draftPositions.length === 0) {
        return 'Loading...';
    }
    const currentPlayerIndex = getCurrentPlayerIndex();
    const slotIndex = currentPlayerIndex !== -1 ? (playersItems[currentPlayerIndex]?.length || 0) : 0;
    if (slotIndex < draftPositions.length) {
        return draftPositions[slotIndex].position;
    }
    return 'Complete';
}

function getAvailableItemsForPlayer(playerIndex) {
    const currentSlot = getCurrentSlotName();
    
    if (currentSlot === 'Complete' || currentSlot === 'Loading...') {
        return [];
    }
    
    const filledSlots = playerFilledSlots[playerIndex] || [];
    
    return availableItems.filter(item => {
        return item.category === currentSlot && !filledSlots.includes(item.category);
    });
}

function startDraftGame(state) {
    console.log('Starting draft game');
    console.log('draftPositions:', draftPositions);
    console.log('availableItems count:', availableItems.length);
    
    gameStarted = true;
    
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('draftScreen').style.display = 'block';
    document.getElementById('mainTitle').innerHTML = 'DYNAMIC DRAFT';
    document.getElementById('subTitle').innerHTML = `Room: ${roomCode} | ${currentTemplateDisplayName}`;
    
    playersData = state.players;
    numPlayers = state.players.length;
    numRounds = draftPositions.length;
    totalPicks = numPlayers * numRounds;
    
    // Initialize empty arrays for tracking
    playersItems = playersData.map(() => []);
    playerFilledSlots = playersData.map(() => []);
    
    // Get draft order
    if (state.draftOrder) {
        draftOrder = state.draftOrder;
    } else {
        const draftType = state.draftType || 'snake';
        draftOrder = [];
        for (let round = 1; round <= numRounds; round++) {
            if (draftType === 'snake' && round % 2 === 0) {
                for (let i = numPlayers - 1; i >= 0; i--) {
                    draftOrder.push({ playerIndex: i, round: round });
                }
            } else {
                for (let i = 0; i < numPlayers; i++) {
                    draftOrder.push({ playerIndex: i, round: round });
                }
            }
        }
    }
    
    currentPickIndex = 0;
    currentRound = 1;
    TIMER_DURATION = state.timerSeconds || 180;
    timeRemaining = TIMER_DURATION;
    
    document.getElementById('categoryTitle').innerHTML = '📦 ' + currentTemplateDisplayName;
    
    renderDraftScreen();
}

function renderDraftScreen() {
    const playersContainer = document.getElementById('playersContainer');
    const availableContainer = document.getElementById('availableList');
    const poolCountSpan = document.getElementById('poolCount');
    const activePlayerNameSpan = document.getElementById('activePlayerName');
    const turnMessageSpan = document.getElementById('turnMessage');
    const roundIndicator = document.getElementById('roundIndicator');
    const currentSlotIndicatorSpan = document.getElementById('currentSlotName');
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isDraftComplete = currentPickIndex >= draftOrder.length;
    const currentSlot = getCurrentSlotName();
    
    // Update UI elements
    if (currentSlotIndicatorSpan) {
        currentSlotIndicatorSpan.textContent = isDraftComplete ? 'Complete!' : currentSlot;
    }
    
    if (roundIndicator) {
        roundIndicator.textContent = isDraftComplete 
            ? '🏁 Draft Complete! 🏁'
            : `${currentSlot} | Pick ${currentPickIndex + 1} of ${totalPicks}`;
    }
    
    if (poolCountSpan) {
        if (isDraftComplete) {
            poolCountSpan.innerText = 'Draft Complete!';
        } else if (currentPlayerIndex !== -1) {
            const itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
            poolCountSpan.innerText = `${itemsToShow.length} ${currentSlot} items available`;
        } else {
            poolCountSpan.innerText = 'Loading...';
        }
    }
    
    // Render available items
    if (availableContainer) {
        if (isDraftComplete) {
            availableContainer.innerHTML = '<div class="empty-state">🏁 Draft complete!</div>';
        } else if (currentPlayerIndex === -1) {
            availableContainer.innerHTML = '<div class="empty-state">⏳ Waiting for draft to start...</div>';
        } else {
            const itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
            
            if (itemsToShow.length === 0) {
                availableContainer.innerHTML = `<div class="empty-state">⚠️ No ${currentSlot} items available! ⚠️</div>`;
            } else {
                availableContainer.innerHTML = '';
                itemsToShow.forEach(item => {
                    const canDraft = gameStarted && isMyTurn && !isDraftComplete;
                    const card = document.createElement('div');
                    card.className = 'draft-card';
                    card.innerHTML = `
                        <div class="item-info">
                            <span class="item-name">${escapeHtml(item.name)}</span>
                            <span class="item-category">📁 ${escapeHtml(item.category)}</span>
                            <span class="item-score">⭐ ${item.score} pts</span>
                        </div>
                        <button class="draft-btn ${canDraft ? 'active-turn' : ''}" ${!canDraft ? 'disabled' : ''}>
                            ${canDraft ? '⚡ Draft' : '🔒 Locked'}
                        </button>
                    `;
                    const btn = card.querySelector('.draft-btn');
                    if (canDraft) {
                        btn.onclick = () => makePick(item);
                    }
                    availableContainer.appendChild(card);
                });
            }
        }
    }
    
    // Render players
    if (playersContainer && draftPositions.length > 0) {
        playersContainer.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const isCurrentTurn = (!isDraftComplete && currentPlayerIndex === i);
            const playerName = getPlayerName(i);
            const filledSlots = playerFilledSlots[i] || [];
            const playerItems = playersItems[i] || [];
            
            const playerCol = document.createElement('div');
            playerCol.className = `player-col ${isCurrentTurn ? 'highlight-turn' : ''}`;
            
            let slotsHtml = '<div class="player-slots"><strong>🎯 Slots:</strong><br>';
            draftPositions.forEach((pos, idx) => {
                const isFilled = filledSlots.includes(pos.position);
                const isCurrentSlot = idx === playerItems.length && isCurrentTurn && !isDraftComplete;
                const slotStyle = isFilled ? 'color: #4CAF50; text-decoration: line-through;' : (isCurrentSlot ? 'color: #ff9800; font-weight: bold;' : 'color: #999;');
                slotsHtml += `<div style="${slotStyle}">${isFilled ? '✓' : '○'} ${pos.position}</div>`;
            });
            slotsHtml += '</div>';
            
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(i)} ${escapeHtml(playerName)}</div>
                </div>
                ${slotsHtml}
                <div class="drafted-list">
                    ${playerItems.length === 0 
                        ? '<div class="empty-state">✨ No picks yet</div>'
                        : playerItems.map((item, idx) => `
                            <div class="drafted-item">${idx + 1}. ${escapeHtml(item.name)} (${item.score || 0} pts)</div>
                        `).join('')
                    }
                </div>
                <div class="player-total">
                    <strong>🏆 Total: ${playerItems.reduce((sum, item) => sum + (item.score || 0), 0)} pts</strong>
                </div>
            `;
            playersContainer.appendChild(playerCol);
        }
    }
    
    // Update turn message
    if (isDraftComplete) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = "Complete!";
        if (turnMessageSpan) turnMessageSpan.innerText = "🏆 Draft is finished! 🏆";
    } else if (currentPlayerIndex !== -1) {
        const currentPlayerName = getPlayerName(currentPlayerIndex);
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = currentPlayerName;
        if (turnMessageSpan) {
            if (gameStarted && isMyTurn && !isDraftComplete) {
                turnMessageSpan.innerHTML = `🎯 YOUR TURN! Pick a ${currentSlot}! 🎯`;
                turnMessageSpan.style.color = '#facc15';
            } else if (gameStarted) {
                turnMessageSpan.innerHTML = `${currentPlayerName}'s turn...`;
                turnMessageSpan.style.color = '#94a3b8';
            } else {
                turnMessageSpan.innerHTML = "Waiting for draft to start...";
                turnMessageSpan.style.color = '#94a3b8';
            }
        }
    }
}

function makePick(item) {
    if (!isMyTurn) {
        showToast("Not your turn!", 2000);
        return;
    }
    
    const currentSlot = getCurrentSlotName();
    
    if (item.category !== currentSlot) {
        showToast(`❌ Please select a ${currentSlot}!`, 2000);
        return;
    }
    
    console.log(`Making pick: ${item.name}`);
    socket.emit('makePick', { roomCode: roomCode, itemName: item.name });
}

function applyPick(data) {
    console.log('Applying pick:', data);
    
    // Remove from available items
    const itemIndex = availableItems.findIndex(i => i.name === data.item);
    if (itemIndex !== -1) {
        availableItems.splice(itemIndex, 1);
    }
    
    // Find player index
    let playerIndex = -1;
    for (let i = 0; i < playersData.length; i++) {
        if (playersData[i].id === data.playerId || playersData[i].name === data.playerName) {
            playerIndex = i;
            break;
        }
    }
    
    if (playerIndex !== -1) {
        const currentSlotIndex = playersItems[playerIndex].length;
        const slotCategory = draftPositions[currentSlotIndex]?.position || 'Unknown';
        
        playersItems[playerIndex].push({ 
            name: data.item,
            category: slotCategory,
            score: data.score || 0
        });
        
        if (!playerFilledSlots[playerIndex]) {
            playerFilledSlots[playerIndex] = [];
        }
        if (!playerFilledSlots[playerIndex].includes(slotCategory)) {
            playerFilledSlots[playerIndex].push(slotCategory);
        }
    }
    
    currentPickIndex++;
    if (currentPickIndex < draftOrder.length) {
        currentRound = draftOrder[currentPickIndex].round;
    }
    
    renderDraftScreen();
}

function getCurrentPlayerIndex() {
    if (!draftOrder || currentPickIndex >= draftOrder.length) return -1;
    return draftOrder[currentPickIndex].playerIndex;
}

function getPlayerName(playerIndex) {
    if (playersData && playersData[playerIndex]) {
        return playersData[playerIndex].name;
    }
    return 'Player ' + (playerIndex + 1);
}

function getPlayerIcon(index) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[index % icons.length];
}

function startTimer(duration) {
    stopTimer();
    timeRemaining = duration;
    TIMER_DURATION = duration;
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            updateTimerDisplay();
            
            if (timeRemaining === 0 && isMyTurn && gameStarted) {
                stopTimer();
                const currentPlayerIndex = getCurrentPlayerIndex();
                const itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
                if (itemsToShow.length > 0) {
                    const randomItem = itemsToShow[Math.floor(Math.random() * itemsToShow.length)];
                    makePick(randomItem);
                    showToast("Time's up! Auto-drafting...", 2000);
                }
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

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerDisplayEl = document.getElementById('timerDisplay');
    const timerBarFillEl = document.getElementById('timerBarFill');
    
    if (timerDisplayEl) {
        timerDisplayEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeRemaining <= 10) {
            timerDisplayEl.style.color = '#ef4444';
        } else if (timeRemaining <= 30) {
            timerDisplayEl.style.color = '#f97316';
        } else {
            timerDisplayEl.style.color = '#facc15';
        }
    }
    
    if (timerBarFillEl && TIMER_DURATION > 0) {
        const percentage = (timeRemaining / TIMER_DURATION) * 100;
        timerBarFillEl.style.width = Math.max(0, percentage) + '%';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
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
    if (!loadSetup()) return;
    
    document.getElementById('lobbyScreen').style.display = 'block';
    document.getElementById('draftScreen').style.display = 'none';
    
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true
    });
    
    setupSocketListeners();
    
    document.getElementById('backToLobbyBtn').onclick = () => {
        window.location.href = 'index.html';
    };
    
    document.getElementById('resetGameBtn').onclick = () => {
        if (confirm('Reset the current draft?')) {
            window.location.reload();
        }
    };
    
    document.getElementById('forceEndTurnBtn').onclick = () => {
        if (isMyTurn && gameStarted) {
            const currentPlayerIndex = getCurrentPlayerIndex();
            const itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
            if (itemsToShow.length > 0) {
                const randomItem = itemsToShow[Math.floor(Math.random() * itemsToShow.length)];
                makePick(randomItem);
                showToast("Auto-drafting...", 1500);
            } else {
                showToast("No items available!", 2000);
            }
        } else if (!gameStarted) {
            showToast("Game hasn't started yet!", 2000);
        } else {
            showToast("Not your turn!", 2000);
        }
    };
    
    showToast('Waiting for game to start...', 3000);
}

document.addEventListener('DOMContentLoaded', init);