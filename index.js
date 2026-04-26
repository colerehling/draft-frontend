// Determine if we're in development or production
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

// Use localhost for development, Render URL for production
const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'  // Local development
    : 'https://draft-backend-f40v.onrender.com/api';  // Production on Render

console.log(`API running in ${isDevelopment ? 'development' : 'production'} mode`);
console.log(`API URL: ${API_BASE_URL}`);

// Socket.IO connection (for online play)
let socket = null;
let isHost = false;
let currentRoomCode = null;
let gameMode = 'local'; // 'local' or 'online'

// Game configuration variables
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

// Host/Join Selection
const hostOption = document.getElementById('hostOption');
const joinOption = document.getElementById('joinOption');
const backToHostJoinBtn = document.getElementById('backToHostJoinBtn');
const backToHostJoinJoinBtn = document.getElementById('backToHostJoinJoinBtn');

// Host Settings
const decPlayersHost = document.getElementById('decPlayersHost');
const incPlayersHost = document.getElementById('incPlayersHost');
const numPlayersHostSpan = document.getElementById('numPlayersHost');
const continueToCategoryBtn = document.getElementById('continueToCategoryBtn');

// Join Settings
const roomCodeInput = document.getElementById('roomCodeInput');
const playerNameInput = document.getElementById('playerNameInput');
const joinGameBtn = document.getElementById('joinGameBtn');

// Waiting Room
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyRoomCodeBtn = document.getElementById('copyRoomCodeBtn');
const playersListDiv = document.getElementById('playersList');
const playerCountSpan = document.getElementById('playerCount');
const maxPlayersSpan = document.getElementById('maxPlayers');
const cancelHostGameBtn = document.getElementById('cancelHostGameBtn');
const startGameBtn = document.getElementById('startGameBtn');
const readyStatusDiv = document.getElementById('readyStatus');

// Navigation
const backToSettingsBtn = document.getElementById('backToSettingsBtn');
const backToCategoryBtn = document.getElementById('backToCategoryBtn');
const startDraftBtn = document.getElementById('startDraftBtn');

// ==================== STEP 1: Host or Join Selection ====================

hostOption.addEventListener('click', () => {
    isHost = true;
    gameMode = 'online';
    hostJoinScreen.style.display = 'none';
    hostSettingsScreen.style.display = 'block';
});

joinOption.addEventListener('click', () => {
    isHost = false;
    gameMode = 'online';
    hostJoinScreen.style.display = 'none';
    joinSettingsScreen.style.display = 'block';
});

backToHostJoinBtn.addEventListener('click', () => {
    hostSettingsScreen.style.display = 'none';
    hostJoinScreen.style.display = 'block';
});

backToHostJoinJoinBtn.addEventListener('click', () => {
    joinSettingsScreen.style.display = 'none';
    hostJoinScreen.style.display = 'block';
});

// ==================== Host Settings ====================

if (decPlayersHost && incPlayersHost && numPlayersHostSpan) {
    decPlayersHost.addEventListener('click', () => {
        if (numPlayers > 2) {
            numPlayers--;
            numPlayersHostSpan.textContent = numPlayers;
            updateTotalPicksDisplay();
        }
    });
    
    incPlayersHost.addEventListener('click', () => {
        if (numPlayers < 8) {
            numPlayers++;
            numPlayersHostSpan.textContent = numPlayers;
            updateTotalPicksDisplay();
        }
    });
}

// Get selected game mode (local/online)
function getSelectedGameMode() {
    const radios = document.querySelectorAll('input[name="gameMode"]');
    for (let radio of radios) {
        if (radio.checked) {
            return radio.value;
        }
    }
    return 'local';
}

continueToCategoryBtn.addEventListener('click', () => {
    // Get game mode from selected radio
    gameMode = getSelectedGameMode();
    
    if (gameMode === 'online' && isHost) {
        // Initialize Socket.IO connection
        initSocketConnection();
        createGameRoom();
    } else if (gameMode === 'local') {
        // Local game - go directly to category selection
        hostSettingsScreen.style.display = 'none';
        categoryScreen.style.display = 'block';
        loadCategories();
    } else {
        hostSettingsScreen.style.display = 'none';
        categoryScreen.style.display = 'block';
        loadCategories();
    }
});

// ==================== Join Game ====================

joinGameBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.toUpperCase();
    const playerName = playerNameInput.value.trim();
    
    if (!roomCode || roomCode.length !== 6) {
        showToast('Please enter a valid 6-character room code', 3000);
        return;
    }
    
    if (!playerName) {
        showToast('Please enter your name', 3000);
        return;
    }
    
    initSocketConnection();
    
    socket.emit('joinGame', { roomCode, playerName }, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            showToast('Joined game! Waiting for host to start...', 2000);
            
            // For joiners, we don't need to select category or settings
            // Just wait for the host to start the draft
            joinSettingsScreen.style.display = 'none';
            waitingRoom.style.display = 'block';
            
            // Show waiting UI
            showWaitingRoomForJoiner();
        } else {
            showToast(response.error, 3000);
        }
    });
});

// ==================== Socket.IO Functions ====================

function initSocketConnection() {
    const serverUrl = isDevelopment ? 'http://localhost:3000' : 'https://draft-backend-f40v.onrender.com';
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('playerJoined', (players) => {
        updatePlayersList(players);
    });
    
    socket.on('playerLeft', (players) => {
        updatePlayersList(players);
        showToast('A player left the game', 2000);
    });
    
    socket.on('playerReadyUpdate', (players) => {
        updatePlayersList(players);
    });
    
    socket.on('allPlayersReady', () => {
        if (isHost) {
            startGameBtn.style.display = 'block';
            showToast('All players ready! Start the draft!');
        }
    });
    
    socket.on('draftStarted', (draftState) => {
        // Save draft state and redirect
        localStorage.setItem('multiplayerDraft', JSON.stringify({
            isMultiplayer: true,
            roomCode: currentRoomCode,
            isHost: isHost,
            draftState: draftState
        }));
        window.location.href = 'multiplayer-draft.html';
    });
    
    socket.on('error', (error) => {
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
    
    socket.emit('createGame', gameConfig, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            roomCodeDisplay.textContent = currentRoomCode;
            maxPlayersSpan.textContent = numPlayers;
            
            hostSettingsScreen.style.display = 'none';
            waitingRoom.style.display = 'block';
            
            copyRoomCodeBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(currentRoomCode);
                showToast('Room code copied!', 1500);
            });
            
            cancelHostGameBtn.addEventListener('click', () => {
                window.location.reload();
            });
            
            startGameBtn.addEventListener('click', () => {
                socket.emit('startDraft', currentRoomCode);
            });
        }
    });
}

function updatePlayersList(players) {
    playersListDiv.innerHTML = '';
    players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        playerDiv.innerHTML = `
            <span>${getPlayerIcon(index)} ${player.name}</span>
            <span class="ready-status">${player.isReady ? '✓ Ready' : '⏳ Waiting...'}</span>
        `;
        playersListDiv.appendChild(playerDiv);
    });
    playerCountSpan.textContent = players.length;
}

function showWaitingRoomForJoiner() {
    // Show ready button for joiners
    const readyBtn = document.createElement('button');
    readyBtn.className = 'primary-btn';
    readyBtn.textContent = 'I\'m Ready';
    readyBtn.addEventListener('click', () => {
        socket.emit('playerReady', currentRoomCode);
        readyBtn.disabled = true;
        readyBtn.textContent = '✓ Ready!';
    });
    readyStatusDiv.innerHTML = '';
    readyStatusDiv.appendChild(readyBtn);
}

function getPlayerIcon(index) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[index % icons.length];
}

// ==================== Category Selection (Step 3) ====================

async function loadCategories() {
    try {
        console.log(`Fetching categories from: ${API_BASE_URL}/categories`);
        const response = await fetch(`${API_BASE_URL}/categories`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
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
            selectCategory(cat.table_name, formatCategoryName(cat.table_name), cat.item_count);
        });
        
        categoryGrid.appendChild(card);
    });
}

function selectCategory(category, categoryName, itemCount) {
    selectedCategory = category;
    selectedCategoryName = categoryName;
    selectedCategoryCount = itemCount;
    
    // Update display in settings screen
    const categoryNameDisplay = document.getElementById('categoryNameDisplay');
    const gameModeDisplay = document.getElementById('gameModeDisplay');
    if (categoryNameDisplay) {
        categoryNameDisplay.textContent = categoryName;
    }
    if (gameModeDisplay) {
        gameModeDisplay.textContent = gameMode === 'local' ? '🏠 Local Game' : '🌐 Online Game';
    }
    
    // Go to settings screen (Step 4)
    categoryScreen.style.display = 'none';
    settingsScreen.style.display = 'block';
    updateTotalPicksDisplay();
}

// ==================== Draft Settings (Step 4) ====================

function getSelectedDraftType() {
    const radios = document.querySelectorAll('input[name="draftType"]');
    for (let radio of radios) {
        if (radio.checked) {
            return radio.value;
        }
    }
    return 'snake';
}

async function startDraft() {
    const totalPicks = numPlayers * numRounds;
    
    if (totalPicks > selectedCategoryCount) {
        showToast(`⚠️ Need ${totalPicks} items but only ${selectedCategoryCount} available. Reduce players or rounds.`, 4000);
        return;
    }
    
    const draftType = getSelectedDraftType();
    
    // If online game as host, we need to wait for all players to join
    if (gameMode === 'online' && isHost) {
        // The draft will be started from the waiting room
        // Save config and wait
        const gameConfig = {
            numPlayers: numPlayers,
            category: selectedCategory,
            categoryName: selectedCategoryName,
            numRounds: numRounds,
            timerMinutes: timerMinutes,
            draftType: draftType
        };
        
        localStorage.setItem('draftConfig', JSON.stringify(gameConfig));
        return;
    }
    
    // Local game or joiner - proceed normally
    try {
        console.log(`Fetching items for category: ${selectedCategory}`);
        const response = await fetch(`${API_BASE_URL}/items/${selectedCategory}/with-scores`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch items: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.items) {
            const draftConfig = {
                numPlayers: numPlayers,
                category: selectedCategory,
                categoryName: selectedCategoryName,
                numRounds: numRounds,
                timerMinutes: timerMinutes,
                draftType: draftType,
                items: data.items,
                gameMode: gameMode
            };
            localStorage.setItem('draftConfig', JSON.stringify(draftConfig));
            window.location.href = 'draft.html';
        } else {
            showToast('Error loading items for draft', 3000);
        }
    } catch (error) {
        console.error('Error starting draft:', error);
        showToast(`Error: ${error.message}`, 3000);
    }
}

function updateTotalPicksDisplay() {
    const totalPicks = numPlayers * numRounds;
    const elements = {
        playerCountDisplay: document.getElementById('playerCountDisplay'),
        roundsCountDisplay: document.getElementById('roundsCountDisplay'),
        totalPicksDisplay: document.getElementById('totalPicksDisplay'),
        timeDisplay: document.getElementById('timeDisplay'),
        categoryNameDisplay: document.getElementById('categoryNameDisplay'),
        gameModeDisplay: document.getElementById('gameModeDisplay')
    };
    
    if (elements.playerCountDisplay) elements.playerCountDisplay.textContent = numPlayers;
    if (elements.roundsCountDisplay) elements.roundsCountDisplay.textContent = numRounds;
    if (elements.totalPicksDisplay) elements.totalPicksDisplay.textContent = totalPicks;
    if (elements.timeDisplay) elements.timeDisplay.textContent = timerMinutes + ' min';
    if (elements.categoryNameDisplay && selectedCategoryName) {
        elements.categoryNameDisplay.textContent = selectedCategoryName;
    }
    if (elements.gameModeDisplay) {
        elements.gameModeDisplay.textContent = gameMode === 'local' ? '🏠 Local Game' : '🌐 Online Game';
    }
}

// ==================== Navigation ====================

backToSettingsBtn.addEventListener('click', () => {
    settingsScreen.style.display = 'none';
    categoryScreen.style.display = 'block';
});

backToCategoryBtn.addEventListener('click', () => {
    settingsScreen.style.display = 'none';
    categoryScreen.style.display = 'block';
});

startDraftBtn.addEventListener('click', () => {
    startDraft();
});

// Rounds controls
const decRounds = document.getElementById('decRounds');
const incRounds = document.getElementById('incRounds');
const numRoundsSpan = document.getElementById('numRounds');
const decTime = document.getElementById('decTime');
const incTime = document.getElementById('incTime');
const timerMinutesSpan = document.getElementById('timerMinutes');

if (decRounds) {
    decRounds.addEventListener('click', () => {
        if (numRounds > 3) {
            numRounds--;
            numRoundsSpan.textContent = numRounds;
            updateTotalPicksDisplay();
        }
    });
}

if (incRounds) {
    incRounds.addEventListener('click', () => {
        if (numRounds < 10) {
            numRounds++;
            numRoundsSpan.textContent = numRounds;
            updateTotalPicksDisplay();
        }
    });
}

if (decTime) {
    decTime.addEventListener('click', () => {
        if (timerMinutes > 1) {
            timerMinutes--;
            timerMinutesSpan.textContent = timerMinutes;
            updateTotalPicksDisplay();
        }
    });
}

if (incTime) {
    incTime.addEventListener('click', () => {
        if (timerMinutes < 5) {
            timerMinutes++;
            timerMinutesSpan.textContent = timerMinutes;
            updateTotalPicksDisplay();
        }
    });
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

function updateDbStatus(message, color = '#facc15') {
    const statusEl = document.getElementById('dbStatus');
    if (statusEl) {
        statusEl.innerHTML = message;
        statusEl.style.color = color;
    }
}

// Initialize - show host/join screen first
function init() {
    hostJoinScreen.style.display = 'block';
    hostSettingsScreen.style.display = 'none';
    joinSettingsScreen.style.display = 'none';
    categoryScreen.style.display = 'none';
    settingsScreen.style.display = 'none';
    waitingRoom.style.display = 'none';
    
    updateTotalPicksDisplay();
}

document.addEventListener('DOMContentLoaded', () => {
    init();
});