// Determine if we're in development or production
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

// Use localhost for development, Render URL for production
const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'
    : 'https://draft-backend-f40v.onrender.com/api';

console.log(`API running in ${isDevelopment ? 'development' : 'production'} mode`);
console.log(`API URL: ${API_BASE_URL}`);

// Socket.IO connection
let socket = null;
let isHost = false;
let currentRoomCode = null;
let gameMode = 'local';
let playersAreReady = false;

// Game configuration variables - these will be set by the unified host screen
let numPlayers = 2;
let numRounds = 5;
let timerMinutes = 3;
let selectedCategory = null;
let selectedCategoryName = null;
let selectedCategoryCount = 0;
let draftType = 'snake';

// DOM Elements
const hostJoinScreen = document.getElementById('hostJoinScreen');
const hostSettingsScreen = document.getElementById('hostSettingsScreen');
const joinSettingsScreen = document.getElementById('joinSettingsScreen');
const categoryScreen = document.getElementById('categoryScreen');
const settingsScreen = document.getElementById('settingsScreen');
const waitingRoom = document.getElementById('waitingRoom');
const resultsScreen = document.getElementById('resultsScreen');

const hostOption = document.getElementById('hostOption');
const joinOption = document.getElementById('joinOption');
const backToHostJoinBtn = document.getElementById('backToHostJoinBtn');
const backToHostJoinJoinBtn = document.getElementById('backToHostJoinJoinBtn');

// Host Settings Elements (Unified)
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
const backToHostJoinFromSettings = document.getElementById('backToHostJoinFromSettings');

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

// Local Game Screens
const backToSettingsBtn = document.getElementById('backToSettingsBtn');
const backToCategoryBtn = document.getElementById('backToCategoryBtn');
const startDraftBtn = document.getElementById('startDraftBtn');
const decRounds = document.getElementById('decRounds');
const incRounds = document.getElementById('incRounds');
const numRoundsSpan = document.getElementById('numRounds');
const decTime = document.getElementById('decTime');
const incTime = document.getElementById('incTime');
const timerMinutesSpan = document.getElementById('timerMinutes');

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

let hostNumPlayers = 2;
let hostNumRounds = 5;
let hostTimerMinutes = 3;
let hostSelectedCategory = null;
let hostSelectedCategoryName = null;
let hostSelectedCategoryCount = 0;
let hostDraftType = 'snake';

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
        } else {
            throw new Error('No active categories found');
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
    // Validate all settings
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
    setTimeout(() => createGameRoom(), 500);
}

function initSocketConnection() {
    const serverUrl = isDevelopment 
        ? 'http://localhost:3000'
        : 'https://draft-backend-f40v.onrender.com';
    
    console.log('Connecting to Socket.IO at:', serverUrl);
    
    socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    socket.on('connect', () => {
        console.log('Socket.IO connected! ID:', socket.id);
        showToast('Connected to game server!', 2000);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket.IO error:', error);
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
    
    socket.on('hostReady', (ready) => {
        console.log('Host ready:', ready);
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
            if (playersAreReady) {
                socket.emit('startDraft', currentRoomCode);
                startGameBtn.disabled = true;
                startGameBtn.textContent = 'Starting...';
            } else {
                showToast('Waiting for all players to ready up...', 2000);
            }
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

// ==================== LOCAL GAME FUNCTIONS ====================

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success && data.categories) {
            displayCategories(data.categories);
            updateDbStatus('✅ Ready', '#10b981');
        } else {
            throw new Error('No active categories found');
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        updateDbStatus('❌ Connection Error', '#ef4444');
        showToast(`Could not connect to server: ${error.message}`, 5000);
    }
}

function displayCategories(categories) {
    const categoryGrid = document.getElementById('categoryGrid');
    if (!categoryGrid) return;
    
    categoryGrid.innerHTML = '';
    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.setAttribute('data-category', cat.table_name);
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'category-icon';
        iconDiv.textContent = getCategoryIcon(cat.table_name);
        
        const titleH3 = document.createElement('h3');
        titleH3.textContent = formatCategoryName(cat.table_name);
        
        const countP = document.createElement('p');
        countP.textContent = `${cat.item_count} items available`;
        
        const countDiv = document.createElement('div');
        countDiv.className = 'category-count';
        countDiv.textContent = 'Click to select →';
        
        card.appendChild(iconDiv);
        card.appendChild(titleH3);
        card.appendChild(countP);
        card.appendChild(countDiv);
        
        card.addEventListener('click', () => {
            selectedCategory = cat.table_name;
            selectedCategoryName = formatCategoryName(cat.table_name);
            selectedCategoryCount = cat.item_count;
            
            const categoryNameDisplay = document.getElementById('categoryNameDisplay');
            if (categoryNameDisplay) categoryNameDisplay.textContent = selectedCategoryName;
            
            categoryScreen.style.display = 'none';
            settingsScreen.style.display = 'block';
            updateTotalPicksDisplay();
        });
        
        categoryGrid.appendChild(card);
    });
}

function updateTotalPicksDisplay() {
    const totalPicks = numPlayers * numRounds;
    const playerCountDisplay = document.getElementById('playerCountDisplay');
    const roundsCountDisplay = document.getElementById('roundsCountDisplay');
    const totalPicksDisplay = document.getElementById('totalPicksDisplay');
    const timeDisplay = document.getElementById('timeDisplay');
    const categoryNameDisplay = document.getElementById('categoryNameDisplay');
    
    if (playerCountDisplay) playerCountDisplay.textContent = numPlayers;
    if (roundsCountDisplay) roundsCountDisplay.textContent = numRounds;
    if (totalPicksDisplay) totalPicksDisplay.textContent = totalPicks;
    if (timeDisplay) timeDisplay.textContent = timerMinutes + ' min';
    if (categoryNameDisplay && selectedCategoryName) {
        categoryNameDisplay.textContent = selectedCategoryName;
    }
}

function getSelectedDraftType() {
    const radios = document.querySelectorAll('input[name="draftType"]');
    for (let radio of radios) {
        if (radio.checked) return radio.value;
    }
    return 'snake';
}

async function startLocalDraft() {
    const totalPicks = numPlayers * numRounds;
    if (totalPicks > selectedCategoryCount) {
        showToast(`⚠️ Need ${totalPicks} items but only ${selectedCategoryCount} available.`, 4000);
        return;
    }
    
    const selectedDraftType = getSelectedDraftType();
    
    try {
        const response = await fetch(`${API_BASE_URL}/items/${selectedCategory}/with-scores`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.success && data.items) {
            const draftConfig = {
                numPlayers: numPlayers,
                category: selectedCategory,
                categoryName: selectedCategoryName,
                numRounds: numRounds,
                timerMinutes: timerMinutes,
                draftType: selectedDraftType,
                items: data.items,
                gameMode: 'local'
            };
            localStorage.setItem('draftConfig', JSON.stringify(draftConfig));
            window.location.href = 'draft.html';
        }
    } catch (error) {
        console.error('Error starting draft:', error);
        showToast(`Error: ${error.message}`, 3000);
    }
}

// ==================== EVENT LISTENERS ====================

// Host/Join Selection
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

// Host Settings Controls
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

// Draft type change listeners
document.querySelectorAll('input[name="draftTypeHost"]').forEach(radio => {
    radio.addEventListener('change', () => {
        hostDraftType = getHostDraftType();
        updateHostSummary();
    });
});

// Create Lobby button
if (createLobbyBtn) {
    createLobbyBtn.addEventListener('click', createLobby);
}

// Back buttons
if (backToHostJoinBtn) {
    backToHostJoinBtn.addEventListener('click', () => {
        hostSettingsScreen.style.display = 'none';
        hostJoinScreen.style.display = 'block';
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

// Join Game
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
        
        initSocketConnection();
        
        setTimeout(() => {
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
        }, 500);
    });
}

// Local Game Controls
if (decRounds) {
    decRounds.addEventListener('click', () => {
        if (numRounds > 3) {
            numRounds--;
            if (numRoundsSpan) numRoundsSpan.textContent = numRounds;
            updateTotalPicksDisplay();
        }
    });
}

if (incRounds) {
    incRounds.addEventListener('click', () => {
        if (numRounds < 10) {
            numRounds++;
            if (numRoundsSpan) numRoundsSpan.textContent = numRounds;
            updateTotalPicksDisplay();
        }
    });
}

if (decTime) {
    decTime.addEventListener('click', () => {
        if (timerMinutes > 1) {
            timerMinutes--;
            if (timerMinutesSpan) timerMinutesSpan.textContent = timerMinutes;
            updateTotalPicksDisplay();
        }
    });
}

if (incTime) {
    incTime.addEventListener('click', () => {
        if (timerMinutes < 5) {
            timerMinutes++;
            if (timerMinutesSpan) timerMinutesSpan.textContent = timerMinutes;
            updateTotalPicksDisplay();
        }
    });
}

if (startDraftBtn) {
    startDraftBtn.addEventListener('click', startLocalDraft);
}

if (backToSettingsBtn) {
    backToSettingsBtn.addEventListener('click', () => {
        settingsScreen.style.display = 'none';
        categoryScreen.style.display = 'block';
    });
}

if (backToCategoryBtn) {
    backToCategoryBtn.addEventListener('click', () => {
        settingsScreen.style.display = 'none';
        categoryScreen.style.display = 'block';
    });
}

// Local game navigation from player count screen
const continueToCategoryFromPlayers = document.getElementById('continueToCategoryFromPlayers');
if (continueToCategoryFromPlayers) {
    continueToCategoryFromPlayers.addEventListener('click', () => {
        document.getElementById('playerCountScreen').style.display = 'none';
        categoryScreen.style.display = 'block';
        loadCategories();
    });
}

const backToPlayersFromCategory = document.getElementById('backToPlayersFromCategory');
if (backToPlayersFromCategory) {
    backToPlayersFromCategory.addEventListener('click', () => {
        categoryScreen.style.display = 'none';
        document.getElementById('playerCountScreen').style.display = 'block';
    });
}

// Player count controls for local game
const decPlayers = document.getElementById('decPlayers');
const incPlayers = document.getElementById('incPlayers');
const numPlayersSpan = document.getElementById('numPlayers');

if (decPlayers) {
    decPlayers.addEventListener('click', () => {
        if (numPlayers > 2) {
            numPlayers--;
            if (numPlayersSpan) numPlayersSpan.textContent = numPlayers;
            updateTotalPicksDisplay();
        }
    });
}

if (incPlayers) {
    incPlayers.addEventListener('click', () => {
        if (numPlayers < 8) {
            numPlayers++;
            if (numPlayersSpan) numPlayersSpan.textContent = numPlayers;
            updateTotalPicksDisplay();
        }
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
    
    updateTotalPicksDisplay();
}

document.addEventListener('DOMContentLoaded', () => {
    init();
});