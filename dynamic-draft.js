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
let draftPositions = [];
let playerFilledSlots = [];
let currentTemplateName = '';
let currentTemplateDisplayName = '';
let dataLoaded = false;

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
        
        // Host loads data immediately
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

async function loadItems() {
    try {
        const response = await fetch(`${API_BASE_URL}/dynamic-items/${currentTemplateName}/with-scores`);
        const data = await response.json();
        
        if (data.success && data.items) {
            availableItems = data.items.map(item => ({
                name: item.item_name,
                category: item.category,
                score: parseFloat(item.score) || 0
            }));
            itemsWithScores = {};
            data.items.forEach(item => {
                itemsWithScores[item.item_name] = parseFloat(item.score) || 0;
            });
            dataLoaded = true;
            console.log(`Loaded ${availableItems.length} items`);
        }
    } catch (error) {
        console.error('Error loading items:', error);
        showToast('Error loading draft items', 3000);
    }
}

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
    
    // CRITICAL: Receive game data from host - THIS MUST MATCH HOST'S DATA STRUCTURE
    socket.on('gameData', (data) => {
        console.log('📦 Received game data from host:', data);
        
        // Sync all data structures with host
        if (data.draftPositions && data.draftPositions.length > 0) {
            draftPositions = data.draftPositions;
            numRounds = draftPositions.length;
            console.log('Draft positions synced:', draftPositions);
        }
        
        if (data.availableItems && data.availableItems.length > 0) {
            availableItems = data.availableItems;
            console.log(`Available items synced: ${availableItems.length} items`);
        }
        
        if (data.itemsWithScores) {
            itemsWithScores = data.itemsWithScores;
        }
        
        if (data.numRounds) {
            numRounds = data.numRounds;
        }
        
        if (data.draftOrderType) {
            draftOrderType = data.draftOrderType;
        }
        
        if (data.currentTemplateDisplayName) {
            currentTemplateDisplayName = data.currentTemplateDisplayName;
        }
        
        dataLoaded = true;
        
        // Initialize player tracking
        playerFilledSlots = [];
        for (let i = 0; i < numPlayers; i++) {
            playerFilledSlots[i] = [];
        }
        
        // Re-render to show correct UI
        if (gameStarted) {
            renderDraftScreen();
        }
    });
    
    socket.on('draftStarted', (state) => {
        console.log('🎯 Draft started!', state);
        
        // CRITICAL: Ensure guest has ALL the data from host
        // Use state data as primary source for guests
        if (!isHost) {
            if (state.positions && state.positions.length > 0) {
                draftPositions = state.positions;
                numRounds = draftPositions.length;
                console.log('Draft positions from state:', draftPositions);
            }
            
            if (state.availableItems && state.availableItems.length > 0) {
                availableItems = state.availableItems;
            } else if (state.itemsWithScores) {
                if (Array.isArray(state.itemsWithScores)) {
                    availableItems = state.itemsWithScores.map(item => ({
                        name: item.item_name,
                        category: item.category,
                        score: item.score
                    }));
                } else if (typeof state.itemsWithScores === 'object') {
                    availableItems = Object.keys(state.itemsWithScores).map(name => ({
                        name: name,
                        category: 'Unknown',
                        score: state.itemsWithScores[name]
                    }));
                }
            }
            
            if (state.itemsWithScores) {
                if (Array.isArray(state.itemsWithScores)) {
                    itemsWithScores = {};
                    state.itemsWithScores.forEach(item => {
                        itemsWithScores[item.item_name] = item.score;
                    });
                } else {
                    itemsWithScores = state.itemsWithScores;
                }
            }
            
            if (state.draftOrderType) {
                draftOrderType = state.draftOrderType;
            }
            
            if (state.categoryName) {
                currentTemplateDisplayName = state.categoryName;
            }
            
            dataLoaded = true;
        }
        
        startDraftGame(state);
    });
    
    socket.on('turnChange', (data) => {
        console.log('🔄 Turn change:', data);
        isMyTurn = (data.playerId === socket.id);
        
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
        console.log('📦 Pick made:', data);
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
    console.log('Joining game room:', roomCode);
    
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
        
        // Prepare complete game data to send to all players - MUST MATCH WHAT GUEST EXPECTS
        const gameData = {
            draftPositions: draftPositions,
            availableItems: availableItems,
            itemsWithScores: itemsWithScores,
            numRounds: numRounds,
            draftOrderType: draftOrderType,
            currentTemplateDisplayName: currentTemplateDisplayName
        };
        
        console.log('Broadcasting game data to guests:', gameData);
        
        // Broadcast to all other players
        socket.emit('broadcastGameData', { roomCode, gameData });
        
        // Start the draft after a short delay to ensure data is sent
        setTimeout(() => {
            socket.emit('startDraft', roomCode);
            document.getElementById('startGameBtn').disabled = true;
            document.getElementById('startGameBtn').textContent = 'Starting...';
        }, 500);
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

function getCurrentSlotIndex() {
    const currentPlayerIndex = getCurrentPlayerIndex();
    if (currentPlayerIndex !== -1 && playersItems[currentPlayerIndex]) {
        return playersItems[currentPlayerIndex].length;
    }
    return 0;
}

function getCurrentSlotName() {
    if (!draftPositions || draftPositions.length === 0) {
        return 'Loading...';
    }
    const slotIndex = getCurrentSlotIndex();
    if (slotIndex < draftPositions.length) {
        return draftPositions[slotIndex].position;
    }
    return draftPositions[draftPositions.length - 1]?.position || 'Complete';
}

function isCategoryAvailableForPlayer(playerIndex, category) {
    const filledSlots = playerFilledSlots[playerIndex] || [];
    return !filledSlots.includes(category);
}

function getAvailableItemsForPlayer(playerIndex) {
    const currentSlot = getCurrentSlotName();
    
    // If draft is complete or no slot, return empty
    if (currentSlot === 'Complete' || currentSlot === 'Loading...') {
        return [];
    }
    
    const filtered = availableItems.filter(item => {
        const matchesCategory = item.category === currentSlot;
        const available = isCategoryAvailableForPlayer(playerIndex, item.category);
        return matchesCategory && available;
    });
    
    console.log(`Slot: ${currentSlot}, Available items: ${filtered.length}`);
    return filtered;
}

function startDraftGame(state) {
    gameStarted = true;
    
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('draftScreen').style.display = 'block';
    document.getElementById('mainTitle').innerHTML = 'DYNAMIC DRAFT';
    document.getElementById('subTitle').innerHTML = `Room: ${roomCode} | ${currentTemplateDisplayName}`;
    
    playersData = state.players;
    numPlayers = state.players.length;
    totalPicks = numPlayers * numRounds;
    playersItems = playersData.map(() => []);
    playerFilledSlots = playersData.map(() => []);
    
    // Ensure we have draft positions
    if (draftPositions.length === 0 && state.positions) {
        draftPositions = state.positions;
        numRounds = draftPositions.length;
    }
    
    // Ensure we have available items
    if (availableItems.length === 0 && state.availableItems) {
        availableItems = state.availableItems;
    }
    
    dataLoaded = true;
    console.log('Game started with:', {
        draftPositions: draftPositions,
        availableItemsCount: availableItems.length,
        numPlayers: numPlayers,
        numRounds: numRounds
    });
    
    draftOrder = generateDraftOrder();
    currentPickIndex = 0;
    currentRound = 1;
    TIMER_DURATION = state.timerSeconds || 180;
    timeRemaining = TIMER_DURATION;
    
    const categoryTitle = document.getElementById('categoryTitle');
    if (categoryTitle) {
        categoryTitle.innerHTML = '📦 ' + currentTemplateDisplayName;
    }
    
    renderDraftScreen();
}

function generateDraftOrder() {
    const order = [];
    for (let round = 1; round <= numRounds; round++) {
        if (draftOrderType === 'snake' && round % 2 === 0) {
            for (let i = numPlayers - 1; i >= 0; i--) {
                order.push({ playerIndex: i, round: round });
            }
        } else {
            for (let i = 0; i < numPlayers; i++) {
                order.push({ playerIndex: i, round: round });
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
    const currentSlotIndicatorSpan = document.getElementById('currentSlotName');
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isDraftComplete = currentPickIndex >= draftOrder.length;
    
    // Update current slot indicator - SAME FOR BOTH HOST AND GUEST
    if (currentSlotIndicatorSpan) {
        if (isDraftComplete) {
            currentSlotIndicatorSpan.textContent = 'Draft Complete!';
        } else {
            const currentSlot = getCurrentSlotName();
            currentSlotIndicatorSpan.textContent = currentSlot;
        }
    }
    
    // Update pool count
    if (poolCountSpan) {
        if (isDraftComplete) {
            poolCountSpan.innerText = `Draft Complete!`;
        } else if (currentPlayerIndex !== -1 && dataLoaded && draftPositions.length > 0) {
            const itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
            const currentSlot = getCurrentSlotName();
            poolCountSpan.innerText = `${itemsToShow.length} ${currentSlot} items available`;
        } else if (!dataLoaded || draftPositions.length === 0) {
            poolCountSpan.innerText = `Loading slots...`;
        } else {
            poolCountSpan.innerText = `Waiting for turn...`;
        }
    }
    
    // Render available items - SAME FOR BOTH HOST AND GUEST
    if (availableContainer) {
        if (!dataLoaded || draftPositions.length === 0) {
            availableContainer.innerHTML = '<div class="empty-state">⏳ Loading draft slots...</div>';
        } else if (isDraftComplete) {
            availableContainer.innerHTML = '<div class="empty-state">🏆 Draft Complete! 🏆</div>';
        } else if (currentPlayerIndex === -1) {
            availableContainer.innerHTML = '<div class="empty-state">⏳ Waiting for draft to start...</div>';
        } else {
            const itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
            const currentSlot = getCurrentSlotName();
            
            if (itemsToShow.length === 0) {
                availableContainer.innerHTML = `<div class="empty-state">⚠️ No ${currentSlot} items available! ⚠️</div>`;
            } else {
                availableContainer.innerHTML = '';
                itemsToShow.forEach(item => {
                    const canDraft = gameStarted && isMyTurn && !isDraftComplete;
                    const card = document.createElement('div');
                    card.className = `item-card ${canDraft ? 'clickable' : 'disabled'}`;
                    card.innerHTML = `
                        <div class="item-name">${escapeHtml(item.name)}</div>
                        <div class="item-category">📁 ${escapeHtml(item.category)}</div>
                        <div class="item-score">⭐ Score: ${item.score}</div>
                    `;
                    if (canDraft) {
                        card.onclick = () => makePick(item);
                        card.style.cursor = 'pointer';
                    }
                    availableContainer.appendChild(card);
                });
            }
        }
    }
    
    // Render players and their slots - SAME FOR BOTH HOST AND GUEST
    if (playersContainer && draftPositions.length > 0) {
        playersContainer.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const isCurrentTurn = (!isDraftComplete && currentPlayerIndex === i && gameStarted);
            const playerName = getPlayerName(i);
            const filledSlots = playerFilledSlots[i] || [];
            
            const playerCard = document.createElement('div');
            playerCard.className = `player-card ${isCurrentTurn ? 'current-turn' : ''}`;
            
            // Build positions HTML with slot indicators
            let positionsHtml = '<div style="margin: 10px 0;"><strong>🎯 Slots to Fill:</strong><br>';
            draftPositions.forEach((pos, idx) => {
                const isFilled = filledSlots.includes(pos.position);
                const isCurrentSlot = idx === playersItems[i].length && isCurrentTurn && !isDraftComplete;
                const slotStyle = isFilled ? 'color: #4CAF50; text-decoration: line-through;' : (isCurrentSlot ? 'color: #ff9800; font-weight: bold;' : 'color: #999;');
                const statusIcon = isFilled ? '✓' : (isCurrentSlot ? '▶' : '○');
                positionsHtml += `<div style="${slotStyle}">${statusIcon} ${pos.position}</div>`;
            });
            positionsHtml += '</div>';
            
            // Build drafted items HTML
            let itemsHtml = '<div style="margin-top: 10px;"><strong>📋 Your Picks:</strong><br>';
            if (playersItems[i].length === 0) {
                itemsHtml += '<em style="color: #999;">No picks yet</em>';
            } else {
                playersItems[i].forEach((item, idx) => {
                    itemsHtml += `<div>${idx + 1}. ${escapeHtml(item.name)} <span style="color: #4CAF50;">(${item.score} pts)</span></div>`;
                });
            }
            itemsHtml += '</div>';
            
            // Calculate total score
            const totalScore = playersItems[i].reduce((sum, item) => sum + (item.score || 0), 0);
            
            playerCard.innerHTML = `
                <div class="player-name">
                    ${getPlayerIcon(i)} ${escapeHtml(playerName)}
                </div>
                ${positionsHtml}
                ${itemsHtml}
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0;">
                    <strong>🏆 Total Score: ${totalScore}</strong>
                </div>
            `;
            playersContainer.appendChild(playerCard);
        }
    }
    
    // Update turn message - SAME FOR BOTH HOST AND GUEST
    if (isDraftComplete) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = "Complete!";
        if (turnMessageSpan) turnMessageSpan.innerText = "🏆 Draft is finished! 🏆";
    } else if (currentPlayerIndex !== -1 && draftPositions.length > 0) {
        const currentPlayerName = getPlayerName(currentPlayerIndex);
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = currentPlayerName;
        if (turnMessageSpan) {
            if (gameStarted && isMyTurn && !isDraftComplete) {
                const currentSlot = getCurrentSlotName();
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
    
    if (!gameStarted) {
        showToast("Game hasn't started yet!", 2000);
        return;
    }
    
    const currentPlayerIndex = getCurrentPlayerIndex();
    const currentSlot = getCurrentSlotName();
    
    if (item.category !== currentSlot) {
        showToast(`❌ Please select a ${currentSlot}! You tried to pick a ${item.category}.`, 3000);
        return;
    }
    
    if (!isCategoryAvailableForPlayer(currentPlayerIndex, item.category)) {
        showToast(`❌ You already picked a ${item.category}!`, 2000);
        return;
    }
    
    console.log(`Making pick: ${item.name} for slot ${currentSlot}`);
    
    socket.emit('makePick', { 
        roomCode: roomCode, 
        itemName: item.name
    });
}

function applyPick(data) {
    console.log('Applying pick:', data);
    
    // Remove from available items
    const itemIndex = availableItems.findIndex(i => i.name === data.item);
    if (itemIndex !== -1) availableItems.splice(itemIndex, 1);
    
    // Find player index
    let playerIndex = -1;
    for (let i = 0; i < playersData.length; i++) {
        if (playersData[i].id === data.playerId || playersData[i].name === data.playerName) {
            playerIndex = i;
            break;
        }
    }
    
    if (playerIndex !== -1) {
        // Determine the slot for this pick
        let slotCategory = data.category;
        if (!slotCategory && draftPositions && playersItems[playerIndex]) {
            slotCategory = draftPositions[playersItems[playerIndex].length]?.position || 'Unknown';
        }
        
        // Add to player's items
        playersItems[playerIndex].push({ 
            name: data.item,
            category: slotCategory,
            score: data.score || 0
        });
        
        // Track filled slots
        if (!playerFilledSlots[playerIndex]) {
            playerFilledSlots[playerIndex] = [];
        }
        if (!playerFilledSlots[playerIndex].includes(slotCategory)) {
            playerFilledSlots[playerIndex].push(slotCategory);
        }
        
        console.log(`Player ${playerIndex} picked ${data.item} for slot ${slotCategory}`);
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
            
            if (timeRemaining === 0 && isMyTurn && gameStarted) {
                stopTimer();
                const currentPlayerIndex = getCurrentPlayerIndex();
                const availableForPlayer = getAvailableItemsForPlayer(currentPlayerIndex);
                if (availableForPlayer.length > 0) {
                    const randomItem = availableForPlayer[Math.floor(Math.random() * availableForPlayer.length)];
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

function init() {
    if (!loadSetup()) return;
    
    document.getElementById('lobbyScreen').style.display = 'block';
    document.getElementById('draftScreen').style.display = 'none';
    
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true
    });
    
    setupSocketListeners();
    
    const backBtn = document.getElementById('backToLobbyBtn');
    if (backBtn) {
        backBtn.onclick = () => {
            window.location.href = 'index.html';
        };
    }
    
    const resetBtn = document.getElementById('resetGameBtn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            if (confirm('Reset the current draft? This will reload the page.')) {
                window.location.reload();
            }
        };
    }
    
    const forceEndBtn = document.getElementById('forceEndTurnBtn');
    if (forceEndBtn) {
        forceEndBtn.onclick = () => {
            if (isMyTurn && gameStarted) {
                const currentPlayerIndex = getCurrentPlayerIndex();
                const availableForPlayer = getAvailableItemsForPlayer(currentPlayerIndex);
                if (availableForPlayer.length > 0) {
                    const randomItem = availableForPlayer[Math.floor(Math.random() * availableForPlayer.length)];
                    makePick(randomItem);
                    showToast("Auto-drafting...", 1500);
                } else {
                    showToast("No items available to draft!", 2000);
                }
            } else if (!gameStarted) {
                showToast("Game hasn't started yet!", 2000);
            } else {
                showToast("Not your turn!", 2000);
            }
        };
    }
    
    showToast('Waiting for game to start...', 3000);
}

// Make sure DOM is loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}