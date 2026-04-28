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

// Display results
function displayResults(results) {
    console.log('Displaying results:', results);
    
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer) {
        console.error('Results container not found');
        return;
    }
    
    resultsContainer.innerHTML = '';
    
    // Sort by place (already sorted, but ensure)
    const sortedResults = [...results].sort((a, b) => a.place - b.place);
    
    sortedResults.forEach((player, index) => {
        console.log(`Rendering player ${index + 1}:`, player);
        
        // Create result card
        const card = document.createElement('div');
        card.className = 'result-card';
        
        // Determine medal for top 3
        let medal = '';
        let placeColor = '#94a3b8';
        if (player.place === 1) {
            medal = '🥇';
            placeColor = '#facc15';
        } else if (player.place === 2) {
            medal = '🥈';
            placeColor = '#c0c0c0';
        } else if (player.place === 3) {
            medal = '🥉';
            placeColor = '#cd7f32';
        }
        
        // Get player name safely
        const playerName = player.playerName || `Player ${player.playerIndex + 1}`;
        
        // Build card HTML
        card.innerHTML = `
            <div class="result-header" style="border-left-color: ${placeColor}">
                <div class="result-place">
                    <span class="place-number">${player.place}</span>
                    <span class="place-medal">${medal}</span>
                </div>
                <div class="result-player-info">
                    <div class="result-player-name">${escapeHtml(playerName)}</div>
                    <div class="result-player-score">⭐ Total Score: ${player.totalScore || 0}</div>
                </div>
                <div class="result-player-icon">${getPlayerIcon(player.playerIndex || index)}</div>
            </div>
            <div class="result-items">
                <div class="result-items-title">📦 Drafted Items:</div>
                <div class="result-items-list">
                    ${player.items && player.items.length > 0 
                        ? player.items.map((item, idx) => `
                            <div class="result-item">
                                <span class="result-item-number">${idx + 1}.</span>
                                <span class="result-item-name">${escapeHtml(item.name)}</span>
                                <span class="result-item-score">⭐ ${item.score || 0}</span>
                            </div>
                        `).join('')
                        : '<div class="no-items">No items drafted</div>'
                    }
                </div>
            </div>
        `;
        
        resultsContainer.appendChild(card);
    });
    
    // Update summary stats
    updateSummaryStats(sortedResults);
}

function updateSummaryStats(results) {
    const winner = results[0];
    const totalPlayers = results.length;
    const averageScore = results.reduce((sum, p) => sum + (p.totalScore || 0), 0) / totalPlayers;
    
    const summaryDiv = document.getElementById('summaryStats');
    if (summaryDiv) {
        summaryDiv.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">🏆</div>
                <div class="stat-label">Winner</div>
                <div class="stat-value">${escapeHtml(winner?.playerName || 'Unknown')}</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div class="stat-label">Players</div>
                <div class="stat-value">${totalPlayers}</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⭐</div>
                <div class="stat-label">Average Score</div>
                <div class="stat-value">${averageScore.toFixed(1)}</div>
            </div>
        `;
    }
}

function getPlayerIcon(index) {
    const icons = ['👑', '🏆', '⭐', '💎', '🌟', '⚡', '🔥', '💫'];
    return icons[index % icons.length];
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;'
        if (m === '>') return '&gt;';
        return m;
    });
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
    const homeBtn = document.getElementById('homeBtn');
    
    if (newDraftBtn) {
        newDraftBtn.addEventListener('click', () => {
            localStorage.removeItem('draftResults');
            localStorage.removeItem('multiplayerDraft');
            localStorage.removeItem('draftConfig');
            window.location.href = 'index.html';
        });
    }
    
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
}

// Initialize
function init() {
    console.log('Initializing results page');
    
    const results = loadResults();
    if (results) {
        displayResults(results);
        setupNavigation();
        
        // Clear results from localStorage after displaying (optional)
        // localStorage.removeItem('draftResults');
    }
}

document.addEventListener('DOMContentLoaded', init);