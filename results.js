function displayResults() {
    const results = localStorage.getItem('draftResults');
    if (!results) {
        showToast('No results found. Redirecting to setup...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }
    
    const playerScores = JSON.parse(results);
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
}

function newDraft() {
    localStorage.removeItem('draftConfig');
    localStorage.removeItem('draftResults');
    window.location.href = 'index.html';
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

function setupEventListeners() {
    const newDraftBtn = document.getElementById('newDraftBtn');
    if (newDraftBtn) {
        newDraftBtn.addEventListener('click', () => newDraft());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    displayResults();
});