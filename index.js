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

const hostOption = document.getElementById('hostOption');
const joinOption = document.getElementById('joinOption');
const backToHostJoinBtn = document.getElementById('backToHostJoinBtn');
const backToHostJoinJoinBtn = document.getElementById('backToHostJoinJoinBtn');

const decPlayersHost = document.getElementById('decPlayersHost');
const incPlayersHost = document.getElementById('incPlayersHost');
const numPlayersHostSpan = document.getElementById('numPlayersHost');
const continueToCategoryBtn = document.getElementById('continueToCategoryBtn');

const roomCodeInput = document.getElementById('roomCodeInput');
const playerNameInput = document.getElementById('playerNameInput');
const joinGameBtn = document.getElementById('joinGameBtn');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyRoomCodeBtn = document.getElementById('copyRoomCodeBtn');
const playersListDiv = document.getElementById('playersList');
const playerCountSpan = document.getElementById('playerCount');
const maxPlayersSpan = document.getElementById('maxPlayers');
const cancelHostGameBtn = document.getElementById('cancelHostGameBtn');
let startGameBtn = document.getElementById('startGameBtn');
const readyStatusDiv = document.getElementById('readyStatus');

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

function updateTotalPicksDisplay() {
    const totalPicks = numPlayers * numRounds;
    const playerCountDisplay = document.getElementById('playerCountDisplay');
    const roundsCountDisplay = document.getElementById('roundsCountDisplay');
    const totalPicksDisplay = document.getElementById('totalPicksDisplay');
    const timeDisplay = document.getElementById('timeDisplay');
    const categoryNameDisplay = document.getElementById('categoryNameDisplay');
    const gameModeDisplay = document.getElementById('gameModeDisplay');
    
    if (playerCountDisplay) playerCountDisplay.textContent = numPlayers;
    if (roundsCountDisplay) roundsCountDisplay.textContent = numRounds;
    if (totalPicksDisplay) totalPicksDisplay.textContent = totalPicks;
    if (timeDisplay) timeDisplay.textContent = timerMinutes + ' min';
    if (categoryNameDisplay && selectedCategoryName) {
        categoryNameDisplay.textContent = selectedCategoryName;
    }
    if (gameModeDisplay) {
        gameModeDisplay.textContent = gameMode === 'local' ? '🏠 Local Game' : '🌐 Online Game';
    }
}

function getPlayerIcon(index) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[index % icons.length];
}

function getSelectedGameMode() {
    const radios = document.querySelectorAll('input[name="gameMode"]');
    for (let radio of radios) {
        if (radio.checked) return radio.value;
    }
    return 'local';
}

function getSelectedDraftType() {
    const radios = document.querySelectorAll('input[name="draftType"]');
    for (let radio of radios) {
        if (radio.checked) return radio.value;
    }
    return 'snake';
}

// ==================== SOCKET.IO FUNCTIONS ====================

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
        window.location.href = 'multiplayer-draft.html';
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
                    console.log('Start button clicked. Players ready?', playersAreReady);
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
    });
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

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, (m) => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== API FUNCTIONS ====================

async function loadCategories() {
    try {
        console.log(`Fetching categories from: ${API_BASE_URL}/categories`);
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
    
    const categoryNameDisplay = document.getElementById('categoryNameDisplay');
    const gameModeDisplay = document.getElementById('gameModeDisplay');
    
    if (categoryNameDisplay) categoryNameDisplay.textContent = categoryName;
    if (gameModeDisplay) {
        gameModeDisplay.textContent = gameMode === 'local' ? '🏠 Local Game' : '🌐 Online Game';
    }
    
    categoryScreen.style.display = 'none';
    settingsScreen.style.display = 'block';
    updateTotalPicksDisplay();
}

async function startDraft() {
    const totalPicks = numPlayers * numRounds;
    if (totalPicks > selectedCategoryCount) {
        showToast(`⚠️ Need ${totalPicks} items but only ${selectedCategoryCount} available.`, 4000);
        return;
    }
    
    const selectedDraftType = getSelectedDraftType();
    
    if (gameMode === 'online' && isHost) {
        const gameConfig = {
            numPlayers: numPlayers,
            category: selectedCategory,
            categoryName: selectedCategoryName,
            numRounds: numRounds,
            timerMinutes: timerMinutes,
            draftType: selectedDraftType
        };
        localStorage.setItem('draftConfig', JSON.stringify(gameConfig));
        return;
    }
    
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
                gameMode: gameMode
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

if (hostOption) {
    hostOption.addEventListener('click', () => {
        isHost = true;
        gameMode = 'online';
        hostJoinScreen.style.display = 'none';
        hostSettingsScreen.style.display = 'block';
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

if (backToHostJoinBtn) {
    backToHostJoinBtn.addEventListener('click', () => {
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
        if (numPlayers > 2) {
            numPlayers--;
            if (numPlayersHostSpan) numPlayersHostSpan.textContent = numPlayers;
            updateTotalPicksDisplay();
        }
    });
}

if (incPlayersHost) {
    incPlayersHost.addEventListener('click', () => {
        if (numPlayers < 8) {
            numPlayers++;
            if (numPlayersHostSpan) numPlayersHostSpan.textContent = numPlayers;
            updateTotalPicksDisplay();
        }
    });
}

if (continueToCategoryBtn) {
    continueToCategoryBtn.addEventListener('click', () => {
        gameMode = getSelectedGameMode();
        
        if (gameMode === 'online' && isHost) {
            initSocketConnection();
            setTimeout(() => createGameRoom(), 500);
        } else {
            hostSettingsScreen.style.display = 'none';
            categoryScreen.style.display = 'block';
            loadCategories();
        }
    });
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

if (startDraftBtn) {
    startDraftBtn.addEventListener('click', startDraft);
}

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