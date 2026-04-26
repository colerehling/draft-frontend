const socket = io('http://localhost:3000'); // Use your Render URL in production
let currentRoomCode = null;
let isHost = false;
let currentGameConfig = null;

// Game configuration (same as your existing setup)
let numPlayers = 2;
let numRounds = 5;
let timerMinutes = 3;
let selectedCategory = null;
let selectedCategoryName = null;

// DOM Elements
const createGameBtn = document.getElementById('createGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const waitingRoom = document.getElementById('waitingRoom');
const playersList = document.getElementById('playersList');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const startDraftBtn = document.getElementById('startDraftBtn');
const configDisplay = document.getElementById('configDisplay');
const readyStatus = document.getElementById('readyStatus');

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('playerJoined', (players) => {
    updatePlayersList(players);
});

socket.on('playerLeft', (players) => {
    updatePlayersList(players);
    showToast(`A player left the game`);
});

socket.on('playerReadyUpdate', (players) => {
    updatePlayersList(players);
});

socket.on('allPlayersReady', () => {
    if (isHost) {
        startDraftBtn.style.display = 'block';
        showToast('All players ready! Start the draft!');
    }
});

socket.on('draftStarted', (draftState) => {
    // Save draft state to localStorage and redirect
    localStorage.setItem('multiplayerDraft', JSON.stringify({
        isMultiplayer: true,
        roomCode: currentRoomCode,
        draftState: draftState
    }));
    window.location.href = 'multiplayer-draft.html';
});

socket.on('error', (error) => {
    showToast(error, 3000);
});

// Create Game
createGameBtn.addEventListener('click', async () => {
    // First, go through category selection (you can reuse your existing flow)
    const category = await selectCategory(); // Implement this
    if (!category) return;
    
    currentGameConfig = {
        numPlayers: numPlayers,
        category: category.table_name,
        categoryName: category.name,
        numRounds: numRounds,
        timerMinutes: timerMinutes,
        draftType: 'snake',
        playerName: prompt('Enter your name:', 'Host')
    };
    
    socket.emit('createGame', currentGameConfig, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            isHost = true;
            showLobby();
            showToast(`Game created! Code: ${response.roomCode}. Share with friends!`);
        }
    });
});

// Join Game
joinGameBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.toUpperCase();
    if (!roomCode) {
        showToast('Please enter a room code', 2000);
        return;
    }
    
    const playerName = prompt('Enter your name:', `Player`);
    
    socket.emit('joinGame', { roomCode, playerName }, (response) => {
        if (response.success) {
            currentRoomCode = response.roomCode;
            isHost = false;
            showLobby();
            showToast('Joined game! Waiting for host to start...');
        } else {
            showToast(response.error, 3000);
        }
    });
});

// Ready button (for non-host players)
function setReady() {
    socket.emit('playerReady', currentRoomCode);
    document.getElementById('readyBtn').disabled = true;
    document.getElementById('readyBtn').textContent = '✓ Ready!';
}

// Start draft (host only)
startDraftBtn.addEventListener('click', () => {
    if (isHost) {
        socket.emit('startDraft', currentRoomCode);
    }
});

function updatePlayersList(players) {
    playersList.innerHTML = '';
    players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        playerDiv.innerHTML = `
            <span>${getPlayerIcon(index)} ${player.name}</span>
            <span class="ready-status">${player.isReady ? '✓ Ready' : '⏳ Waiting...'}</span>
        `;
        playersList.appendChild(playerDiv);
    });
    
    // Show ready button for non-host players
    if (!isHost && !players.find(p => p.id === socket.id)?.isReady) {
        const readyBtn = document.createElement('button');
        readyBtn.id = 'readyBtn';
        readyBtn.className = 'primary-btn';
        readyBtn.textContent = 'I\'m Ready';
        readyBtn.onclick = setReady;
        readyStatus.innerHTML = '';
        readyStatus.appendChild(readyBtn);
    }
}

function showLobby() {
    document.querySelector('.lobby-container').style.display = 'none';
    waitingRoom.style.display = 'block';
    roomCodeDisplay.textContent = currentRoomCode;
    
    if (isHost) {
        configDisplay.innerHTML = `
            <h3>Game Configuration</h3>
            <p>👥 Players: ${numPlayers}</p>
            <p>🔄 Rounds: ${numRounds}</p>
            <p>⏱️ Timer: ${timerMinutes} min</p>
            <p>📦 Category: ${currentGameConfig?.categoryName}</p>
        `;
        startDraftBtn.style.display = 'none';
    }
}

function getPlayerIcon(index) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[index % icons.length];
}

function showToast(message, duration = 2200) {
    const toastEl = document.getElementById('toastMsg');
    toastEl.innerText = message;
    toastEl.style.opacity = '1';
    setTimeout(() => {
        toastEl.style.opacity = '0';
    }, duration);
}