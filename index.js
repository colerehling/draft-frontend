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
    document.getElementById('summaryPlayers').textContent = hostNumPlayers;
    document.getElementById('summaryDraftMode').textContent = draftMode === 'simple' ? '📋 Simple' : '🎯 Dynamic';
    
    if (draftMode === 'simple') {
        document.getElementById('summaryCategory').textContent = hostSelectedCategoryName || 'Not selected';
        const draftType = document.querySelector('input[name="draftTypeHost"]:checked')?.value || 'snake';
        document.getElementById('summaryDraftType').querySelector('.stat-value').textContent = draftType === 'snake' ? '🐍 Snake' : '📋 Regular';
        document.getElementById('summaryTotalPicks').textContent = hostNumPlayers * hostNumRounds;
    } else {
        document.getElementById('summaryCategory').textContent = hostSelectedTemplateName || 'Not selected';
        const dynamicDraftType = document.querySelector('input[name="dynamicDraftType"]:checked')?.value || 'snake';
        document.getElementById('summaryDraftType').querySelector('.stat-value').textContent = dynamicDraftType === 'snake' ? '🐍 Snake' : '📋 Regular';
        const totalPicks = hostNumPlayers * (hostSelectedTemplateSlots?.length || 0);
        document.getElementById('summaryTotalPicks').textContent = totalPicks;
    }
    
    document.getElementById('summaryTimer').textContent = hostTimerMinutes + ' min';
}

async function loadCategoriesForHost() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        const data = await response.json();
        if (data.success && data.categories) {
            const grid = document.getElementById('categoryGridHost');
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
                    document.getElementById('selectedCategoryDisplay').style.display = 'flex';
                    document.getElementById('selectedCategoryNameHost').textContent = hostSelectedCategoryName;
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
                    document.getElementById('selectedTemplateDisplay').style.display = 'flex';
                    document.getElementById('selectedTemplateName').textContent = hostSelectedTemplateName;
                    document.getElementById('selectedTemplateRounds').textContent = `${template.total_rounds} rounds`;
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
    
    // Simple mode elements
    document.getElementById('simpleCategoryCard').style.display = isSimple ? 'block' : 'none';
    document.getElementById('simpleOrderCard').style.display = isSimple ? 'block' : 'none';
    document.getElementById('simpleRoundsCard').style.display = isSimple ? 'block' : 'none';
    
    // Dynamic mode elements
    document.getElementById('dynamicTemplateCard').style.display = !isSimple ? 'block' : 'none';
    document.getElementById('dynamicOrderCard').style.display = !isSimple ? 'block' : 'none';
    
    // Clear selections when switching
    if (!isSimple) {
        hostSelectedCategory = null;
        hostSelectedCategoryName = null;
        document.getElementById('selectedCategoryDisplay').style.display = 'none';
        document.querySelectorAll('#categoryGridHost .category-card-small').forEach(c => c.classList.remove('selected'));
    } else {
        hostSelectedTemplate = null;
        hostSelectedTemplateName = null;
        document.getElementById('selectedTemplateDisplay').style.display = 'none';
        document.querySelectorAll('#dynamicTemplateGrid .category-card-small').forEach(c => c.classList.remove('selected'));
    }
    
    updateHostSummary();
}

// Event Listeners
document.getElementById('hostOption').onclick = () => {
    hostJoinScreen.style.display = 'none';
    hostSettingsScreen.style.display = 'block';
    loadCategoriesForHost();
    loadDynamicTemplates();
    
    const hostNameInput = document.getElementById('hostNameInput');
    if (hostNameInput) hostNameInput.value = 'Player 1';
    
    // Set up draft mode toggle
    const modeRadios = document.querySelectorAll('input[name="draftTypeMode"]');
    modeRadios.forEach(radio => {
        radio.onchange = () => {
            draftMode = radio.value;
            toggleDraftModeUI();
        };
    });
    toggleDraftModeUI();
};

document.getElementById('joinOption').onclick = () => {
    hostJoinScreen.style.display = 'none';
    joinSettingsScreen.style.display = 'block';
};

document.getElementById('backToHostJoinBtn').onclick = () => {
    hostSettingsScreen.style.display = 'none';
    hostJoinScreen.style.display = 'block';
};

document.getElementById('backToHostJoinJoinBtn').onclick = () => {
    joinSettingsScreen.style.display = 'none';
    hostJoinScreen.style.display = 'block';
};

document.getElementById('decPlayersHost').onclick = () => {
    if (hostNumPlayers > 2) {
        hostNumPlayers--;
        document.getElementById('numPlayersHost').textContent = hostNumPlayers;
        updateHostSummary();
    }
};

document.getElementById('incPlayersHost').onclick = () => {
    if (hostNumPlayers < 8) {
        hostNumPlayers++;
        document.getElementById('numPlayersHost').textContent = hostNumPlayers;
        updateHostSummary();
    }
};

document.getElementById('decRoundsHost').onclick = () => {
    if (hostNumRounds > 3) {
        hostNumRounds--;
        document.getElementById('numRoundsHost').textContent = hostNumRounds;
        updateHostSummary();
    }
};

document.getElementById('incRoundsHost').onclick = () => {
    if (hostNumRounds < 10) {
        hostNumRounds++;
        document.getElementById('numRoundsHost').textContent = hostNumRounds;
        updateHostSummary();
    }
};

document.getElementById('decTimeHost').onclick = () => {
    if (hostTimerMinutes > 1) {
        hostTimerMinutes--;
        document.getElementById('timerMinutesHost').textContent = hostTimerMinutes;
        updateHostSummary();
    }
};

document.getElementById('incTimeHost').onclick = () => {
    if (hostTimerMinutes < 5) {
        hostTimerMinutes++;
        document.getElementById('timerMinutesHost').textContent = hostTimerMinutes;
        updateHostSummary();
    }
};

document.querySelectorAll('input[name="draftTypeHost"]').forEach(radio => {
    radio.onchange = () => updateHostSummary();
});

document.querySelectorAll('input[name="dynamicDraftType"]').forEach(radio => {
    radio.onchange = () => updateHostSummary();
});

document.getElementById('clearCategoryBtn').onclick = () => {
    hostSelectedCategory = null;
    hostSelectedCategoryName = null;
    document.getElementById('selectedCategoryDisplay').style.display = 'none';
    document.querySelectorAll('#categoryGridHost .category-card-small').forEach(c => c.classList.remove('selected'));
    updateHostSummary();
};

document.getElementById('clearTemplateBtn').onclick = () => {
    hostSelectedTemplate = null;
    hostSelectedTemplateName = null;
    hostSelectedTemplateSlots = [];
    document.getElementById('selectedTemplateDisplay').style.display = 'none';
    document.querySelectorAll('#dynamicTemplateGrid .category-card-small').forEach(c => c.classList.remove('selected'));
    updateHostSummary();
};

document.getElementById('createLobbyBtn').onclick = () => {
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

document.getElementById('joinGameBtn').onclick = () => {
    const roomCode = document.getElementById('roomCodeInput').value.toUpperCase();
    const playerName = document.getElementById('playerNameInput').value.trim();
    
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

// Initialize
hostJoinScreen.style.display = 'block';
hostSettingsScreen.style.display = 'none';
joinSettingsScreen.style.display = 'none';
updateHostSummary();