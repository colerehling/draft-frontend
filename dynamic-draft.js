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
let itemsWithScores = {};
let draftOrder = [];
let draftOrderType = 'snake';
let currentTemplateName = '';
let currentTemplateDisplayName = '';
let draftPositions = [];
let playerFilledSlots = [];

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
        currentTemplateName = config.templateName;
        currentTemplateDisplayName = config.templateDisplayName;
        draftOrderType = config.draftType || 'snake';
        
        localStorage.setItem('gameConfig', JSON.stringify({
            templateName: currentTemplateName,
            templateDisplayName: currentTemplateDisplayName,
            numPlayers: numPlayers,
            timerMinutes: config.timerMinutes,
            hostName: myPlayerName,
            draftType: draftOrderType
        }));
        
        // Load draft positions for this template
        loadDraftPositions();
        loadItems();
    } else {
        myPlayerName = config.playerName;
        roomCode = config.roomCode;
    }
    
    return true;
}

// Load draft positions from backend
async function loadDraftPositions() {
    try {
        const response = await fetch(`${API_BASE_URL}/dynamic-positions/${currentTemplateName}`);
        const data = await response.json();
        
        if (data.success && data.positions) {
            draftPositions = data.positions;
            numRounds = draftPositions.length;
            console.log('Draft positions loaded:', draftPositions);
        }
    } catch (error) {
        console.error('Error loading draft positions:', error);
    }
}

// Load items from the template's item table
async function loadItems() {
    try {
        const response = await fetch(`${API_BASE_URL}/dynamic-items/${currentTemplateName}/with-scores`);
        const data = await response.json();
        
        if (data.success && data.items) {
            availableItems = data.items.map(item => ({
                name: item.item_name,
                category: item.category,
                score: item.score
            }));
            itemsWithScores = {};
            data.items.forEach(item => {
                itemsWithScores[item.item_name] = item.score;
            });
            console.log(`Loaded ${availableItems.length} items`);
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
        document.getElementById('connectionStatus').innerHTML = '🟢 Connected';
        localStorage.setItem('mySocketId', socket.id);
        
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
        console.log('Players updated:', players);
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
    
    socket.on('draftStarted', (state) => {
        console.log('Draft started!', state);
        startDraftGame(state);
    });
    
    socket.on('turnChange', (data) => {
        console.log('Turn change:', data);
        isMyTurn = (data.playerName === myPlayerName);
        
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
        playerName: gameConfig.hostName || 'Host',
        draftType: draftOrderType,
        templateName: gameConfig.templateName,
        templateDisplayName: gameConfig.templateDisplayName
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
        
        // Send draft positions and items to server
        const gameData = {
            draftPositions: draftPositions,
            availableItems: availableItems,
            itemsWithScores: itemsWithScores,
            numRounds: numRounds
        };
        socket.emit('gameData', { roomCode, gameData });
        socket.emit('startDraft', roomCode);
        document.getElementById('startGameBtn').disabled = true;
        document.getElementById('startGameBtn').textContent = 'Starting...';
    };
}

function updatePlayersList() {
    const container = document.getElementById('playersList');
    const playerCountSpan = document.getElementById('playerCount');
    
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
    
    playerCountSpan.textContent = playersData.length;
}

function getCurrentSlotIndex() {
    // Get the current slot based on how many picks this player has made
    // This is per-player tracking
    const currentPlayerIndex = getCurrentPlayerIndex();
    if (currentPlayerIndex !== -1) {
        return playersItems[currentPlayerIndex]?.length || 0;
    }
    return 0;
}

function getCurrentSlotName() {
    const slotIndex = getCurrentSlotIndex();
    if (slotIndex < draftPositions.length) {
        return draftPositions[slotIndex].position;
    }
    return 'Unknown';
}

function isCategoryAvailableForPlayer(playerIndex, category) {
    // Check if this player has already filled this slot
    const filledSlots = playerFilledSlots[playerIndex] || [];
    return !filledSlots.includes(category);
}

function getAvailableItemsForPlayer(playerIndex) {
    const currentSlot = getCurrentSlotName();
    // Only show items that match the current slot's category
    return availableItems.filter(item => 
        item.category === currentSlot && 
        isCategoryAvailableForPlayer(playerIndex, item.category)
    );
}

function startDraftGame(state) {
    gameStarted = true;
    
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('draftScreen').style.display = 'block';
    document.getElementById('mainTitle').innerHTML = '🎯 DYNAMIC DRAFT';
    document.getElementById('subTitle').innerHTML = `Room: ${roomCode} | ${currentTemplateDisplayName}`;
    
    playersData = state.players;
    numPlayers = state.players.length;
    numRounds = draftPositions.length;
    totalPicks = numPlayers * numRounds;
    playersItems = playersData.map(() => []);
    playerFilledSlots = playersData.map(() => []);
    
    // Load items from state if available
    if (state.availableItems) {
        availableItems = state.availableItems;
    }
    if (state.itemsWithScores) {
        itemsWithScores = state.itemsWithScores;
    }
    if (state.draftPositions) {
        draftPositions = state.draftPositions;
    }
    
    draftOrder = generateDraftOrder();
    currentPickIndex = 0;
    currentRound = 1;
    TIMER_DURATION = state.timerSeconds;
    timeRemaining = TIMER_DURATION;
    
    document.getElementById('categoryTitle').innerHTML = '📦 ' + currentTemplateDisplayName;
    
    renderDraftScreen();
}

function generateDraftOrder() {
    const order = [];
    for (let round = 1; round <= numRounds; round++) {
        if (draftOrderType === 'snake' && round % 2 === 0) {
            for (let i = numPlayers - 1; i >= 0; i--) {
                order.push({ playerIndex: i, round: round, slotIndex: round - 1 });
            }
        } else {
            for (let i = 0; i < numPlayers; i++) {
                order.push({ playerIndex: i, round: round, slotIndex: round - 1 });
            }
        }
    }
    return order;
}

function renderDraftScreen() {
    const playersContainer = document.getElementById('playersContainer');
    const availableContainer = document.getElementById('availableList');
    const poolCountSpan = document.getElementById('poolCount');
    const activePlayerNameSpan = document.getElementById('activePlayerName');
    const turnMessageSpan = document.getElementById('turnMessage');
    const roundIndicator = document.getElementById('roundIndicator');
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isDraftComplete = currentPickIndex >= draftOrder.length;
    
    if (roundIndicator) {
        if (isDraftComplete) {
            roundIndicator.textContent = '🏁 Draft Complete! 🏁';
        } else {
            const currentSlot = getCurrentSlotName();
            roundIndicator.innerHTML = `Round ${currentRound} of ${numRounds} | 🎯 ${currentSlot} | Pick ${currentPickIndex + 1} of ${totalPicks}`;
        }
    }
    
    // Get items available for the current player
    let itemsToShow = [];
    if (!isDraftComplete && currentPlayerIndex !== -1) {
        itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
    }
    
    if (poolCountSpan) {
        poolCountSpan.innerText = `${itemsToShow.length} items available`;
    }
    
    // RENDER AVAILABLE ITEMS - Original style (vertical list with draft button on the right)
    if (availableContainer) {
        if (itemsToShow.length === 0 || isDraftComplete) {
            availableContainer.innerHTML = '<div class="empty-state">🏁 Draft complete or no available items!</div>';
        } else {
            availableContainer.innerHTML = '';
            itemsToShow.forEach(item => {
                const canDraft = gameStarted && isMyTurn;
                const card = document.createElement('div');
                card.className = 'draft-card';
                card.innerHTML = `
                    <div class="item-info">
                        <span class="item-name">${escapeHtml(item.name)}</span>
                        <span class="item-category">${escapeHtml(item.category)}</span>
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
    
    // RENDER PLAYERS
    if (playersContainer) {
        playersContainer.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const isCurrentTurn = (!isDraftComplete && currentPlayerIndex === i);
            const playerName = getPlayerName(i);
            const filledSlots = playerFilledSlots[i] || [];
            
            const playerCol = document.createElement('div');
            playerCol.className = `player-col ${isCurrentTurn ? 'highlight-turn' : ''}`;
            
            // Build positions HTML showing required slots
            let positionsHtml = '<div class="player-positions">';
            draftPositions.forEach((pos, idx) => {
                const isFilled = filledSlots.includes(pos.position);
                const isCurrentSlot = idx === getCurrentSlotIndex() && isCurrentTurn && !isDraftComplete;
                const slotClass = isFilled ? 'slot-filled' : (isCurrentSlot ? 'slot-current' : 'slot-empty');
                positionsHtml += `<div class="slot-item ${slotClass}">${pos.position}: ${isFilled ? '✓' : '○'}</div>`;
            });
            positionsHtml += '</div>';
            
            // Build items HTML
            let itemsHtml = '<div class="drafted-list">';
            if (playersItems[i].length === 0) {
                itemsHtml += '<div class="empty-state">✨ No picks yet</div>';
            } else {
                playersItems[i].forEach((item, idx) => {
                    itemsHtml += `
                        <div class="drafted-item">
                            <span>${idx + 1}. ${escapeHtml(item.name)}</span>
                            <span class="item-category-tag">${escapeHtml(item.category)}</span>
                        </div>
                    `;
                });
            }
            itemsHtml += '</div>';
            
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(i)} ${escapeHtml(playerName)}</div>
                </div>
                ${positionsHtml}
                ${itemsHtml}
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
            if (gameStarted && isMyTurn) {
                const currentSlot = getCurrentSlotName();
                turnMessageSpan.innerHTML = `🎯 YOUR TURN! Pick a ${currentSlot}! 🎯`;
                turnMessageSpan.style.color = '#facc15';
            } else {
                turnMessageSpan.innerHTML = `${currentPlayerName}'s turn...`;
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
    
    const currentPlayerIndex = getCurrentPlayerIndex();
    const currentSlot = getCurrentSlotName();
    
    // Validate the item matches the current slot's category
    if (item.category !== currentSlot) {
        showToast(`Please select a ${currentSlot} item!`, 2000);
        return;
    }
    
    // Check if player already filled this slot
    if (!isCategoryAvailableForPlayer(currentPlayerIndex, item.category)) {
        showToast(`You already selected a ${item.category}!`, 2000);
        return;
    }
    
    socket.emit('makePick', { 
        roomCode: roomCode, 
        itemName: item.name,
        category: item.category,
        score: item.score
    });
}

function applyPick(data) {
    // Find and remove item from available items
    const itemIndex = availableItems.findIndex(i => i.name === data.item);
    if (itemIndex !== -1) availableItems.splice(itemIndex, 1);
    
    // Find which player made the pick
    let playerIndex = -1;
    for (let i = 0; i < playersData.length; i++) {
        if (playersData[i].name === data.playerName) {
            playerIndex = i;
            break;
        }
    }
    
    if (playerIndex !== -1) {
        // Add the pick to player's items
        playersItems[playerIndex].push({ 
            name: data.item,
            category: data.category,
            score: data.score || 0
        });
        
        // Mark this slot as filled for the player
        if (!playerFilledSlots[playerIndex]) {
            playerFilledSlots[playerIndex] = [];
        }
        playerFilledSlots[playerIndex].push(data.category);
    }
    
    currentPickIndex++;
    if (currentPickIndex < draftOrder.length) {
        currentRound = draftOrder[currentPickIndex].round;
    }
    
    renderDraftScreen();
}

function getCurrentPlayerIndex() {
    if (currentPickIndex >= draftOrder.length) return -1;
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
        if (isMyTurn) {
            const currentPlayerIndex = getCurrentPlayerIndex();
            const availableForPlayer = getAvailableItemsForPlayer(currentPlayerIndex);
            if (availableForPlayer.length > 0) {
                const randomItem = availableForPlayer[Math.floor(Math.random() * availableForPlayer.length)];
                makePick(randomItem);
            }
        }
    };
    
    showToast('Waiting for game to start...', 3000);
}

document.addEventListener('DOMContentLoaded', init);