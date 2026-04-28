// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

console.log('=== RESULTS PAGE LOADED ===');

// Get results from localStorage
function loadResults() {
    const resultsData = localStorage.getItem('draftResults');
    console.log('Raw results data:', resultsData);
    
    if (!resultsData) {
        console.error('No results found in localStorage');
        showError('No draft results found. Please complete a draft first.');
        return null;
    }
    
    try {
        const results = JSON.parse(resultsData);
        console.log('Parsed results:', results);
        
        if (!results || !Array.isArray(results) || results.length === 0) {
            console.error('Invalid results format');
            showError('Invalid results data.');
            return null;
        }
        
        return results;
    } catch (error) {
        console.error('Error parsing results:', error);
        showError('Error loading results.');
        return null;
    }
}

// Display podium with only top 3 (or top 2 if only 2 players)
function displayPodium(results) {
    console.log('Displaying podium:', results);
    
    const podiumContainer = document.getElementById('podiumContainer');
    if (!podiumContainer) {
        console.error('Podium container not found');
        return;
    }
    
    podiumContainer.innerHTML = '';
    
    // Sort by place
    const sortedResults = [...results].sort((a, b) => a.place - b.place);
    const totalPlayers = sortedResults.length;
    
    // Get top 3 (or fewer if less players)
    const topPlayers = sortedResults.slice(0, Math.min(3, totalPlayers));
    
    // Create podium layout based on number of players
    if (totalPlayers === 1) {
        // Only 1 player - show single winner
        podiumContainer.innerHTML = createSingleWinnerCard(topPlayers[0]);
    } else if (totalPlayers === 2) {
        // 2 players - show 1st and 2nd
        podiumContainer.innerHTML = createTwoPlayerPodium(topPlayers);
    } else {
        // 3+ players - show classic podium (2nd, 1st, 3rd)
        podiumContainer.innerHTML = createThreePlayerPodium(topPlayers);
    }
}

function createSingleWinnerCard(winner) {
    const playerName = winner.playerName || `Player ${winner.playerIndex + 1}`;
    
    return `
        <div class="podium-single">
            <div class="podium-medal">👑</div>
            <div class="podium-name">${escapeHtml(playerName)}</div>
            <div class="podium-place">WINNER!</div>
        </div>
    `;
}

function createTwoPlayerPodium(players) {
    const first = players[0];
    const second = players[1];
    
    const firstName = first.playerName || `Player ${first.playerIndex + 1}`;
    const secondName = second.playerName || `Player ${second.playerIndex + 1}`;
    
    return `
        <div class="podium-two">
            <div class="podium-item podium-second">
                <div class="podium-medal">🥈</div>
                <div class="podium-name">${escapeHtml(secondName)}</div>
                <div class="podium-place">2nd Place</div>
            </div>
            <div class="podium-item podium-first">
                <div class="podium-medal">🥇</div>
                <div class="podium-name">${escapeHtml(firstName)}</div>
                <div class="podium-place">1st Place</div>
            </div>
        </div>
    `;
}

function createThreePlayerPodium(players) {
    const first = players.find(p => p.place === 1);
    const second = players.find(p => p.place === 2);
    const third = players.find(p => p.place === 3);
    
    const firstName = first?.playerName || (first ? `Player ${first.playerIndex + 1}` : 'Unknown');
    const secondName = second?.playerName || (second ? `Player ${second.playerIndex + 1}` : 'Unknown');
    const thirdName = third?.playerName || (third ? `Player ${third.playerIndex + 1}` : 'Unknown');
    
    return `
        <div class="podium-three">
            <div class="podium-column">
                <div class="podium-spot second-spot">
                    <div class="podium-medal">🥈</div>
                    <div class="podium-name">${escapeHtml(secondName)}</div>
                    <div class="podium-place">2nd</div>
                </div>
                <div class="podium-pedestal pedestal-second"></div>
            </div>
            <div class="podium-column">
                <div class="podium-spot first-spot">
                    <div class="podium-medal">🥇</div>
                    <div class="podium-name">${escapeHtml(firstName)}</div>
                    <div class="podium-place">1st</div>
                </div>
                <div class="podium-pedestal pedestal-first"></div>
            </div>
            <div class="podium-column">
                <div class="podium-spot third-spot">
                    <div class="podium-medal">🥉</div>
                    <div class="podium-name">${escapeHtml(thirdName)}</div>
                    <div class="podium-place">3rd</div>
                </div>
                <div class="podium-pedestal pedestal-third"></div>
            </div>
        </div>
    `;
}

function showError(message) {
    const podiumContainer = document.getElementById('podiumContainer');
    if (podiumContainer) {
        podiumContainer.innerHTML = `
            <div class="error-message">
                <span class="error-icon">⚠️</span>
                <p>${escapeHtml(message)}</p>
                <button onclick="window.location.href='index.html'" class="primary-btn">Return to Home</button>
            </div>
        `;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
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

// Setup navigation buttons
function setupNavigation() {
    const newDraftBtn = document.getElementById('newDraftBtn');
    
    if (newDraftBtn) {
        newDraftBtn.addEventListener('click', () => {
            // Clear all draft data
            localStorage.removeItem('draftResults');
            localStorage.removeItem('multiplayerDraft');
            localStorage.removeItem('draftConfig');
            localStorage.removeItem('draftSetup');
            localStorage.removeItem('gameConfig');
            localStorage.removeItem('mySocketId');
            localStorage.removeItem('myPlayerName');
            window.location.href = 'index.html';
        });
    }
}

// Initialize
function init() {
    console.log('Initializing results page');
    
    const results = loadResults();
    if (results) {
        displayPodium(results);
        setupNavigation();
    }
}

document.addEventListener('DOMContentLoaded', init);