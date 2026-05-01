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
let templateSlots = [];
let currentTemplateName = '';
let currentTemplateDisplayName = '';
let slotItemsCache = {};
let playerFilledSlots = [];
let itemsLoaded = false;

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
        
        // Host loads items immediately
        loadTemplateItems();
    } else {
        myPlayerName = config.playerName;
        roomCode = config.roomCode;
    }
    
    return true;
}

// Load template items
async function loadTemplateItems() {
    try {
        console.log('Loading template items for:', currentTemplateName);
        
        const slotsResponse = await fetch(`${API_BASE_URL}/dynamic-template/${currentTemplateName}/slots`);
        const slotsData = await slotsResponse.json();
        
        if (slotsData.success) {
            templateSlots = slotsData.slots;
            numRounds = templateSlots.length;
            console.log('Template slots loaded:', templateSlots);
            
            // Initialize playerFilledSlots
            playerFilledSlots = [];
            for (let i = 0; i < numPlayers; i++) {
                playerFilledSlots[i] = [];
            }
            
            // Get items for each slot
            availableItems = [];
            itemsWithScores = {};
            
            for (const slot of templateSlots) {
                const itemsResponse = await fetch(`${API_BASE_URL}/dynamic-items/${currentTemplateName}/${slot.slot_name}`);
                const itemsData = await itemsResponse.json();
                if (itemsData.success) {
                    slotItemsCache[slot.slot_name] = itemsData.items;
                    itemsData.items.forEach(item => {
                        availableItems.push({
                            name: item.item_name,
                            category: slot.slot_name,
                            score: item.score
                        });
                        itemsWithScores[item.item_name] = item.score;
                    });
                    console.log(`Loaded ${itemsData.items.length} items for ${slot.slot_name}`);
                }
            }
            
            itemsLoaded = true;
            console.log('Total available items:', availableItems.length);
            
            // Shuffle available items
            shuffleArray(availableItems);
        }
    } catch (error) {
        console.error('Error loading template:', error);
        showToast('Error loading draft items', 3000);
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
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
    
    // Receive game data from host (for joiners)
    socket.on('gameData', (data) => {
        console.log('Received game data from host:', data);
        templateSlots = data.templateSlots;
        availableItems = data.availableItems;
        itemsWithScores = data.itemsWithScores;
        numRounds = templateSlots.length;
        itemsLoaded = true;
        
        // Initialize playerFilledSlots
        playerFilledSlots = [];
        for (let i = 0; i < numPlayers; i++) {
            playerFilledSlots[i] = [];
        }
        
        renderDraftScreen();
    });
    
    socket.on('draftStarted', (state) => {
        console.log('Draft started!', state);
        
        // If joiner hasn't loaded items yet, they'll get them from the state
        if (!itemsLoaded && state.availableItems) {
            availableItems = state.availableItems;
            itemsWithScores = state.itemsWithScores;
            templateSlots = state.templateSlots;
            numRounds = templateSlots.length;
            itemsLoaded = true;
            
            // Initialize playerFilledSlots
            playerFilledSlots = [];
            for (let i = 0; i < numPlayers; i++) {
                playerFilledSlots[i] = [];
            }
        }
        
        startDraftGame(state);
    });
    
    socket.on('turnChange', (data) => {
        console.log('Turn change:', data);
        isMyTurn = (data.playerName === myPlayerName);
        
        if (isMyTurn) {
            startTimer(data.timeRemaining);
            renderDraftScreen();
            showToast(`🔥 YOUR TURN! Pick any item from an unfilled category! 🔥`, 4000);
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
            
            // Request game data from host
            socket.emit('requestGameData', roomCode);
            
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
        
        // Send game data to all players before starting
        const gameData = {
            templateSlots: templateSlots,
            availableItems: availableItems,
            itemsWithScores: itemsWithScores
        };
        socket.emit('broadcastGameData', { roomCode, gameData });
        
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

function startDraftGame(state) {
    gameStarted = true;
    
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('draftScreen').style.display = 'block';
    document.getElementById('mainTitle').innerHTML = '🎯 DYNAMIC DRAFT';
    document.getElementById('subTitle').innerHTML = `Room: ${roomCode} | ${currentTemplateDisplayName}`;
    
    playersData = state.players;
    numPlayers = state.players.length;
    totalPicks = numPlayers * numRounds;
    playersItems = playersData.map(() => []);
    playerFilledSlots = playersData.map(() => []);
    
    draftOrder = state.draftOrder;
    currentPickIndex = state.currentPickIndex;
    currentRound = draftOrder[currentPickIndex]?.round || 1;
    TIMER_DURATION = state.timerSeconds;
    timeRemaining = TIMER_DURATION;
    
    document.getElementById('categoryTitle').innerHTML = '📦 ' + currentTemplateDisplayName;
    
    renderDraftScreen();
}

function isCategoryAvailableForPlayer(playerIndex, category) {
    return !playerFilledSlots[playerIndex].includes(category);
}

function getAvailableItemsForPlayer(playerIndex) {
    if (!availableItems || availableItems.length === 0) return [];
    return availableItems.filter(item => 
        isCategoryAvailableForPlayer(playerIndex, item.category)
    );
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
        roundIndicator.textContent = isDraftComplete 
            ? '🏁 Draft Complete! 🏁'
            : `Round ${currentRound} of ${numRounds} | Pick ${currentPickIndex + 1} of ${totalPicks}`;
    }
    
    // Get items available for the current player
    let itemsToShow = [];
    if (!isDraftComplete && currentPlayerIndex !== -1 && itemsLoaded) {
        itemsToShow = getAvailableItemsForPlayer(currentPlayerIndex);
    }
    
    if (poolCountSpan) {
        poolCountSpan.innerText = `${itemsToShow.length} items available`;
    }
    
    // Render available items with category labels
    if (availableContainer) {
        if (!itemsLoaded) {
            availableContainer.innerHTML = '<div class="empty-state">⏳ Loading items...</div>';
        } else if (itemsToShow.length === 0 || isDraftComplete) {
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
                        <span class="item-category">${getSlotIcon(item.category)} ${item.category}</span>
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
    
    // Render players with their filled categories
    if (playersContainer) {
        playersContainer.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const isCurrentTurn = (!isDraftComplete && currentPlayerIndex === i);
            const playerName = getPlayerName(i);
            const playerFilled = playerFilledSlots[i] || [];
            
            const playerCol = document.createElement('div');
            playerCol.className = `player-col ${isCurrentTurn ? 'highlight-turn' : ''}`;
            
            // Build slots HTML showing which categories are filled
            let slotsHtml = '<div class="player-slots">';
            templateSlots.forEach(slot => {
                const isFilled = playerFilled.includes(slot.slot_name);
                const slotClass = isFilled ? 'slot-filled' : 'slot-empty';
                slotsHtml += `<div class="slot-item ${slotClass}">${getSlotIcon(slot.slot_name)} ${slot.slot_name} ${isFilled ? '✓' : '○'}</div>`;
            });
            slotsHtml += '</div>';
            
            // Build items HTML
            let itemsHtml = '<div class="drafted-list">';
            if (!playersItems[i] || playersItems[i].length === 0) {
                itemsHtml += '<div class="empty-state">✨ No picks yet</div>';
            } else {
                playersItems[i].forEach((item, idx) => {
                    itemsHtml += `
                        <div class="drafted-item">
                            <span>${idx + 1}. ${escapeHtml(item.name)}</span>
                            <span class="item-slot">${getSlotIcon(item.category)}</span>
                        </div>
                    `;
                });
            }
            itemsHtml += '</div>';
            
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(i)} ${escapeHtml(playerName)}</div>
                </div>
                ${slotsHtml}
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
                turnMessageSpan.innerHTML = `🎯 YOUR TURN! Pick any item from a category you haven't drafted yet! 🎯`;
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
    
    if (!socket || !socket.connected) {
        showToast("Not connected to server!", 2000);
        return;
    }
    
    // Find current player index
    const currentPlayerIndex = getCurrentPlayerIndex();
    
    // Check if player already has an item from this category
    if (!isCategoryAvailableForPlayer(currentPlayerIndex, item.category)) {
        showToast(`You already drafted a ${item.category}! Choose a different category.`, 3000);
        return;
    }
    
    console.log('Making pick:', item);
    socket.emit('makePick', { 
        roomCode: roomCode, 
        itemName: item.name,
        category: item.category,
        score: item.score
    });
}

function applyPick(data) {
    console.log('Applying pick:', data);
    
    // Find and remove item from available items
    const itemIndex = availableItems.findIndex(i => i.name === data.item);
    if (itemIndex !== -1) {
        availableItems.splice(itemIndex, 1);
    }
    
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
        if (!playersItems[playerIndex]) playersItems[playerIndex] = [];
        playersItems[playerIndex].push({
            name: data.item,
            category: data.category,
            score: data.score || 0
        });
        
        // Mark this category as filled for the player
        if (!playerFilledSlots[playerIndex]) {
            playerFilledSlots[playerIndex] = [];
        }
        if (!playerFilledSlots[playerIndex].includes(data.category)) {
            playerFilledSlots[playerIndex].push(data.category);
        }
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

function getSlotIcon(slotName) {
    const icons = {
        'Main': '🍔', 'Side': '🍟', 'Drink': '🥤', 'Breakfast': '🍳', 'Dessert': '🍰',
        'Action': '💥', 'Comedy': '😂', 'Snack': '🍿', 'Gear': '🏖️', 'Activity': '⚽'
    };
    return icons[slotName] || '📦';
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
    console.log('Initializing dynamic draft page');
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
        if (isMyTurn && availableItems.length > 0) {
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