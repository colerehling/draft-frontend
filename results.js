// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

console.log('=== RESULTS PAGE LOADED ===');

// Get results from localStorage
function loadResults() {
    const resultsData = localStorage.getItem('draftResults');
    console.log('Raw results data:', resultsData);
    
    if (!resultsData) {
        showError('No draft results found. Please complete a draft first.');
        return null;
    }
    
    try {
        const results = JSON.parse(resultsData);
        console.log('Parsed results:', results);
        
        if (!results || !Array.isArray(results) || results.length === 0) {
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

// Display all players with medals for top 3
function displayResults(results) {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    
    // Sort by place
    const sortedResults = [...results].sort((a, b) => a.place - b.place);
    
    sortedResults.forEach((player) => {
        const card = createPlayerCard(player);
        resultsContainer.appendChild(card);
    });
}

function createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    // Get medal for top 3
    let medalHtml = '';
    let placeColor = '#94a3b8';
    let placeText = '';
    
    if (player.place === 1) {
        medalHtml = '<div class="result-medal">🥇</div>';
        placeColor = '#facc15';
        placeText = '1st Place - Champion!';
    } else if (player.place === 2) {
        medalHtml = '<div class="result-medal">🥈</div>';
        placeColor = '#c0c0c0';
        placeText = '2nd Place - Runner Up';
    } else if (player.place === 3) {
        medalHtml = '<div class="result-medal">🥉</div>';
        placeColor = '#cd7f32';
        placeText = '3rd Place';
    } else {
        medalHtml = `<div class="result-medal">${player.place}th</div>`;
        placeColor = '#475569';
        placeText = `${player.place}th Place`;
    }
    
    // Get best and worst picks
    const bestPick = player.bestPick || getBestPickFromItems(player.items);
    const worstPick = player.worstPick || getWorstPickFromItems(player.items);
    
    // Get chemistry moves
    const chemistryMoves = player.chemistryMoves || [];
    
    card.innerHTML = `
        <div class="result-header" style="border-left-color: ${placeColor}">
            ${medalHtml}
            <div class="result-info">
                <div class="result-name">${escapeHtml(player.playerName)}</div>
                <div class="result-place">${placeText}</div>
            </div>
            <div class="result-picks-count">📦 ${player.items ? player.items.length : 0} picks</div>
        </div>
        
        <div class="result-details">
            <div class="result-best-worst">
                <div class="result-best">
                    <div class="result-label">🏆 Best Pick:</div>
                    <div class="result-value">${bestPick ? escapeHtml(bestPick.name) : 'None'}</div>
                </div>
                <div class="result-worst">
                    <div class="result-label">📉 Worst Pick:</div>
                    <div class="result-value">${worstPick ? escapeHtml(worstPick.name) : 'None'}</div>
                </div>
            </div>
            
            <div class="result-chemistry">
                <div class="chemistry-title">✨ Chemistry Moves ✨</div>
                <div class="chemistry-list">
                    ${chemistryMoves.length > 0 
                        ? chemistryMoves.map(move => `
                            <div class="chemistry-item ${move.type}">
                                <span class="chemistry-icon">${move.type === 'synergy' ? '✨' : '⚠️'}</span>
                                <span class="chemistry-text">${escapeHtml(move.text)}</span>
                            </div>
                        `).join('')
                        : '<div class="no-chemistry">No chemistry interactions</div>'
                    }
                </div>
            </div>
        </div>
    `;
    
    return card;
}

function getBestPickFromItems(items) {
    if (!items || items.length === 0) return null;
    // Sort by score (assuming items have a score property)
    const sorted = [...items].sort((a, b) => (b.score || b.baseScore || 0) - (a.score || a.baseScore || 0));
    return { name: sorted[0].name, score: sorted[0].score || sorted[0].baseScore };
}

function getWorstPickFromItems(items) {
    if (!items || items.length === 0) return null;
    const sorted = [...items].sort((a, b) => (a.score || a.baseScore || 0) - (b.score || b.baseScore || 0));
    return { name: sorted[0].name, score: sorted[0].score || sorted[0].baseScore };
}

function showError(message) {
    const resultsContainer = document.getElementById('resultsContainer');
    if (resultsContainer) {
        resultsContainer.innerHTML = `
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

// Setup navigation
function setupNavigation() {
    const newDraftBtn = document.getElementById('newDraftBtn');
    if (newDraftBtn) {
        newDraftBtn.addEventListener('click', () => {
            localStorage.removeItem('draftResults');
            localStorage.removeItem('multiplayerDraft');
            localStorage.removeItem('draftConfig');
            localStorage.removeItem('draftSetup');
            localStorage.removeItem('gameConfig');
            window.location.href = 'index.html';
        });
    }
}

// Initialize
function init() {
    console.log('Initializing results page');
    const results = loadResults();
    if (results) {
        console.log('Results loaded, displaying...');
        displayResults(results);
        setupNavigation();
    } else {
        console.error('No results found');
    }
}

document.addEventListener('DOMContentLoaded', init);