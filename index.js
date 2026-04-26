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
console.log(`Socket URL: ${SOCKET_URL}`);

// Socket.IO connection
let socket = null;
let isHost = false;
let currentRoomCode = null;
let gameMode = 'local';
let playersAreReady = false;

// Game configuration variables
let numPlayers = 2;
let numRounds = 5;
let timerMinutes = 3;
let selectedCategory = null;
let selectedCategoryName = null;
let selectedCategoryCount = 0;
let draftType = 'snake';

// Host settings variables
let hostNumPlayers = 2;
let hostNumRounds = 5;
let hostTimerMinutes = 3;
let hostSelectedCategory = null;
let hostSelectedCategoryName = null;
let hostSelectedCategoryCount = 0;
let hostDraftType = 'snake';

// DOM Elements
const hostJoinScreen = document.getElementById('hostJoinScreen');
const hostSettingsScreen = document.getElementById('hostSettingsScreen');
const joinSettingsScreen = document.getElementById('joinSettingsScreen');
const categoryScreen = document.getElementById('categoryScreen');
const settingsScreen = document.getElementById('settingsScreen');
const waitingRoom = document.getElementById('waitingRoom');

const hostOption = document.getElementById('hostOption');
const joinOption = document.getElementById('joinOption');
const backToHostJoinFromSettings = document.getElementById('backToHostJoinFromSettings');
const backToHostJoinJoinBtn = document.getElementById('backToHostJoinJoinBtn');

// Host Settings Elements
const decPlayersHost = document.getElementById('decPlayersHost');
const incPlayersHost = document.getElementById('incPlayersHost');
const numPlayersHostSpan = document.getElementById('numPlayersHost');
const decRoundsHost = document.getElementById('decRoundsHost');
const incRoundsHost = document.getElementById('incRoundsHost');
const numRoundsHostSpan = document.getElementById('numRoundsHost');
const decTimeHost = document.getElementById('decTimeHost');
const incTimeHost = document.getElementById('incTimeHost');
const timerMinutesHostSpan = document.getElementById('timerMinutesHost');
const categoryGridHost = document.getElementById('categoryGridHost');
const selectedCategoryDisplay = document.getElementById('selectedCategoryDisplay');
const selectedCategoryNameSpan = document.getElementById('selectedCategoryNameHost');
const clearCategoryBtn = document.getElementById('clearCategoryBtn');
const createLobbyBtn = document.getElementById('createLobbyBtn');

// Join Settings Elements
const roomCodeInput = document.getElementById('roomCodeInput');
const playerNameInput = document.getElementById('playerNameInput');
const joinGameBtn = document.getElementById('joinGameBtn');

// Waiting Room Elements
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyRoomCodeBtn = document.getElementById('copyRoomCodeBtn');
const playersListDiv = document.getElementById('playersList');
const playerCountSpan = document.getElementById('playerCount');
const maxPlayersSpan = document.getElementById('maxPlayers');
const cancelHostGameBtn = document.getElementById('cancelHostGameBtn');
let startGameBtn = document.getElementById('startGameBtn');
const readyStatusDiv = document.getElementById('readyStatus');

// ==================== HELPER FUNCTIONS ====================

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

function updateDbStatus(message, color = '#facc15') {
    const statusEl = document.getElementById('dbStatus');
    if (statusEl) {
        statusEl.innerHTML = message;
        statusEl.style.color = color;
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

function formatCategoryName(tableName) {
    return tableName.replace(/_/g, ' ').split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

function getCategoryIcon(tableName) {
    const iconMap = {
        'ice_cream_flavors': '🍦',
        'pizza_toppings': '🍕',
        'movie_genres': '🎬',
        'vacation_destinations': '✈️'
    };
    return iconMap[tableName] || '📦';
}

// ==================== UNIFIED HOST SETTINGS ====================

function getHostDraftType() {
    const radios = document.querySelectorAll('input[name="draftTypeHost"]');
    for (let radio of radios) {
        if (radio.checked) return radio.value;
    }
    return 'snake';
}

function updateHostSummary() {
    const summaryPlayers = document.getElementById('summaryPlayers');
    const summaryCategory = document.getElementById('summaryCategory');
    const summaryDraftType = document.getElementById('summaryDraftType');
    const summaryRounds = document.getElementById('summaryRounds');
    const summaryTimer = document.getElementById('summaryTimer');
    const summaryTotalPicks = document.getElementById('summaryTotalPicks');
    
    if (summaryPlayers) summaryPlayers.textContent = hostNumPlayers;
    if (summaryRounds) summaryRounds.textContent = hostNumRounds;
    if (summaryTimer) summaryTimer.textContent = hostTimerMinutes + ' min';
    if (summaryDraftType) summaryDraftType.textContent = hostDraftType === 'snake' ? '🐍 Snake' : '📋 Regular';
    if (summaryCategory) summaryCategory.textContent = hostSelectedCategoryName || 'Not selected';
    
    const totalPicks = hostNumPlayers * hostNumRounds;
    if (summaryTotalPicks) summaryTotalPicks.textContent = totalPicks;
}

async function loadCategoriesForHost() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.success && data.categories) {
            displayCategoriesInHostGrid(data.categories);
            updateDbStatus('✅ Ready', '#10b981');
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        updateDbStatus('❌ Connection Error', '#ef4444');
        showToast(`Could not connect to server: ${error.message}`, 5000);
    }
}

function displayCategoriesInHostGrid(categories) {
    if (!categoryGridHost) return;
    
    categoryGridHost.innerHTML = '';
    
    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card-small';
        card.setAttribute('data-category', cat.table_name);
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'category-icon-small';
        iconSpan.textContent = getCategoryIcon(cat.table_name);
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'category-name-small';
        nameSpan.textContent = formatCategoryName(cat.table_name);
        
        const countSpan = document.createElement('span');
        countSpan.className = 'category-count-small';
        countSpan.textContent = `${cat.item_count} items`;
        
        card.appendChild(iconSpan);
        card.appendChild(nameSpan);
        card.appendChild(countSpan);
        
        card.addEventListener('click', () => {
            document.querySelectorAll('.category-card-small').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            
            hostSelectedCategory = cat.table_name;
            hostSelectedCategoryName = formatCategoryName(cat.table_name);
            hostSelectedCategoryCount = cat.item_count;
            
            if (selectedCategoryDisplay) selectedCategoryDisplay.style.display = 'flex';
            if (selectedCategoryNameSpan) selectedCategoryNameSpan.textContent = hostSelectedCategoryName;
            
            updateHostSummary();
            showToast(`Selected: ${hostSelectedCategoryName}`, 1500);
        });
        
        categoryGridHost.appendChild(card);
    });
}

function setupClearCategoryBtn() {
    if (clearCategoryBtn) {
        clearCategoryBtn.addEventListener('click', () => {
            hostSelectedCategory = null;
            hostSelectedCategoryName = null;
            hostSelectedCategoryCount = 0;
            
            if (selectedCategoryDisplay) selectedCategoryDisplay.style.display = 'none';
            document.querySelectorAll('.category-card-small').forEach(c => c.classList.remove('selected'));
            updateHostSummary();
            showToast('Category cleared', 1500);
        });
    }
}

function createLobby() {
    if (!hostSelectedCategory) {
        showToast('Please select a category', 3000);
        return;
    }
    
    const totalPicks = hostNumPlayers * hostNumRounds;
    if (totalPicks > hostSelectedCategoryCount) {
        showToast(`⚠️ Need ${totalPicks} items but only ${hostSelectedCategoryCount} available. Reduce players or rounds.`, 4000);
        return;
    }
    
    // Set global game config
    numPlayers = hostNumPlayers;
    selectedCategory = hostSelectedCategory;
    selectedCategoryName = hostSelectedCategoryName;
    selectedCategoryCount = hostSelectedCategoryCount;
    numRounds = hostNumRounds;
    timerMinutes = hostTimerMinutes;
    draftType = getHostDraftType();
    
    // Initialize socket and create game room
    initSocketConnection();
}

// ==================== SOCKET.IO FUNCTIONS ====================

function initSocketConnection() {
    console.log('Creating socket connection to:', SOCKET_URL);
    
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    socket.on('connect', () => {
        console.log('Socket connected! ID:', socket.id);
        showToast('Connected to game server!', 2000);
        
        if (isHost) {
            // Host creates the game room
            createGameRoom();
        }
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket error:', error);
        showToast('Error connecting to game server', 5000);
    });
    
    socket.on('playerJoined', (players) => {
        console.log('Player joined:', players);
        updatePlayersList(players);
    });
    
    socket.on('playerLeft', (players) => {
        console.log('Player left:', players);
        updatePlayersList(players);
        showToast('A player left the game', 2000);
        if (isHost) {
            playersAreReady = false;
            if (startGameBtn) startGameBtn.style.display = 'none';
        }
    });
    
    socket.on('playerReadyUpdate', (players) => {
        console.log('Player ready update:', players);
        updatePlayersList(players);
        
        if (isHost) {
            const allReady = players.every(p => p.isReady === true);
            const fullPlayers = players.length === numPlayers;
            
            console.log('All ready?', allReady, 'Full?', fullPlayers);
            
            if (allReady && fullPlayers) {
                playersAreReady = true;
                if (startGameBtn) {
                    startGameBtn.style.display = 'block';
                    startGameBtn.disabled = false;
                    startGameBtn.textContent = '▶ Start Game';
                    showToast('All players ready! Click Start Game!', 3000);
                }
            } else {
                playersAreReady = false;
                if (startGameBtn) startGameBtn.style.display = 'none';
            }
        }
    });
    
    socket.on('allPlayersReady', () => {
        console.log('All players ready event received');
        if (isHost && startGameBtn) {
            startGameBtn.style.display = 'block';
            startGameBtn.disabled = false;
            playersAreReady = true;
        }
    });
    
    socket.on('draftStarted', (draftState) => {
        console.log('Draft started!', draftState);
        localStorage.setItem('multiplayerDraft', JSON.stringify({
            isMultiplayer: true,
            roomCode: currentRoomCode,
            isHost: isHost,
            draftState: draftState
        }));
        window.location.href = 'draft.html';
    });
    
    socket.on('startDraftError', (error) => {
        console.error('Start draft error:', error);
        showToast(error, 3000);
        if (startGameBtn) {
            startGameBtn.disabled = false;
            startGameBtn.textContent = '▶ Start Game';
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showToast(error, 3000);
    });
}

function createGameRoom() {
    const gameConfig = {
        numPlayers: numPlayers,
        category: selectedCategory,
        categoryName: selectedCategoryName,
        numRounds: numRounds,
        timerMinutes: timerMinutes,
        draftType: draftType,
        playerName: 'Host'
    };
    
    console.log('Creating game with config:', gameConfig);
    
    socket.emit('createGame', gameConfig, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            console.log('Game created! Room code:', currentRoomCode);
            
            if (roomCodeDisplay) roomCodeDisplay.textContent = currentRoomCode;
            if (maxPlayersSpan) maxPlayersSpan.textContent = numPlayers;
            
            hostSettingsScreen.style.display = 'none';
            waitingRoom.style.display = 'block';
            
            if (startGameBtn) startGameBtn.style.display = 'none';
            if (readyStatusDiv) readyStatusDiv.style.display = 'none';
            
            const waitingTitle = document.querySelector('#waitingRoom .config-header h2');
            if (waitingTitle) waitingTitle.innerHTML = '👑 You are the Host';
            
            const waitingSubtitle = document.querySelector('#waitingRoom .config-header p');
            if (waitingSubtitle) {
                waitingSubtitle.innerHTML = `Share code: ${currentRoomCode} with up to ${numPlayers - 1} friends`;
            }
            
            setupWaitingRoomButtons();
        } else {
            console.error('Failed to create game:', response);
            showToast('Failed to create game. Please try again.', 3000);
        }
    });
}

function setupWaitingRoomButtons() {
    if (copyRoomCodeBtn) {
        const newCopyBtn = copyRoomCodeBtn.cloneNode(true);
        copyRoomCodeBtn.parentNode.replaceChild(newCopyBtn, copyRoomCodeBtn);
        newCopyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(currentRoomCode);
            showToast('Room code copied!', 1500);
        });
    }
    
    if (cancelHostGameBtn) {
        const newCancelBtn = cancelHostGameBtn.cloneNode(true);
        cancelHostGameBtn.parentNode.replaceChild(newCancelBtn, cancelHostGameBtn);
        newCancelBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }
    
    if (startGameBtn) {
        const newStartBtn = startGameBtn.cloneNode(true);
        startGameBtn.parentNode.replaceChild(newStartBtn, startGameBtn);
        startGameBtn = newStartBtn;
        startGameBtn.addEventListener('click', () => {
            console.log('Start Game button clicked!');
            console.log('Room code:', currentRoomCode);
            console.log('Players ready?', playersAreReady);
            console.log('Socket connected?', socket && socket.connected);
            
            if (!socket || !socket.connected) {
                showToast("Not connected to server!", 2000);
                return;
            }
            
            if (!playersAreReady) {
                showToast('Waiting for all players to ready up...', 2000);
                return;
            }
            
            console.log('Emitting startDraft event for room:', currentRoomCode);
            socket.emit('startDraft', currentRoomCode);
            startGameBtn.disabled = true;
            startGameBtn.textContent = 'Starting...';
        });
    }
}

function updatePlayersList(players) {
    if (!playersListDiv) return;
    
    playersListDiv.innerHTML = '';
    players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        playerDiv.innerHTML = `
            <span>${getPlayerIcon(index)} ${escapeHtml(player.name)}</span>
            <span class="ready-status" style="color: ${player.isReady ? '#22c55e' : '#facc15'}">
                ${player.isReady ? '✓ Ready' : '⏳ Waiting...'}
            </span>
        `;
        playersListDiv.appendChild(playerDiv);
    });
    
    if (playerCountSpan) playerCountSpan.textContent = players.length;
}

function showWaitingRoomForJoiner() {
    if (readyStatusDiv) {
        readyStatusDiv.style.display = 'block';
        
        const readyBtn = document.createElement('button');
        readyBtn.id = 'readyBtn';
        readyBtn.className = 'primary-btn';
        readyBtn.textContent = '✅ Ready Up';
        readyBtn.addEventListener('click', () => {
            console.log('Player ready button clicked for room:', currentRoomCode);
            socket.emit('playerReady', currentRoomCode);
            readyBtn.disabled = true;
            readyBtn.textContent = '✓ Ready!';
            showToast('You are ready! Waiting for host...', 2000);
        });
        readyStatusDiv.innerHTML = '';
        readyStatusDiv.appendChild(readyBtn);
        
        const hint = document.createElement('p');
        hint.className = 'ready-hint';
        hint.textContent = 'Click ready when you\'re ready to start!';
        readyStatusDiv.appendChild(hint);
    }
    
    if (startGameBtn) startGameBtn.style.display = 'none';
}

// ==================== EVENT LISTENERS ====================

if (hostOption) {
    hostOption.addEventListener('click', () => {
        isHost = true;
        gameMode = 'online';
        hostJoinScreen.style.display = 'none';
        hostSettingsScreen.style.display = 'block';
        
        // Reset host settings
        hostNumPlayers = 2;
        hostNumRounds = 5;
        hostTimerMinutes = 3;
        hostSelectedCategory = null;
        hostSelectedCategoryName = null;
        hostSelectedCategoryCount = 0;
        hostDraftType = 'snake';
        
        if (numPlayersHostSpan) numPlayersHostSpan.textContent = hostNumPlayers;
        if (numRoundsHostSpan) numRoundsHostSpan.textContent = hostNumRounds;
        if (timerMinutesHostSpan) timerMinutesHostSpan.textContent = hostTimerMinutes;
        
        const snakeRadio = document.querySelector('input[name="draftTypeHost"][value="snake"]');
        if (snakeRadio) snakeRadio.checked = true;
        
        if (selectedCategoryDisplay) selectedCategoryDisplay.style.display = 'none';
        document.querySelectorAll('.category-card-small').forEach(c => c.classList.remove('selected'));
        
        updateHostSummary();
        loadCategoriesForHost();
        setupClearCategoryBtn();
    });
}

if (joinOption) {
    joinOption.addEventListener('click', () => {
        isHost = false;
        gameMode = 'online';
        hostJoinScreen.style.display = 'none';
        joinSettingsScreen.style.display = 'block';
    });
}

if (backToHostJoinFromSettings) {
    backToHostJoinFromSettings.addEventListener('click', () => {
        hostSettingsScreen.style.display = 'none';
        hostJoinScreen.style.display = 'block';
    });
}

if (backToHostJoinJoinBtn) {
    backToHostJoinJoinBtn.addEventListener('click', () => {
        joinSettingsScreen.style.display = 'none';
        hostJoinScreen.style.display = 'block';
    });
}

if (decPlayersHost) {
    decPlayersHost.addEventListener('click', () => {
        if (hostNumPlayers > 2) {
            hostNumPlayers--;
            if (numPlayersHostSpan) numPlayersHostSpan.textContent = hostNumPlayers;
            updateHostSummary();
        }
    });
}

if (incPlayersHost) {
    incPlayersHost.addEventListener('click', () => {
        if (hostNumPlayers < 8) {
            hostNumPlayers++;
            if (numPlayersHostSpan) numPlayersHostSpan.textContent = hostNumPlayers;
            updateHostSummary();
        }
    });
}

if (decRoundsHost) {
    decRoundsHost.addEventListener('click', () => {
        if (hostNumRounds > 3) {
            hostNumRounds--;
            if (numRoundsHostSpan) numRoundsHostSpan.textContent = hostNumRounds;
            updateHostSummary();
        }
    });
}

if (incRoundsHost) {
    incRoundsHost.addEventListener('click', () => {
        if (hostNumRounds < 10) {
            hostNumRounds++;
            if (numRoundsHostSpan) numRoundsHostSpan.textContent = hostNumRounds;
            updateHostSummary();
        }
    });
}

if (decTimeHost) {
    decTimeHost.addEventListener('click', () => {
        if (hostTimerMinutes > 1) {
            hostTimerMinutes--;
            if (timerMinutesHostSpan) timerMinutesHostSpan.textContent = hostTimerMinutes;
            updateHostSummary();
        }
    });
}

if (incTimeHost) {
    incTimeHost.addEventListener('click', () => {
        if (hostTimerMinutes < 5) {
            hostTimerMinutes++;
            if (timerMinutesHostSpan) timerMinutesHostSpan.textContent = hostTimerMinutes;
            updateHostSummary();
        }
    });
}

document.querySelectorAll('input[name="draftTypeHost"]').forEach(radio => {
    radio.addEventListener('change', () => {
        hostDraftType = getHostDraftType();
        updateHostSummary();
    });
});

if (createLobbyBtn) {
    createLobbyBtn.addEventListener('click', createLobby);
}

if (joinGameBtn) {
    joinGameBtn.addEventListener('click', () => {
        const roomCode = roomCodeInput ? roomCodeInput.value.toUpperCase() : '';
        const playerName = playerNameInput ? playerNameInput.value.trim() : '';
        
        if (!roomCode || roomCode.length !== 6) {
            showToast('Enter valid 6-character code', 3000);
            return;
        }
        if (!playerName) {
            showToast('Enter your name', 3000);
            return;
        }
        
        // Initialize socket and join
        socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            withCredentials: true
        });
        
        socket.on('connect', () => {
            console.log('Socket connected! ID:', socket.id);
            socket.emit('joinGame', { roomCode, playerName }, (response) => {
                if (response.success) {
                    currentRoomCode = response.roomCode;
                    joinSettingsScreen.style.display = 'none';
                    waitingRoom.style.display = 'block';
                    showWaitingRoomForJoiner();
                } else {
                    showToast(response.error, 3000);
                }
            });
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket error:', error);
            showToast('Error connecting to server', 3000);
        });
    });
}

// ==================== INITIALIZATION ====================

function init() {
    if (hostJoinScreen) hostJoinScreen.style.display = 'block';
    if (hostSettingsScreen) hostSettingsScreen.style.display = 'none';
    if (joinSettingsScreen) joinSettingsScreen.style.display = 'none';
    if (categoryScreen) categoryScreen.style.display = 'none';
    if (settingsScreen) settingsScreen.style.display = 'none';
    if (waitingRoom) waitingRoom.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    init();
});