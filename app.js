// Global variables
let currentUser = null;
let players = [];
let currentRatingPlayerId = null;

// Available positions
const ALL_POSITIONS = [
    { group: "Goalkeeper", positions: ["GK"] },
    { group: "Defense", positions: ["CB", "LB", "RB", "LWB", "RWB", "SW"] },
    { group: "Midfield", positions: ["CDM", "CM", "CAM", "LM", "RM"] },
    { group: "Attack", positions: ["LW", "RW", "CF", "ST", "SS"] }
];

// ========== AUTH STATE ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');

        // Logout button
        document.getElementById('nav-buttons').innerHTML = `
            <button onclick="logout()">Logout</button>
        `;

        // Check profile exists
        const doc = await db.collection('players').doc(user.uid).get();
        if (!doc.exists || !doc.data().profileComplete) {
            // Should not happen with new flow, but fallback
            alert('Profile incomplete. Please contact admin.');
            auth.signOut();
            return;
        }

        loadWelcome();
        showRatePlayers(); // default view
    } else {
        currentUser = null;
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('nav-buttons').innerHTML = '';
    }
});

// ========== VIEW SWITCHERS ==========
function showLoginView() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('register-view').classList.add('hidden');
}

function showRegisterView() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('register-view').classList.remove('hidden');
    renderRegisterPositions();
}

// ========== LOGIN ==========
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert(error.message);
    }
}

// ========== REGISTER (with full details) ==========
function renderRegisterPositions() {
    const container = document.getElementById('reg-positions-container');
    let html = '';
    ALL_POSITIONS.forEach(group => {
        html += `<div style="margin-bottom:8px;"><strong>${group.group}</strong></div><div class="checkbox-group">`;
        group.positions.forEach(pos => {
            html += `
                <label>
                    <input type="checkbox" name="reg-positions" value="${pos}" onchange="updateRegPrimaryOptions()">
                    ${pos}
                </label>
            `;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

function updateRegPrimaryOptions() {
    const checkboxes = document.querySelectorAll('input[name="reg-positions"]:checked');
    const primarySelect = document.getElementById('reg-primaryPosition');
    primarySelect.innerHTML = '<option value="">Select primary...</option>';
    checkboxes.forEach(cb => {
        const opt = document.createElement('option');
        opt.value = cb.value;
        opt.textContent = cb.value;
        primarySelect.appendChild(opt);
    });
}

async function register() {
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const fullName = document.getElementById('reg-fullName').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const preferredFoot = document.getElementById('reg-preferredFoot').value;
    const yearsPlaying = parseInt(document.getElementById('reg-yearsPlaying').value);
    const aboutMe = document.getElementById('reg-aboutMe').value.trim();
    const primaryPosition = document.getElementById('reg-primaryPosition').value;
    const selectedPositions = Array.from(document.querySelectorAll('input[name="reg-positions"]:checked')).map(cb => cb.value);

    // Validation
    if (!email || !password) { alert('Email and Password are required'); return; }
    if (password.length < 6) { alert('Password must be at least 6 characters'); return; }
    if (!fullName) { alert('Full Name is required'); return; }
    if (!preferredFoot) { alert('Please select Preferred Foot'); return; }
    if (isNaN(yearsPlaying) || yearsPlaying < 0) { alert('Please enter valid Years Playing'); return; }
    if (selectedPositions.length === 0) { alert('Please select at least one position'); return; }
    if (!primaryPosition || !selectedPositions.includes(primaryPosition)) {
        alert('Primary Position must be one of the selected positions');
        return;
    }

    try {
        // Create Auth account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        // Generate Player ID
        const playerId = await generatePlayerId();

        // Create full profile
        const playerData = {
            playerId: playerId,
            fullName: fullName,
            nickname: nickname || null,
            preferredFoot: preferredFoot,
            yearsPlaying: yearsPlaying,
            aboutMe: aboutMe || null,
            positions: selectedPositions,
            primaryPosition: primaryPosition,
            email: email,
            isActive: true,
            profileComplete: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('players').doc(uid).set(playerData);

        alert('Registration successful! Welcome to GG FC.');
        // onAuthStateChanged will handle the rest
    } catch (error) {
        alert(error.message);
    }
}

// ========== GENERATE PLAYER ID ==========
async function generatePlayerId() {
    const snapshot = await db.collection('players').get();
    const count = snapshot.size + 1;
    return `GG${count.toString().padStart(3, '0')}`;
}

// ========== WELCOME (no Player ID shown) ==========
async function loadWelcome() {
    const doc = await db.collection('players').doc(currentUser.uid).get();
    if (doc.exists) {
        const profile = doc.data();
        document.getElementById('welcome-section').innerHTML = `
            <h2>Welcome, ${profile.fullName}${profile.nickname ? ' (' + profile.nickname + ')' : ''}</h2>
            <p>Primary Position: <strong>${profile.primaryPosition || 'N/A'}</strong> • Preferred Foot: <strong>${profile.preferredFoot || 'N/A'}</strong></p>
        `;
    }
}

// ========== RATE PLAYERS VIEW ==========
async function showRatePlayers() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<h3>Select a player to rate</h3><div id="players-list-container">Loading...</div>';

    const snapshot = await db.collection('players').where('isActive', '==', true).get();
    players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const container = document.getElementById('players-list-container');
    container.innerHTML = '';

    let hasPlayers = false;
    players.forEach(player => {
        if (player.id !== currentUser.uid) {
            hasPlayers = true;
            const div = document.createElement('div');
            div.className = 'player-card';
            div.innerHTML = `
                <div>
                    <h3>${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h3>
                    <small>${player.primaryPosition || 'N/A'} • ${player.preferredFoot || ''} foot</small>
                </div>
                <button onclick="ratePlayer('${player.id}')">Rate</button>
            `;
            container.appendChild(div);
        }
    });

    if (!hasPlayers) {
        container.innerHTML = '<p>No other players registered yet.</p>';
    }
}

// ========== RATING FORM (no Player ID, no live overall shown) ==========
async function ratePlayer(playerId) {
    currentRatingPlayerId = playerId;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const content = document.getElementById('content-area');
    
    let html = `
        <div>
            <h2>Rate ${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h2>
            <div>
                <label>Position you are rating for:</label>
                <select id="rating-position" onchange="loadRatingForm()">
    `;

    const positions = player.positions || ["CM"];
    positions.forEach(pos => {
        html += `<option value="${pos}">${pos}</option>`;
    });
    html += `</select></div>`;

    html += `<div id="rating-form" style="margin-top: 20px;"></div>`;
    html += `<button onclick="submitRating()">Submit Rating</button>`;
    html += `<button class="secondary" onclick="showRatePlayers()">Cancel</button>`;
    html += `</div>`;

    content.innerHTML = html;
    loadRatingForm();
}

function loadRatingForm() {
    const position = document.getElementById('rating-position').value;
    const formContainer = document.getElementById('rating-form');
    
    const isGK = position === 'GK';
    const params = isGK ? 
        ['Shot Stopping', 'Handling', 'Reflexes', 'Positioning', 'Communication', 'Distribution', 'Aerial Ability', 'One-on-One Ability', 'Decision Making', 'Consistency'] :
        ['Ball Control', 'Pace', 'Passing', 'Dribbling', 'Shooting', 'Defending', 'Physicality', 'Stamina', 'Game IQ', 'Teamwork'];

    let formHTML = `<h3>Rating for ${position}</h3>`;
    
    params.forEach(param => {
        const id = param.toLowerCase().replace(/\s+/g, '');
        formHTML += `
            <div>
                <label>${param} (1-10):</label>
                <input type="range" id="${id}" min="1" max="10" value="5" oninput="updateSliderValue('${id}')">
                <span id="${id}-value">5</span>
            </div>
        `;
    });

    // No overall shown on the form as requested
    formContainer.innerHTML = formHTML;
}

function updateSliderValue(id) {
    const slider = document.getElementById(id);
    if (slider) {
        document.getElementById(id + '-value').textContent = slider.value;
    }
}

async function submitRating() {
    const position = document.getElementById('rating-position').value;
    const isGK = position === 'GK';
    const paramIds = isGK ? 
        ['shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency'] :
        ['ballcontrol','pace','passing','dribbling','shooting','defending','physicality','stamina','gameiq','teamwork'];

    let sum = 0;
    let count = 0;
    const ratingData = {
        ratedPlayerId: currentRatingPlayerId,
        ratedByPlayerId: currentUser.uid,
        positionRated: position,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    paramIds.forEach(id => {
        const slider = document.getElementById(id);
        if (slider) {
            const val = parseInt(slider.value);
            ratingData[id] = val;
            sum += val;
            count++;
        }
    });

    ratingData.overall = count > 0 ? parseFloat((sum / count).toFixed(1)) : 0;

    try {
        await db.collection('ratings').add(ratingData);
        alert('Rating submitted successfully!');
        showRatePlayers();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ========== LEADERBOARD ==========
async function showLeaderboard() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<h3>Overall Leaderboard</h3><p>Loading rankings...</p>';

    // Get all active players
    const playersSnap = await db.collection('players').where('isActive', '==', true).get();
    const allPlayers = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Get all ratings
    const ratingsSnap = await db.collection('ratings').get();
    const allRatings = ratingsSnap.docs.map(doc => doc.data());

    // Calculate average overall per player (only from active raters)
    // First get active rater IDs
    const activeRaterIds = new Set(allPlayers.map(p => p.id));

    const playerAverages = {};

    allPlayers.forEach(p => {
        playerAverages[p.id] = {
            fullName: p.fullName,
            nickname: p.nickname,
            primaryPosition: p.primaryPosition,
            ratings: [],
            average: 0,
            count: 0
        };
    });

    allRatings.forEach(r => {
        // Only count ratings from active players
        if (activeRaterIds.has(r.ratedByPlayerId) && playerAverages[r.ratedPlayerId]) {
            playerAverages[r.ratedPlayerId].ratings.push(r.overall || 0);
        }
    });

    // Compute averages
    Object.keys(playerAverages).forEach(id => {
        const data = playerAverages[id];
        if (data.ratings.length > 0) {
            const sum = data.ratings.reduce((a, b) => a + b, 0);
            data.average = parseFloat((sum / data.ratings.length).toFixed(1));
            data.count = data.ratings.length;
        }
    });

    // Sort highest to lowest
    const ranked = Object.values(playerAverages)
        .filter(p => p.count > 0)
        .sort((a, b) => b.average - a.average);

    let html = '<h3>Overall Leaderboard</h3>';
    
    if (ranked.length === 0) {
        html += '<p>No ratings submitted yet.</p>';
    } else {
        html += '<div style="margin-top:1rem;">';
        ranked.forEach((p, index) => {
            html += `
                <div class="player-card">
                    <div>
                        <strong>#${index + 1}</strong> 
                        ${p.fullName}${p.nickname ? ' (' + p.nickname + ')' : ''}
                        <br>
                        <small>${p.primaryPosition || ''} • ${p.count} rating${p.count > 1 ? 's' : ''}</small>
                    </div>
                    <div style="font-size:1.4rem; font-weight:bold; color:#0f3460;">
                        ${p.average}
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    content.innerHTML = html;
}

// ========== LOGOUT ==========
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        auth.signOut();
    }
}