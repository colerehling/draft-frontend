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
let currentSlotIndex = 0;
let activeFilter = null;
let slotItemsCache = {};
let currentTemplateName = '';
let currentTemplateDisplayName = '';

// Load setup from localStorage
function loadSetup() {
    const setup = localStorage.getItem('draftSetup');
    if (!setup) {
        window.location.href = 'index.html';
        return false;
    }
    
    const config = JSON.parse(setup);
    isHost = config.isHost;
    
    if (isHost) {
        myPlayerName = config.hostName || 'Host';
        numPlayers = config.numPlayers;
        draftOrderType = config.draftType || 'snake';
        TIMER_DURATION = config.timerMinutes * 60;
        timeRemaining = TIMER_DURATION;
        currentTemplateName = config.templateName;
        currentTemplateDisplayName = config.templateDisplayName;
        
        localStorage.setItem('gameConfig', JSON.stringify({
            templateName: currentTemplateName,
            templateDisplayName: currentTemplateDisplayName,
            numPlayers: numPlayers,
            timerMinutes: config.timerMinutes,
            hostName: myPlayerName,
            draftMode: 'dynamic',
            draftType: draftOrderType
        }));
    } else {
        myPlayerName = config.playerName;
        roomCode = config.roomCode;
    }
    
    return true;
}

function initSocket() {
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        path: '/socket.io/'
    });
    
    setupSocketListeners();
}

function setupSocketListeners() {
    socket.on('connect', () => {
    console.log('Socket connected successfully! ID:', socket.id);
    document.getElementById('connectionStatus').innerHTML = '🟢 Connected';
    document.getElementById('connectionStatus').style.color = '#10b981';
    localStorage.setItem('mySocketId', socket.id);
    
    if (isHost) {
        createGameRoom();
    } else {
        joinGameRoom();
    }
});

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        document.getElementById('connectionStatus').innerHTML = '🔴 Disconnected';
        document.getElementById('connectionStatus').style.color = '#ef4444';
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        document.getElementById('connectionStatus').innerHTML = '🔴 Connection Failed';
        document.getElementById('connectionStatus').style.color = '#ef4444';
        showToast('Connection to server failed. Please refresh.', 5000);
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
    
    socket.on('draftStarted', async (state) => {
        console.log('Draft started!', state);
        await loadDynamicItems();
        startDraftGame(state);
    });
    
    socket.on('turnChange', (data) => {
        isMyTurn = (data.playerName === myPlayerName);
        
        if (isMyTurn) {
            startTimer(data.timeRemaining);
            renderDraftScreen();
            showToast(`🔥 YOUR TURN! Draft a ${templateSlots[currentSlotIndex]?.slot_name || 'item'}! 🔥`, 4000);
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
    
    if (playerCountSpan) playerCountSpan.textContent = playersData.length;
}

async function loadDynamicItems() {
    const gameConfig = JSON.parse(localStorage.getItem('gameConfig'));
    const templateName = gameConfig.templateName;
    currentTemplateName = templateName;
    
    try {
        const slotsResponse = await fetch(`${API_BASE_URL}/dynamic-template/${templateName}/slots`);
        const slotsData = await slotsResponse.json();
        
        if (slotsData.success) {
            templateSlots = slotsData.slots;
            numRounds = templateSlots.length;
            
            for (const slot of templateSlots) {
                const itemsResponse = await fetch(`${API_BASE_URL}/dynamic-items/${templateName}/${slot.slot_name}`);
                const itemsData = await itemsResponse.json();
                
                if (itemsData.success) {
                    slotItemsCache[slot.slot_name] = itemsData.items;
                    itemsData.items.forEach(item => {
                        itemsWithScores[item.item_name] = item.score;
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error loading dynamic items:', error);
        showToast('Error loading draft items', 3000);
    }
}

function flattenAvailableItems() {
    if (currentSlotIndex < templateSlots.length) {
        const currentSlot = templateSlots[currentSlotIndex];
        const items = slotItemsCache[currentSlot.slot_name] || [];
        return items.map(item => item.item_name);
    }
    return [];
}

function updateFilterButtons() {
    const filterContainer = document.getElementById('filterButtons');
    if (!filterContainer) return;
    
    filterContainer.innerHTML = '';
    
    templateSlots.forEach(slot => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${activeFilter === slot.slot_name ? 'active' : ''}`;
        btn.textContent = `${getSlotIcon(slot.slot_name)} ${slot.slot_name}`;
        btn.onclick = () => {
            if (activeFilter === slot.slot_name) {
                activeFilter = null;
            } else {
                activeFilter = slot.slot_name;
            }
            renderDraftScreen();
            updateFilterButtons();
        };
        filterContainer.appendChild(btn);
    });
}

function getSlotIcon(slotName) {
    const icons = {
        'Main': '🍔', 'Side': '🍟', 'Drink': '🥤', 'Breakfast': '🍳', 'Dessert': '🍰',
        'Action': '💥', 'Comedy': '😂', 'Snack': '🍿', 'Gear': '🏖️', 'Activity': '⚽'
    };
    return icons[slotName] || '📦';
}

function getFilteredItems() {
    if (activeFilter && slotItemsCache[activeFilter]) {
        return slotItemsCache[activeFilter].map(item => item.item_name);
    }
    
    if (currentSlotIndex < templateSlots.length) {
        const currentSlot = templateSlots[currentSlotIndex];
        const items = slotItemsCache[currentSlot.slot_name] || [];
        return items.map(item => item.item_name);
    }
    
    return availableItems;
}

function startDraftGame(state) {
    gameStarted = true;
    
    // Hide lobby, show draft
    const lobbyScreen = document.getElementById('lobbyScreen');
    const draftScreen = document.getElementById('draftScreen');
    
    if (lobbyScreen) lobbyScreen.style.display = 'none';
    if (draftScreen) draftScreen.style.display = 'block';
    
    const gameConfig = JSON.parse(localStorage.getItem('gameConfig'));
    
    playersData = state.players;
    numPlayers = state.players.length;
    numRounds = templateSlots.length;
    totalPicks = numPlayers * numRounds;
    draftOrder = state.draftOrder;
    playersItems = playersData.map(() => []);
    availableItems = flattenAvailableItems();
    itemsWithScores = state.itemsWithScores || itemsWithScores;
    currentPickIndex = state.currentPickIndex || 0;
    currentSlotIndex = 0;
    
    const currentPick = draftOrder[currentPickIndex];
    if (currentPick) currentRound = currentPick.round;
    
    if (state.timerSeconds) {
        TIMER_DURATION = state.timerSeconds;
        timeRemaining = TIMER_DURATION;
    }
    
    // Set titles
    const mainTitle = document.getElementById('mainTitle');
    const subTitle = document.getElementById('subTitle');
    const categoryTitle = document.getElementById('categoryTitle');
    const currentSlotName = document.getElementById('currentSlotName');
    
    if (mainTitle) mainTitle.innerHTML = '🎯 DYNAMIC DRAFT';
    if (subTitle) subTitle.innerHTML = `Room: ${roomCode} | ${gameConfig.templateDisplayName}`;
    if (categoryTitle) categoryTitle.innerHTML = '📦 ' + gameConfig.templateDisplayName;
    if (currentSlotName && templateSlots[0]) currentSlotName.innerHTML = templateSlots[0].slot_name;
    
    renderDraftScreen();
}

function renderDraftScreen() {
    const playersContainer = document.getElementById('playersContainer');
    const availableContainer = document.getElementById('availableList');
    const poolCountSpan = document.getElementById('poolCount');
    const activePlayerNameSpan = document.getElementById('activePlayerName');
    const turnMessageSpan = document.getElementById('turnMessage');
    const roundIndicator = document.getElementById('roundIndicator');
    const currentSlotNameSpan = document.getElementById('currentSlotName');
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isDraftComplete = currentPickIndex >= draftOrder.length;
    
    // Update current slot display
    if (currentSlotNameSpan && templateSlots[currentSlotIndex]) {
        currentSlotNameSpan.innerHTML = templateSlots[currentSlotIndex].slot_name;
    }
    
    if (roundIndicator) {
        if (isDraftComplete) {
            roundIndicator.textContent = '🏁 Draft Complete! 🏁';
        } else {
            const currentSlot = templateSlots[currentSlotIndex];
            roundIndicator.innerHTML = `Round ${currentRound} of ${numRounds} | 🎯 ${currentSlot ? currentSlot.slot_name : 'Drafting'} | Pick ${currentPickIndex + 1} of ${totalPicks}`;
        }
    }
    
    if (poolCountSpan) {
        const itemsToShow = getFilteredItems();
        poolCountSpan.innerText = `${itemsToShow.length} items (${totalPicks - currentPickIndex} picks left)`;
    }
    
    // Render available items
    if (availableContainer) {
        const itemsToShow = getFilteredItems();
        
        if (itemsToShow.length === 0 || isDraftComplete) {
            availableContainer.innerHTML = '<div class="empty-state">🏁 Draft complete!</div>';
        } else {
            availableContainer.innerHTML = '';
            itemsToShow.forEach(item => {
                const canDraft = gameStarted && isMyTurn;
                const card = document.createElement('div');
                card.className = 'draft-card';
                card.innerHTML = `
                    <div class="item-info">
                        <span class="item-name">${escapeHtml(item)}</span>
                        ${itemsWithScores[item] ? `<span class="item-score">⭐ ${itemsWithScores[item]}</span>` : ''}
                    </div>
                    <button class="draft-btn ${canDraft ? 'active-turn' : ''}" ${!canDraft ? 'disabled' : ''}>
                        ${canDraft ? '⚡ Draft' : '🔒 Locked'}
                    </button>
                `;
                const btn = card.querySelector('.draft-btn');
                if (canDraft) btn.onclick = () => makePick(item);
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
            
            let slotsHtml = '<div class="player-slots">';
            templateSlots.forEach((slot, idx) => {
                const isFilled = playersItems[i].some(item => item.slot === slot.slot_name);
                const isCurrentSlot = idx === currentSlotIndex && isCurrentTurn && !isDraftComplete;
                const slotClass = isFilled ? 'slot-filled' : (isCurrentSlot ? 'slot-current' : 'slot-empty');
                slotsHtml += `<div class="slot-item ${slotClass}">${getSlotIcon(slot.slot_name)} ${slot.slot_name} ${isFilled ? '✓' : '○'}</div>`;
            });
            slotsHtml += '</div>';
            
            let itemsHtml = '<div class="drafted-list">';
            if (playersItems[i].length === 0) {
                itemsHtml += '<div class="empty-state">✨ No picks yet</div>';
            } else {
                playersItems[i].forEach((item, idx) => {
                    itemsHtml += `
                        <div class="drafted-item">
                            <span>${idx + 1}. ${escapeHtml(item.name)}</span>
                            <span class="item-slot">${getSlotIcon(item.slot)}</span>
                            ${item.score ? `<span class="item-score-small">⭐${item.score}</span>` : ''}
                        </div>
                    `;
                });
            }
            itemsHtml += '</div>';
            
            playerCol.innerHTML = `
                <div class="player-header">
                    <div class="player-name">${getPlayerIcon(i)} ${escapeHtml(playerName)}</div>
                    <div class="player-score">⭐ ${playerTotalScore}</div>
                </div>
                ${slotsHtml}
                ${itemsHtml}
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
            if (gameStarted && isMyTurn) {
                turnMessageSpan.innerHTML = `🎯 YOUR TURN! Draft a ${templateSlots[currentSlotIndex]?.slot_name || 'item'}! 🎯`;
                turnMessageSpan.style.color = '#facc15';
            } else {
                turnMessageSpan.innerHTML = `${currentPlayerName}'s turn...`;
                turnMessageSpan.style.color = '#94a3b8';
            }
        }
    }
    
    // Filter bar
    const filterBar = document.getElementById('filterBar');
    if (filterBar) {
        filterBar.style.display = (gameStarted && !isDraftComplete && isMyTurn) ? 'flex' : 'none';
    }
    updateFilterButtons();
}

function makePick(item) {
    if (!gameStarted) {
        showToast("Game hasn't started yet!", 2000);
        return;
    }
    
    if (!isMyTurn) {
        showToast("Not your turn!", 2000);
        return;
    }
    
    if (!socket || !socket.connected) {
        showToast("Not connected to server!", 2000);
        return;
    }
    
    // Validate the item belongs to the current slot
    if (currentSlotIndex < templateSlots.length) {
        const currentSlot = templateSlots[currentSlotIndex];
        const validItems = slotItemsCache[currentSlot.slot_name] || [];
        const isValid = validItems.some(i => i.item_name === item);
        
        if (!isValid) {
            showToast(`Please select a ${currentSlot.slot_name} item!`, 2000);
            return;
        }
    }
    
    socket.emit('makePick', { roomCode: roomCode, itemName: item });
}

function applyPick(data) {
    const itemIndex = availableItems.indexOf(data.item);
    if (itemIndex !== -1) availableItems.splice(itemIndex, 1);
    
    let playerIndex = -1;
    for (let i = 0; i < playersData.length; i++) {
        if (playersData[i].name === data.playerName) {
            playerIndex = i;
            break;
        }
    }
    
    if (playerIndex !== -1) {
        const pickData = {
            name: data.item,
            score: data.score || itemsWithScores[data.item] || 0,
            slot: templateSlots[currentSlotIndex]?.slot_name
        };
        playersItems[playerIndex].push(pickData);
        currentSlotIndex++;
    }
    
    currentPickIndex++;
    if (currentPickIndex < draftOrder.length) currentRound = draftOrder[currentPickIndex].round;
    availableItems = flattenAvailableItems();
    
    renderDraftScreen();
}

function getCurrentPlayerIndex() {
    if (currentPickIndex >= draftOrder.length) return -1;
    return draftOrder[currentPickIndex].playerIndex;
}

function getPlayerName(playerIndex) {
    return playersData && playersData[playerIndex] ? playersData[playerIndex].name : 'Player ' + (playerIndex + 1);
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
        if (timeRemaining <= 10) timerDisplayEl.style.color = '#ef4444';
        else if (timeRemaining <= 30) timerDisplayEl.style.color = '#f97316';
        else timerDisplayEl.style.color = '#facc15';
    }
    
    if (timerBarFillEl && TIMER_DURATION > 0) {
        timerBarFillEl.style.width = Math.max(0, (timeRemaining / TIMER_DURATION) * 100) + '%';
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
        setTimeout(() => toastEl.style.opacity = '0', duration);
    }
}

// Initialize
function init() {
    if (!loadSetup()) return;
    
    document.getElementById('lobbyScreen').style.display = 'block';
    document.getElementById('draftScreen').style.display = 'none';
    
    initSocket();
    
    document.getElementById('backToLobbyBtn').onclick = () => window.location.href = 'index.html';
    document.getElementById('resetGameBtn').onclick = () => {
        if (confirm('Reset the current draft?')) window.location.reload();
    };
    document.getElementById('forceEndTurnBtn').onclick = () => {
        if (isMyTurn && availableItems.length > 0) {
            const itemsToPick = getFilteredItems();
            if (itemsToPick.length > 0) {
                const randomItem = itemsToPick[Math.floor(Math.random() * itemsToPick.length)];
                makePick(randomItem);
            }
        }
    };
    
    showToast('Waiting for game to start...', 3000);
}

document.addEventListener('DOMContentLoaded', init);