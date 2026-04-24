// Determine if we're in development or production
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

// Use localhost for development, Render URL for production
const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'  // Local development
    : 'https://draft-backend-f40v.onrender.com/api';  // Production on Render

console.log(`API running in ${isDevelopment ? 'development' : 'production'} mode`);
console.log(`API URL: ${API_BASE_URL}`);

let numPlayers = 2;
let numRounds = 5;
let timerMinutes = 3;
let selectedCategory = null;
let selectedCategoryName = null;
let selectedCategoryCount = 0;

// Load categories dynamically from database
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
            throw new Error('No categories found');
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        updateDbStatus('❌ Connection Error', '#ef4444');
        showToast(`Could not connect to server: ${error.message}`, 5000);
    }
}

// Format category name: replace underscores with spaces and capitalize words
function formatCategoryName(tableName) {
    return tableName.replace(/_/g, ' ').split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

// Get icon based on category name
function getCategoryIcon(tableName) {
    const iconMap = {
        'ice_cream_flavors': '🍦',
        'pizza_toppings': '🍕',
        'movie_genres': '🎬',
        'vacation_destinations': '✈️'
    };
    return iconMap[tableName] || '📦';
}

// Display category cards
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

// Select category and go to settings
function selectCategory(category, categoryName, itemCount) {
    selectedCategory = category;
    selectedCategoryName = categoryName;
    selectedCategoryCount = itemCount;
    
    // Update display in settings screen
    const categoryNameDisplay = document.getElementById('categoryNameDisplay');
    if (categoryNameDisplay) {
        categoryNameDisplay.textContent = categoryName;
    }
    
    // Go to settings screen
    document.getElementById('categoryScreen').style.display = 'none';
    document.getElementById('settingsScreen').style.display = 'block';
    updateTotalPicksDisplay();
}

// Start the draft
async function startDraft() {
    const totalPicks = numPlayers * numRounds;
    
    if (totalPicks > selectedCategoryCount) {
        showToast(`⚠️ Need ${totalPicks} items but only ${selectedCategoryCount} available. Reduce players or rounds.`, 4000);
        return;
    }
    
    // First, fetch items with scores for the selected category
    try {
        console.log(`Fetching items for category: ${selectedCategory}`);
        const response = await fetch(`${API_BASE_URL}/items/${selectedCategory}/with-scores`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch items: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.items) {
            // Save draft configuration and items to localStorage
            const draftConfig = {
                numPlayers: numPlayers,
                category: selectedCategory,
                categoryName: selectedCategoryName,
                numRounds: numRounds,
                timerMinutes: timerMinutes,
                items: data.items  // Save the items with scores
            };
            localStorage.setItem('draftConfig', JSON.stringify(draftConfig));
            
            // Redirect to draft page
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

function setupConfiguration() {
    // Get all DOM elements
    const decPlayers = document.getElementById('decPlayers');
    const incPlayers = document.getElementById('incPlayers');
    const numPlayersSpan = document.getElementById('numPlayers');
    
    const decRounds = document.getElementById('decRounds');
    const incRounds = document.getElementById('incRounds');
    const numRoundsSpan = document.getElementById('numRounds');
    
    const decTime = document.getElementById('decTime');
    const incTime = document.getElementById('incTime');
    const timerMinutesSpan = document.getElementById('timerMinutes');
    
    // Navigation buttons
    const continueToCategoryBtn = document.getElementById('continueToCategoryBtn');
    const backToPlayersBtn = document.getElementById('backToPlayersBtn');
    const backToCategoryBtn = document.getElementById('backToCategoryBtn');
    const startDraftBtn = document.getElementById('startDraftBtn');
    
    // Player count controls
    if (decPlayers) {
        decPlayers.addEventListener('click', () => {
            if (numPlayers > 2) {
                numPlayers--;
                numPlayersSpan.textContent = numPlayers;
                updateTotalPicksDisplay();
            }
        });
    }
    
    if (incPlayers) {
        incPlayers.addEventListener('click', () => {
            if (numPlayers < 8) {
                numPlayers++;
                numPlayersSpan.textContent = numPlayers;
                updateTotalPicksDisplay();
            }
        });
    }
    
    // Rounds controls
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
    
    // Timer controls (1-5 minutes)
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
    
    // Navigation - Go to category selection
    if (continueToCategoryBtn) {
        continueToCategoryBtn.addEventListener('click', () => {
            document.getElementById('playerCountScreen').style.display = 'none';
            document.getElementById('categoryScreen').style.display = 'block';
            loadCategories();
        });
    }
    
    // Back to player count from category
    if (backToPlayersBtn) {
        backToPlayersBtn.addEventListener('click', () => {
            document.getElementById('categoryScreen').style.display = 'none';
            document.getElementById('playerCountScreen').style.display = 'block';
        });
    }
    
    // Back to category from settings
    if (backToCategoryBtn) {
        backToCategoryBtn.addEventListener('click', () => {
            document.getElementById('settingsScreen').style.display = 'none';
            document.getElementById('categoryScreen').style.display = 'block';
        });
    }
    
    // Start draft from settings
    if (startDraftBtn) {
        startDraftBtn.addEventListener('click', () => {
            startDraft();
        });
    }
}

function init() {
    setupConfiguration();
    updateTotalPicksDisplay();
    // Make sure the player count screen is visible initially
    document.getElementById('playerCountScreen').style.display = 'block';
    document.getElementById('categoryScreen').style.display = 'none';
    document.getElementById('settingsScreen').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    init();
});