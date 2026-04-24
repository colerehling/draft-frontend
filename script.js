// ----------------------------- BACKEND API CONFIGURATION -----------------------------
const API_BASE_URL = 'http://localhost:3000/api';
let MASTER_ITEMS = [];
let itemsWithScores = {};
let availableItems = [];
let playersItems = [];
let draftOrder = [];
let currentPickIndex = 0;
let currentRound = 1;
let numPlayers = 2;
let numRounds = 5;
let totalPicks = 0;
let currentCategory = null;
let currentCategoryName = '';

// Timer variables
let timerInterval = null;
let timeRemaining = 300;
const TIMER_DURATION = 300;

// Load categories
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        const data = await response.json();
        
        if (data.success && data.categories) {
            displayCategories(data.categories);
            updateDbStatus('✅ Ready', '#10b981');
        } else {
            throw new Error('No categories found');
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        updateDbStatus('❌ Connection Error', '#ef4444');
        showToast('Could not connect to server. Make sure backend is running.', 3000);
    }
}

// Display category cards
function displayCategories(categories) {
    const categoryGrid = document.getElementById('categoryGrid');
    if (!categoryGrid) return;
    
    categoryGrid.innerHTML = '';
    
    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.setAttribute('data-category', cat.table);
        card.setAttribute('data-name', cat.name);
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'category-icon';
        iconDiv.textContent = cat.icon;
        
        const titleH3 = document.createElement('h3');
        titleH3.textContent = cat.name;
        
        const countP = document.createElement('p');
        countP.textContent = `${cat.count} items available`;
        
        const countDiv = document.createElement('div');
        countDiv.className = 'category-count';
        countDiv.textContent = 'Click to select →';
        
        card.appendChild(iconDiv);
        card.appendChild(titleH3);
        card.appendChild(countP);
        card.appendChild(countDiv);
        
        card.addEventListener('click', () => {
            selectCategory(cat.table, cat.name);
        });
        
        categoryGrid.appendChild(card);
    });
}

// Select category and move to round selection
async function selectCategory(category, categoryName) {
    currentCategory = category;
    currentCategoryName = categoryName;
    
    showToast(`Loading ${categoryName}...`);
    
    try {
        const response = await fetch(`${API_BASE_URL}/items/${category}/with-scores`);
        const data = await response.json();
        
        if (data.success) {
            itemsWithScores = {};
            MASTER_ITEMS = [];
            data.items.forEach(item => {
                const scoreValue = typeof item.score === 'string' ? parseFloat(item.score) : item.score;
                itemsWithScores[item.item_name] = scoreValue;
                MASTER_ITEMS.push(item.item_name);
            });
            
            document.getElementById('categoryScreen').style.display = 'none';
            document.getElementById('roundsScreen').style.display = 'block';
            
            const availableCount = MASTER_ITEMS.length;
            document.getElementById('availableCountDisplay').textContent = availableCount;
            document.getElementById('playerCountDisplay').textContent = numPlayers;
            document.getElementById('roundsCountDisplay').textContent = numRounds;
            
            await displayCategoryStats(category);
            
            updateTotalPicks();
            validateRoundConfiguration();
        }
    } catch (error) {
        console.error('Error loading items:', error);
        showToast('Error loading category items', 3000);
    }
}

// Display category score statistics
async function displayCategoryStats(category) {
    try {
        const response = await fetch(`${API_BASE_URL}/categories/${category}/stats`);
        const data = await response.json();
        
        if (data.success && data.stats) {
            const statsContainer = document.querySelector('.config-card.highlight .config-stats');
            if (statsContainer && !document.getElementById('categoryStats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'categoryStats';
                
                const totalStat = document.createElement('div');
                totalStat.className = 'stat-item';
                totalStat.innerHTML = '<span class="stat-label">📊 Total Score Pool:</span><span class="stat-value">' + data.stats.totalScore + '</span>';
                
                const avgStat = document.createElement('div');
                avgStat.className = 'stat-item';
                avgStat.innerHTML = '<span class="stat-label">⭐ Average Item Score:</span><span class="stat-value">' + data.stats.averageScore.toFixed(1) + '</span>';
                
                statsDiv.appendChild(totalStat);
                statsDiv.appendChild(avgStat);
                statsContainer.appendChild(statsDiv);
            }
        }
    } catch (error) {
        console.error('Error fetching category stats:', error);
    }
}

// Update total picks calculation
function updateTotalPicks() {
    totalPicks = numPlayers * numRounds;
    document.getElementById('totalNeededDisplay').textContent = totalPicks;
    document.getElementById('totalPicksDisplay').textContent = totalPicks;
}

// Validate rounds configuration
function validateRoundConfiguration() {
    const availableItemsCount = MASTER_ITEMS.length;
    const isValid = totalPicks <= availableItemsCount;
    const validationMsg = document.getElementById('validationMessage');
    const startBtn = document.getElementById('startDraftBtn');
    
    if (isValid) {
        validationMsg.innerHTML = '✓ Configuration valid! Ready to start draft.';
        validationMsg.className = 'validation-message valid';
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
    } else {
        validationMsg.innerHTML = '⚠️ Need ' + totalPicks + ' items but only ' + availableItemsCount + ' available. Reduce players or rounds.';
        validationMsg.className = 'validation-message invalid';
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
    }
}

// Generate snake draft order
function generateSnakeOrder() {
    const order = [];
    for (let round = 1; round <= numRounds; round++) {
        if (round % 2 === 1) {
            for (let i = 0; i < numPlayers; i++) {
                order.push({ playerIndex: i, round: round });
            }
        } else {
            for (let i = numPlayers - 1; i >= 0; i--) {
                order.push({ playerIndex: i, round: round });
            }
        }
    }
    return order;
}

// Start the draft
function startDraft() {
    availableItems = [...MASTER_ITEMS];
    playersItems = [];
    for (let i = 0; i < numPlayers; i++) {
        playersItems.push([]);
    }
    
    draftOrder = generateSnakeOrder();
    currentPickIndex = 0;
    currentRound = 1;
    
    shuffleArray(availableItems);
    
    renderGame();
    
    document.getElementById('roundsScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    document.getElementById('categoryTitle').innerHTML = '📦 ' + currentCategoryName;
    
    showToast('🐍 Snake draft started! ' + numPlayers + ' players, ' + numRounds + ' rounds. Player 1 picks first!');
    
    startTimer();
}

// Shuffle array helper
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Timer functions
function startTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timeRemaining = TIMER_DURATION;
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            updateTimerDisplay();
            
            const playerCol = document.getElementById('player' + (getCurrentPlayerIndex() + 1) + 'Col');
            if (playerCol) {
                if (timeRemaining <= 30) {
                    playerCol.classList.add('timer-critical');
                    playerCol.classList.remove('timer-warning');
                } else if (timeRemaining <= 60) {
                    playerCol.classList.add('timer-warning');
                    playerCol.classList.remove('timer-critical');
                } else {
                    playerCol.classList.remove('timer-warning', 'timer-critical');
                }
            }
            
            if (timeRemaining === 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                makeRandomPick();
            }
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerDisplay = document.getElementById('timerDisplay');
    const timerBarFill = document.getElementById('timerBarFill');
    
    if (timerDisplay) {
        timerDisplay.textContent = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
        
        if (timeRemaining <= 30) {
            timerDisplay.style.color = '#ef4444';
            if (timerBarFill) {
                timerBarFill.classList.add('critical');
                timerBarFill.classList.remove('warning');
            }
        } else if (timeRemaining <= 60) {
            timerDisplay.style.color = '#f97316';
            if (timerBarFill) {
                timerBarFill.classList.add('warning');
                timerBarFill.classList.remove('critical');
            }
        } else {
            timerDisplay.style.color = '#facc15';
            if (timerBarFill) {
                timerBarFill.classList.remove('warning', 'critical');
            }
        }
    }
    
    if (timerBarFill) {
        const percentage = (timeRemaining / TIMER_DURATION) * 100;
        timerBarFill.style.width = percentage + '%';
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function makeRandomPick() {
    if (currentPickIndex >= draftOrder.length) {
        return;
    }
    
    const currentPick = draftOrder[currentPickIndex];
    const playerIndex = currentPick.playerIndex;
    
    if (availableItems.length === 0) {
        showToast("No items left to draft!");
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * availableItems.length);
    const randomItem = availableItems[randomIndex];
    let itemScore = itemsWithScores[randomItem] || 0;
    itemScore = typeof itemScore === 'string' ? parseFloat(itemScore) : itemScore;
    
    availableItems.splice(randomIndex, 1);
    playersItems[playerIndex].push({
        name: randomItem,
        score: itemScore
    });
    
    showToast('⏰ Time\'s up! Random pick for ' + getPlayerName(playerIndex) + ': "' + randomItem + '"', 3000);
    
    currentPickIndex++;
    
    if (currentPickIndex >= draftOrder.length) {
        completeDraft();
    } else {
        const nextPick = draftOrder[currentPickIndex];
        currentRound = nextPick.round;
        renderGame();
        startTimer();
    }
}

function performDraft(item) {
    if (currentPickIndex >= draftOrder.length) {
        showToast("Draft is complete!");
        return false;
    }
    
    const currentPick = draftOrder[currentPickIndex];
    const playerIndex = currentPick.playerIndex;
    
    const itemIndex = availableItems.indexOf(item);
    if (itemIndex === -1) {
        showToast('❌ "' + item + '" is not available.');
        return false;
    }
    
    stopTimer();
    
    availableItems.splice(itemIndex, 1);
    let itemScore = itemsWithScores[item] || 0;
    itemScore = typeof itemScore === 'string' ? parseFloat(itemScore) : itemScore;
    
    playersItems[playerIndex].push({
        name: item,
        score: itemScore
    });
    
    showToast('✅ ' + getPlayerName(playerIndex) + ' drafted "' + item + '"');
    
    currentPickIndex++;
    
    if (currentPickIndex >= draftOrder.length) {
        completeDraft();
    } else {
        const nextPick = draftOrder[currentPickIndex];
        currentRound = nextPick.round;
        renderGame();
        startTimer();
    }
    
    return true;
}

function completeDraft() {
    stopTimer();
    
    const playerScores = playersItems.map((items, index) => {
        let totalScore = 0;
        for (let i = 0; i < items.length; i++) {
            const score = typeof items[i].score === 'number' ? items[i].score : parseFloat(items[i].score);
            totalScore += isNaN(score) ? 0 : score;
        }
        
        return {
            playerIndex: index,
            playerName: getPlayerName(index),
            totalScore: totalScore
        };
    });
    
    playerScores.sort((a, b) => b.totalScore - a.totalScore);
    
    let currentPlace = 1;
    let previousScore = null;
    playerScores.forEach((player, index) => {
        if (previousScore !== null && player.totalScore < previousScore) {
            currentPlace = index + 1;
        }
        player.place = currentPlace;
        previousScore = player.totalScore;
    });
    
    showFinalScorePage(playerScores);
}

function showFinalScorePage(playerScores) {
    const finalScoreContent = document.getElementById('finalScoreContent');
    finalScoreContent.innerHTML = '';
    
    const scoresContainer = document.createElement('div');
    scoresContainer.className = 'scores-container';
    
    playerScores.forEach((player) => {
        let medalIcon = '';
        let placeClass = '';
        
        if (player.place === 1) {
            medalIcon = '🥇';
            placeClass = 'first';
        } else if (player.place === 2) {
            medalIcon = '🥈';
            placeClass = 'second';
        } else if (player.place === 3) {
            medalIcon = '🥉';
            placeClass = 'third';
        } else {
            medalIcon = player.place.toString();
            placeClass = '';
        }
        
        const displayScore = typeof player.totalScore === 'number' ? player.totalScore : parseFloat(player.totalScore);
        
        const scoreCard = document.createElement('div');
        scoreCard.className = 'score-card ' + placeClass;
        
        const rankDiv = document.createElement('div');
        rankDiv.className = 'score-rank';
        rankDiv.textContent = medalIcon;
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'score-info';
        
        const playerNameDiv = document.createElement('div');
        playerNameDiv.className = 'score-player';
        playerNameDiv.textContent = player.playerName;
        
        const pointsDiv = document.createElement('div');
        pointsDiv.className = 'score-points';
        pointsDiv.textContent = 'Total Points';
        
        infoDiv.appendChild(playerNameDiv);
        infoDiv.appendChild(pointsDiv);
        
        const valueDiv = document.createElement('div');
        valueDiv.className = 'score-value';
        valueDiv.textContent = displayScore;
        
        scoreCard.appendChild(rankDiv);
        scoreCard.appendChild(infoDiv);
        scoreCard.appendChild(valueDiv);
        
        scoresContainer.appendChild(scoreCard);
    });
    
    finalScoreContent.appendChild(scoresContainer);
    
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('finalScoreScreen').style.display = 'block';
}

function getCurrentPlayerIndex() {
    if (currentPickIndex >= draftOrder.length) return -1;
    return draftOrder[currentPickIndex].playerIndex;
}

function getPlayerName(playerIndex) {
    return 'Player ' + (playerIndex + 1);
}

function getPlayerColor(playerIndex) {
    const colors = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#06b6d4', '#ec489a'];
    return colors[playerIndex % colors.length];
}

function getPlayerIcon(playerIndex) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[playerIndex % icons.length];
}

function renderGame() {
    const playersContainer = document.getElementById('playersContainer');
    const availableContainer = document.getElementById('availableList');
    const poolCountSpan = document.getElementById('poolCount');
    const activePlayerNameSpan = document.getElementById('activePlayerName');
    const turnMessageSpan = document.getElementById('turnMessage');
    const roundIndicator = document.getElementById('roundIndicator');
    const currentPlayerIndex = getCurrentPlayerIndex();
    const isDraftComplete = currentPickIndex >= draftOrder.length;
    
    if (roundIndicator) {
        if (!isDraftComplete) {
            roundIndicator.textContent = 'Round ' + currentRound + ' of ' + numRounds + ' | Pick ' + (currentPickIndex + 1) + ' of ' + totalPicks;
        } else {
            roundIndicator.textContent = '🏁 Draft Complete! 🏁';
        }
    }
    
    if (poolCountSpan) {
        poolCountSpan.innerText = availableItems.length + ' items (' + (totalPicks - currentPickIndex) + ' picks left)';
    }
    
    if (availableItems.length === 0 || isDraftComplete) {
        availableContainer.innerHTML = '<div class="empty-state">🏁 Draft complete! Viewing final scores...</div>';
    } else {
        availableContainer.innerHTML = '';
        availableItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'draft-card';
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'item-info';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'item-name';
            nameSpan.textContent = item;
            
            infoDiv.appendChild(nameSpan);
            
            const draftBtn = document.createElement('button');
            draftBtn.className = 'draft-btn active-turn';
            draftBtn.setAttribute('data-item', item);
            draftBtn.textContent = '⚡ Draft';
            
            card.appendChild(infoDiv);
            card.appendChild(draftBtn);
            
            availableContainer.appendChild(card);
        });
    }
    
    if (playersContainer) {
        playersContainer.innerHTML = '';
        
        for (let i = 0; i < numPlayers; i++) {
            const playerCol = document.createElement('div');
            playerCol.className = 'player-col';
            if (currentPlayerIndex === i && !isDraftComplete) {
                playerCol.classList.add('highlight-turn');
            }
            playerCol.id = 'player' + (i + 1) + 'Col';
            
            let playerTotalScore = 0;
            for (let j = 0; j < playersItems[i].length; j++) {
                const score = typeof playersItems[i][j].score === 'number' ? playersItems[i][j].score : parseFloat(playersItems[i][j].score);
                playerTotalScore += isNaN(score) ? 0 : score;
            }
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'player-header';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'player-name';
            nameDiv.innerHTML = '<span>' + getPlayerIcon(i) + '</span><span class="player' + (i + 1) + '-name" style="color: ' + getPlayerColor(i) + '">' + getPlayerName(i) + '</span>';
            
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'player-score';
            scoreDiv.innerHTML = '<div>' + playersItems[i].length + '/' + numRounds + '</div><div style="font-size: 0.7rem; color: #facc15;">⭐ ' + playerTotalScore + '</div>';
            
            headerDiv.appendChild(nameDiv);
            headerDiv.appendChild(scoreDiv);
            
            const itemsDiv = document.createElement('div');
            itemsDiv.id = 'player' + (i + 1) + 'Items';
            itemsDiv.className = 'drafted-list player' + (i + 1) + '-items';
            
            if (playersItems[i].length === 0) {
                itemsDiv.innerHTML = '<div class="empty-state">✨ Waiting for picks...</div>';
            } else {
                itemsDiv.innerHTML = '';
                playersItems[i].forEach((item, idx) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'drafted-item';
                    itemDiv.innerHTML = '<span>' + (idx + 1) + '.</span> ' + escapeHtml(item.name);
                    itemsDiv.appendChild(itemDiv);
                });
            }
            
            playerCol.appendChild(headerDiv);
            playerCol.appendChild(itemsDiv);
            playersContainer.appendChild(playerCol);
        }
    }
    
    if (isDraftComplete) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = "Complete!";
        if (turnMessageSpan) turnMessageSpan.innerText = "🏆 Draft is finished! 🏆";
        removeHighlights();
    } else if (currentPlayerIndex !== -1) {
        if (activePlayerNameSpan) activePlayerNameSpan.innerText = getPlayerName(currentPlayerIndex);
        if (turnMessageSpan) {
            const picksLeftForPlayer = numRounds - playersItems[currentPlayerIndex].length;
            turnMessageSpan.innerText = getPlayerName(currentPlayerIndex) + "'s turn to draft (" + picksLeftForPlayer + " of " + numRounds + " picks remaining)";
        }
    }
    
    attachDraftEvents();
}

function removeHighlights() {
    for (let i = 0; i < numPlayers; i++) {
        const playerCol = document.getElementById('player' + (i + 1) + 'Col');
        if (playerCol) {
            playerCol.classList.remove('highlight-turn', 'timer-warning', 'timer-critical');
        }
    }
}

function attachDraftEvents() {
    const allDraftBtns = document.querySelectorAll('#availableList .draft-btn');
    allDraftBtns.forEach(btn => {
        const itemName = btn.getAttribute('data-item');
        if (!itemName) return;
        
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetItem = newBtn.getAttribute('data-item');
            if (!targetItem) return;
            if (currentPickIndex >= draftOrder.length) {
                showToast("Draft is complete! Start a new draft to play again.");
                return;
            }
            performDraft(targetItem);
        });
    });
}

function forceSkipTurn() {
    if (currentPickIndex >= draftOrder.length) {
        showToast("Draft is complete!");
        return;
    }
    stopTimer();
    makeRandomPick();
}

function fullReset() {
    stopTimer();
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('finalScoreScreen').style.display = 'none';
    document.getElementById('playerCountScreen').style.display = 'block';
    document.getElementById('categoryScreen').style.display = 'none';
    document.getElementById('roundsScreen').style.display = 'none';
    
    currentPickIndex = 0;
    currentRound = 1;
    playersItems = [];
    availableItems = [];
    
    showToast("Starting new draft configuration");
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

let toastTimeout;
function showToast(message, duration = 2200) {
    const toastEl = document.getElementById('toastMsg');
    if (toastTimeout) clearTimeout(toastTimeout);
    if (toastEl) {
        toastEl.innerText = message;
        toastEl.style.opacity = '1';
        toastTimeout = setTimeout(() => {
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

function setupConfiguration() {
    const decPlayers = document.getElementById('decPlayers');
    const incPlayers = document.getElementById('incPlayers');
    const numPlayersSpan = document.getElementById('numPlayers');
    const continueToCategoriesBtn = document.getElementById('continueToCategoriesBtn');
    const backToPlayersBtn = document.getElementById('backToPlayersBtn');
    const backToCategoryBtn2 = document.getElementById('backToCategoryBtn2');
    const decRounds = document.getElementById('decRounds');
    const incRounds = document.getElementById('incRounds');
    const numRoundsSpan = document.getElementById('numRounds');
    const startDraftBtn = document.getElementById('startDraftBtn');
    const backToStartBtn = document.getElementById('backToStartBtn');
    const resetGameBtn = document.getElementById('resetGameBtn');
    const forceEndTurnBtn = document.getElementById('forceEndTurnBtn');
    const newDraftFromScoreBtn = document.getElementById('newDraftFromScoreBtn');
    
    decPlayers.addEventListener('click', () => {
        if (numPlayers > 2) {
            numPlayers--;
            numPlayersSpan.textContent = numPlayers;
        }
    });
    
    incPlayers.addEventListener('click', () => {
        if (numPlayers < 8) {
            numPlayers++;
            numPlayersSpan.textContent = numPlayers;
        }
    });
    
    decRounds.addEventListener('click', () => {
        if (numRounds > 3) {
            numRounds--;
            numRoundsSpan.textContent = numRounds;
            if (currentCategory) {
                updateTotalPicks();
                validateRoundConfiguration();
            }
        }
    });
    
    incRounds.addEventListener('click', () => {
        if (numRounds < 10) {
            numRounds++;
            numRoundsSpan.textContent = numRounds;
            if (currentCategory) {
                updateTotalPicks();
                validateRoundConfiguration();
            }
        }
    });
    
    continueToCategoriesBtn.addEventListener('click', () => {
        if (numPlayers >= 2 && numPlayers <= 8) {
            document.getElementById('playerCountScreen').style.display = 'none';
            document.getElementById('categoryScreen').style.display = 'block';
            loadCategories();
        }
    });
    
    backToPlayersBtn.addEventListener('click', () => {
        document.getElementById('categoryScreen').style.display = 'none';
        document.getElementById('playerCountScreen').style.display = 'block';
    });
    
    backToCategoryBtn2.addEventListener('click', () => {
        document.getElementById('roundsScreen').style.display = 'none';
        document.getElementById('categoryScreen').style.display = 'block';
    });
    
    startDraftBtn.addEventListener('click', () => {
        if (!startDraftBtn.disabled) {
            startDraft();
        }
    });
    
    backToStartBtn.addEventListener('click', () => {
        stopTimer();
        fullReset();
    });
    
    resetGameBtn.addEventListener('click', () => {
        if (confirm('Reset the current draft? All progress will be lost.')) {
            stopTimer();
            startDraft();
        }
    });
    
    forceEndTurnBtn.addEventListener('click', () => {
        if (currentPickIndex < draftOrder.length) {
            forceSkipTurn();
        } else {
            showToast("Draft is already complete!");
        }
    });
    
    if (newDraftFromScoreBtn) {
        newDraftFromScoreBtn.addEventListener('click', () => {
            fullReset();
        });
    }
}

function init() {
    setupConfiguration();
    document.getElementById('playerCountScreen').style.display = 'block';
    document.getElementById('categoryScreen').style.display = 'none';
    document.getElementById('roundsScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('finalScoreScreen').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    init();
});