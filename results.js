// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'
    : 'https://draft-backend-f40v.onrender.com/api';

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
    if (player.place === 1) {
        medalHtml = '<div class="result-medal">🥇</div>';
        placeColor = '#facc15';
    } else if (player.place === 2) {
        medalHtml = '<div class="result-medal">🥈</div>';
        placeColor = '#c0c0c0';
    } else if (player.place === 3) {
        medalHtml = '<div class="result-medal">🥉</div>';
        placeColor = '#cd7f32';
    }
    
    // Get best and worst picks
    const bestPick = getBestPick(player.items);
    const worstPick = getWorstPick(player.items);
    
    // Get chemistry moves (synergies and conflicts)
    const chemistryMoves = getChemistryMoves(player);
    
    card.innerHTML = `
        <div class="result-header" style="border-left-color: ${placeColor}">
            ${medalHtml}
            <div class="result-info">
                <div class="result-name">${escapeHtml(player.playerName)}</div>
                <div class="result-place">${getPlaceText(player.place)}</div>
            </div>
            <div class="result-picks-count">📦 ${player.items.length} picks</div>
        </div>
        
        <div class="result-details">
            <div class="result-best-worst">
                <div class="result-best">
                    <span class="result-label">🏆 Best Pick:</span>
                    <span class="result-value">${bestPick ? escapeHtml(bestPick.name) : 'None'}</span>
                </div>
                <div class="result-worst">
                    <span class="result-label">📉 Worst Pick:</span>
                    <span class="result-value">${worstPick ? escapeHtml(worstPick.name) : 'None'}</span>
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

function getBestPick(items) {
    if (!items || items.length === 0) return null;
    // Sort by score (assuming items have a score property)
    const sorted = [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
    return sorted[0];
}

function getWorstPick(items) {
    if (!items || items.length === 0) return null;
    const sorted = [...items].sort((a, b) => (a.score || 0) - (b.score || 0));
    return sorted[0];
}

function getChemistryMoves(player) {
    const moves = [];
    
    // Check for synergies and conflicts in player's items
    // This would be populated from the backend during draft
    if (player.chemistry && player.chemistry.length > 0) {
        return player.chemistry;
    }
    
    // Fallback: Calculate chemistry from item combinations
    if (player.items && player.items.length > 1) {
        for (let i = 0; i < player.items.length; i++) {
            for (let j = i + 1; j < player.items.length; j++) {
                // This would need to check against a chemistry lookup
                // For now, just a placeholder
            }
        }
    }
    
    return moves;
}

function getPlaceText(place) {
    if (place === 1) return 'Champion';
    if (place === 2) return 'Runner Up';
    if (place === 3) return 'Third Place';
    return `${place}th Place`;
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
    const results = loadResults();
    if (results) {
        displayResults(results);
        setupNavigation();
    }
}

document.addEventListener('DOMContentLoaded', init);