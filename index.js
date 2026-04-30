// Determine environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api'
    : 'https://draft-backend-f40v.onrender.com/api';

console.log('Setup Page Loaded');

// DOM Elements
const hostJoinScreen = document.getElementById('hostJoinScreen');
const hostSettingsScreen = document.getElementById('hostSettingsScreen');
const joinSettingsScreen = document.getElementById('joinSettingsScreen');

// Host settings
let hostNumPlayers = 2;
let hostNumRounds = 5;
let hostTimerMinutes = 3;
let hostSelectedCategory = null;
let hostSelectedCategoryName = null;
let hostSelectedCategoryCount = 0;
let hostSelectedTemplate = null;
let hostSelectedTemplateName = null;
let hostSelectedTemplateSlots = [];
let hostName = 'Player 1';
let draftMode = 'simple'; // 'simple' or 'dynamic'

function showToast(message, duration = 2200) {
    const toastEl = document.getElementById('toastMsg');
    if (toastEl) {
        toastEl.innerText = message;
        toastEl.style.opacity = '1';
        setTimeout(() => toastEl.style.opacity = '0', duration);
    }
}

function updateDbStatus(message, color = '#facc15') {
    const statusEl = document.getElementById('dbStatus');
    if (statusEl) {
        statusEl.innerHTML = message;
        statusEl.style.color = color;
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
        'vacation_destinations': '✈️',
        'sodas': '🥤',
        'cereals': '🥣',
        'fast_food': '🍔',
        'dog_breeds': '🐶',
        'animated_dogs': '🐕‍🦺',
        'fruits': '🍏',
        'fast_food_meal': '🍔',
        'movie_night': '🎬',
        'beach_day': '🏖️'
    };
    return iconMap[tableName] || '👽';
}

function updateHostSummary() {
    const summaryPlayerName = document.getElementById('summaryPlayerName');
    const summaryPlayers = document.getElementById('summaryPlayers');
    const summaryDraftMode = document.getElementById('summaryDraftMode');
    const summaryCategory = document.getElementById('summaryCategory');
    const summaryDraftType = document.getElementById('summaryDraftType');
    const summaryTotalPicks = document.getElementById('summaryTotalPicks');
    const summaryTimer = document.getElementById('summaryTimer');
    
    // Get current host name from input
    const hostNameInput = document.getElementById('hostNameInput');
    const currentHostName = hostNameInput ? hostNameInput.value.trim() : 'Player 1';
    
    if (summaryPlayerName) summaryPlayerName.textContent = currentHostName || 'Player 1';
    if (summaryPlayers) summaryPlayers.textContent = hostNumPlayers;
    if (summaryDraftMode) summaryDraftMode.textContent = draftMode === 'simple' ? '📋 Simple' : '🎯 Dynamic';
    
    if (draftMode === 'simple') {
        if (summaryCategory) summaryCategory.textContent = hostSelectedCategoryName || 'Not selected';
        const draftType = document.querySelector('input[name="draftTypeHost"]:checked')?.value || 'snake';
        if (summaryDraftType) summaryDraftType.textContent = draftType === 'snake' ? '🐍 Snake' : '📋 Regular';
        if (summaryTotalPicks) summaryTotalPicks.textContent = hostNumPlayers * hostNumRounds;
    } else {
        if (summaryCategory) summaryCategory.textContent = hostSelectedTemplateName || 'Not selected';
        const dynamicDraftType = document.querySelector('input[name="dynamicDraftType"]:checked')?.value || 'snake';
        if (summaryDraftType) summaryDraftType.textContent = dynamicDraftType === 'snake' ? '🐍 Snake' : '📋 Regular';
        const totalPicks = hostNumPlayers * (hostSelectedTemplateSlots?.length || 0);
        if (summaryTotalPicks) summaryTotalPicks.textContent = totalPicks;
    }
    
    if (summaryTimer) summaryTimer.textContent = hostTimerMinutes + ' min';
}

async function loadCategoriesForHost() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        const data = await response.json();
        if (data.success && data.categories) {
            const grid = document.getElementById('categoryGridHost');
            if (!grid) return;
            grid.innerHTML = '';
            data.categories.forEach(cat => {
                const card = document.createElement('div');
                card.className = 'category-card-small';
                card.innerHTML = `
                    <span class="category-icon-small">${getCategoryIcon(cat.table_name)}</span>
                    <span class="category-name-small">${formatCategoryName(cat.table_name)}</span>
                    <span class="category-count-small">${cat.item_count} items</span>
                `;
                card.onclick = () => {
                    document.querySelectorAll('#categoryGridHost .category-card-small').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    hostSelectedCategory = cat.table_name;
                    hostSelectedCategoryName = formatCategoryName(cat.table_name);
                    hostSelectedCategoryCount = cat.item_count;
                    const selectedDisplay = document.getElementById('selectedCategoryDisplay');
                    const selectedNameSpan = document.getElementById('selectedCategoryNameHost');
                    if (selectedDisplay) selectedDisplay.style.display = 'flex';
                    if (selectedNameSpan) selectedNameSpan.textContent = hostSelectedCategoryName;
                    updateHostSummary();
                };
                grid.appendChild(card);
            });
            updateDbStatus('✅ Ready', '#10b981');
        }
    } catch (error) {
        updateDbStatus('❌ Error', '#ef4444');
        showToast('Failed to load categories', 3000);
    }
}

async function loadDynamicTemplates() {
    try {
        const response = await fetch(`${API_BASE_URL}/dynamic-templates`);
        const data = await response.json();
        if (data.success && data.templates) {
            const grid = document.getElementById('dynamicTemplateGrid');
            if (!grid) return;
            grid.innerHTML = '';
            data.templates.forEach(template => {
                const card = document.createElement('div');
                card.className = 'category-card-small';
                card.innerHTML = `
                    <span class="category-icon-small">${getCategoryIcon(template.template_name)}</span>
                    <span class="category-name-small">${template.display_name}</span>
                    <span class="category-count-small">${template.total_rounds} slots</span>
                `;
                card.onclick = () => {
                    document.querySelectorAll('#dynamicTemplateGrid .category-card-small').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    hostSelectedTemplate = template.template_name;
                    hostSelectedTemplateName = template.display_name;
                    hostSelectedTemplateSlots = template.slots || [];
                    const selectedDisplay = document.getElementById('selectedTemplateDisplay');
                    const selectedNameSpan = document.getElementById('selectedTemplateName');
                    const selectedRoundsSpan = document.getElementById('selectedTemplateRounds');
                    if (selectedDisplay) selectedDisplay.style.display = 'flex';
                    if (selectedNameSpan) selectedNameSpan.textContent = hostSelectedTemplateName;
                    if (selectedRoundsSpan) selectedRoundsSpan.textContent = `${template.total_rounds} rounds`;
                    updateHostSummary();
                };
                grid.appendChild(card);
            });
        }
    } catch (error) {
        showToast('Failed to load dynamic templates', 3000);
    }
}

function toggleDraftModeUI() {
    const isSimple = draftMode === 'simple';
    
    const simpleCategoryCard = document.getElementById('simpleCategoryCard');
    const simpleOrderCard = document.getElementById('simpleOrderCard');
    const simpleRoundsCard = document.getElementById('simpleRoundsCard');
    const dynamicTemplateCard = document.getElementById('dynamicTemplateCard');
    const dynamicOrderCard = document.getElementById('dynamicOrderCard');
    
    if (simpleCategoryCard) simpleCategoryCard.style.display = isSimple ? 'block' : 'none';
    if (simpleOrderCard) simpleOrderCard.style.display = isSimple ? 'block' : 'none';
    if (simpleRoundsCard) simpleRoundsCard.style.display = isSimple ? 'block' : 'none';
    if (dynamicTemplateCard) dynamicTemplateCard.style.display = !isSimple ? 'block' : 'none';
    if (dynamicOrderCard) dynamicOrderCard.style.display = !isSimple ? 'block' : 'none';
    
    if (!isSimple) {
        hostSelectedCategory = null;
        hostSelectedCategoryName = null;
        const selectedDisplay = document.getElementById('selectedCategoryDisplay');
        if (selectedDisplay) selectedDisplay.style.display = 'none';
        document.querySelectorAll('#categoryGridHost .category-card-small').forEach(c => c.classList.remove('selected'));
    } else {
        hostSelectedTemplate = null;
        hostSelectedTemplateName = null;
        const selectedDisplay = document.getElementById('selectedTemplateDisplay');
        if (selectedDisplay) selectedDisplay.style.display = 'none';
        document.querySelectorAll('#dynamicTemplateGrid .category-card-small').forEach(c => c.classList.remove('selected'));
    }
    
    updateHostSummary();
}

function setupDraftModeDropdown() {
    const draftModeSelect = document.getElementById('draftModeSelect');
    if (draftModeSelect) {
        draftModeSelect.addEventListener('change', (e) => {
            draftMode = e.target.value;
            toggleDraftModeUI();
            updateHostSummary();
        });
    }
}

// Event Listeners
const hostOption = document.getElementById('hostOption');
if (hostOption) {
    hostOption.onclick = () => {
        if (hostJoinScreen) hostJoinScreen.style.display = 'none';
        if (hostSettingsScreen) hostSettingsScreen.style.display = 'block';
        loadCategoriesForHost();
        loadDynamicTemplates();
        
        const hostNameInput = document.getElementById('hostNameInput');
        if (hostNameInput) hostNameInput.value = 'Player 1';
        
        // Setup draft mode dropdown
        setupDraftModeDropdown();
        toggleDraftModeUI();
        
        // Update summary when name changes
        if (hostNameInput) {
            hostNameInput.addEventListener('input', () => updateHostSummary());
        }
        
        // Reset draft mode select to default
        const draftModeSelect = document.getElementById('draftModeSelect');
        if (draftModeSelect) draftModeSelect.value = 'simple';
        draftMode = 'simple';
        toggleDraftModeUI();
    };
}

const joinOption = document.getElementById('joinOption');
if (joinOption) {
    joinOption.onclick = () => {
        if (hostJoinScreen) hostJoinScreen.style.display = 'none';
        if (joinSettingsScreen) joinSettingsScreen.style.display = 'block';
    };
}

const backToHostJoinBtn = document.getElementById('backToHostJoinBtn');
if (backToHostJoinBtn) {
    backToHostJoinBtn.onclick = () => {
        if (hostSettingsScreen) hostSettingsScreen.style.display = 'none';
        if (hostJoinScreen) hostJoinScreen.style.display = 'block';
    };
}

const backToHostJoinJoinBtn = document.getElementById('backToHostJoinJoinBtn');
if (backToHostJoinJoinBtn) {
    backToHostJoinJoinBtn.onclick = () => {
        if (joinSettingsScreen) joinSettingsScreen.style.display = 'none';
        if (hostJoinScreen) hostJoinScreen.style.display = 'block';
    };
}

const decPlayersHost = document.getElementById('decPlayersHost');
if (decPlayersHost) {
    decPlayersHost.onclick = () => {
        if (hostNumPlayers > 2) {
            hostNumPlayers--;
            const numPlayersSpan = document.getElementById('numPlayersHost');
            if (numPlayersSpan) numPlayersSpan.textContent = hostNumPlayers;
            updateHostSummary();
        }
    };
}

const incPlayersHost = document.getElementById('incPlayersHost');
if (incPlayersHost) {
    incPlayersHost.onclick = () => {
        if (hostNumPlayers < 8) {
            hostNumPlayers++;
            const numPlayersSpan = document.getElementById('numPlayersHost');
            if (numPlayersSpan) numPlayersSpan.textContent = hostNumPlayers;
            updateHostSummary();
        }
    };
}

const decRoundsHost = document.getElementById('decRoundsHost');
if (decRoundsHost) {
    decRoundsHost.onclick = () => {
        if (hostNumRounds > 3) {
            hostNumRounds--;
            const numRoundsSpan = document.getElementById('numRoundsHost');
            if (numRoundsSpan) numRoundsSpan.textContent = hostNumRounds;
            updateHostSummary();
        }
    };
}

const incRoundsHost = document.getElementById('incRoundsHost');
if (incRoundsHost) {
    incRoundsHost.onclick = () => {
        if (hostNumRounds < 10) {
            hostNumRounds++;
            const numRoundsSpan = document.getElementById('numRoundsHost');
            if (numRoundsSpan) numRoundsSpan.textContent = hostNumRounds;
            updateHostSummary();
        }
    };
}

const decTimeHost = document.getElementById('decTimeHost');
if (decTimeHost) {
    decTimeHost.onclick = () => {
        if (hostTimerMinutes > 1) {
            hostTimerMinutes--;
            const timerMinutesSpan = document.getElementById('timerMinutesHost');
            if (timerMinutesSpan) timerMinutesSpan.textContent = hostTimerMinutes;
            updateHostSummary();
        }
    };
}

const incTimeHost = document.getElementById('incTimeHost');
if (incTimeHost) {
    incTimeHost.onclick = () => {
        if (hostTimerMinutes < 5) {
            hostTimerMinutes++;
            const timerMinutesSpan = document.getElementById('timerMinutesHost');
            if (timerMinutesSpan) timerMinutesSpan.textContent = hostTimerMinutes;
            updateHostSummary();
        }
    };
}

document.querySelectorAll('input[name="draftTypeHost"]').forEach(radio => {
    radio.onchange = () => updateHostSummary();
});

document.querySelectorAll('input[name="dynamicDraftType"]').forEach(radio => {
    radio.onchange = () => updateHostSummary();
});

const clearCategoryBtn = document.getElementById('clearCategoryBtn');
if (clearCategoryBtn) {
    clearCategoryBtn.onclick = () => {
        hostSelectedCategory = null;
        hostSelectedCategoryName = null;
        const selectedDisplay = document.getElementById('selectedCategoryDisplay');
        if (selectedDisplay) selectedDisplay.style.display = 'none';
        document.querySelectorAll('#categoryGridHost .category-card-small').forEach(c => c.classList.remove('selected'));
        updateHostSummary();
    };
}

const clearTemplateBtn = document.getElementById('clearTemplateBtn');
if (clearTemplateBtn) {
    clearTemplateBtn.onclick = () => {
        hostSelectedTemplate = null;
        hostSelectedTemplateName = null;
        hostSelectedTemplateSlots = [];
        const selectedDisplay = document.getElementById('selectedTemplateDisplay');
        if (selectedDisplay) selectedDisplay.style.display = 'none';
        document.querySelectorAll('#dynamicTemplateGrid .category-card-small').forEach(c => c.classList.remove('selected'));
        updateHostSummary();
    };
}

const createLobbyBtn = document.getElementById('createLobbyBtn');
if (createLobbyBtn) {
    createLobbyBtn.onclick = () => {
        if (draftMode === 'simple') {
            if (!hostSelectedCategory) {
                showToast('Please select a category', 3000);
                return;
            }
            const totalPicks = hostNumPlayers * hostNumRounds;
            if (totalPicks > hostSelectedCategoryCount) {
                showToast(`Need ${totalPicks} items but only ${hostSelectedCategoryCount} available`, 4000);
                return;
            }
        } else {
            if (!hostSelectedTemplate) {
                showToast('Please select a template', 3000);
                return;
            }
        }
        
        const hostNameInput = document.getElementById('hostNameInput');
        hostName = hostNameInput ? hostNameInput.value.trim() : 'Player 1';
        if (!hostName) hostName = 'Player 1';
        
        const simpleDraftOrder = document.querySelector('input[name="draftTypeHost"]:checked')?.value || 'snake';
        const dynamicDraftOrder = document.querySelector('input[name="dynamicDraftType"]:checked')?.value || 'snake';
        
        const config = {
            isHost: true,
            hostName: hostName,
            numPlayers: hostNumPlayers,
            draftMode: draftMode,
            timerMinutes: hostTimerMinutes
        };
        
        if (draftMode === 'simple') {
            config.category = hostSelectedCategory;
            config.categoryName = hostSelectedCategoryName;
            config.numRounds = hostNumRounds;
            config.draftType = simpleDraftOrder;
        } else {
            config.templateName = hostSelectedTemplate;
            config.templateDisplayName = hostSelectedTemplateName;
            config.draftType = dynamicDraftOrder;
        }
        
        localStorage.setItem('draftSetup', JSON.stringify(config));
        window.location.href = 'draft.html';
    };
}

const joinGameBtn = document.getElementById('joinGameBtn');
if (joinGameBtn) {
    joinGameBtn.onclick = () => {
        const roomCodeInput = document.getElementById('roomCodeInput');
        const playerNameInput = document.getElementById('playerNameInput');
        
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
        
        const config = {
            isHost: false,
            roomCode: roomCode,
            playerName: playerName
        };
        
        localStorage.setItem('draftSetup', JSON.stringify(config));
        window.location.href = 'draft.html';
    };
}

// Initialize
if (hostJoinScreen) hostJoinScreen.style.display = 'block';
if (hostSettingsScreen) hostSettingsScreen.style.display = 'none';
if (joinSettingsScreen) joinSettingsScreen.style.display = 'none';
updateHostSummary();