// Global variables
let currentUser = null;
let players = [];
let currentRatingPlayerId = null;
let isNewRegistration = false;

// Available positions
const ALL_POSITIONS = [
    { group: "Goalkeeper", positions: ["GK"] },
    { group: "Defense", positions: ["CB", "LB", "RB", "LWB", "RWB", "SW"] },
    { group: "Midfield", positions: ["CDM", "CM", "CAM", "LM", "RM"] },
    { group: "Attack", positions: ["LW", "RW", "CF", "ST", "SS"] }
];

// Auth state listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-section').classList.add('hidden');
        
        // Show logout button
        document.getElementById('nav-buttons').innerHTML = `
            <button onclick="logout()">Logout</button>
        `;

        // Check if player profile is complete
        const doc = await db.collection('players').doc(user.uid).get();
        if (!doc.exists || !doc.data().profileComplete) {
            // Show profile setup form
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('profile-setup').classList.remove('hidden');
            showProfileSetupForm(user.email);
        } else {
            document.getElementById('profile-setup').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            loadUserProfile();
            loadPlayers();
        }
    } else {
        currentUser = null;
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('profile-setup').classList.add('hidden');
        document.getElementById('nav-buttons').innerHTML = '';
    }
});

// Register function - only creates Auth account, then profile form appears
async function register() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        isNewRegistration = true;
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        // Profile form will be shown automatically by onAuthStateChanged
        alert('Account created! Please complete your player profile.');
    } catch (error) {
        alert(error.message);
    }
}

// Login function
async function login() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

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

// Show the full profile completion form
function showProfileSetupForm(email) {
    const container = document.getElementById('profile-setup');
    
    let positionsHTML = '';
    ALL_POSITIONS.forEach(group => {
        positionsHTML += `<div style="margin-bottom:8px;"><strong>${group.group}</strong></div><div class="checkbox-group">`;
        group.positions.forEach(pos => {
            positionsHTML += `
                <label>
                    <input type="checkbox" name="positions" value="${pos}" onchange="updatePrimaryOptions()">
                    ${pos}
                </label>
            `;
        });
        positionsHTML += `</div>`;
    });

    container.innerHTML = `
        <h2>Complete Your Player Profile</h2>
        <p>Email: <strong>${email}</strong></p>

        <label>Full Name *</label>
        <input type="text" id="fullName" placeholder="e.g. John Smith" required>

        <label>Nickname (optional)</label>
        <input type="text" id="nickname" placeholder="e.g. Johnny">

        <label>Preferred Foot *</label>
        <select id="preferredFoot" required>
            <option value="">Select...</option>
            <option value="Right">Right</option>
            <option value="Left">Left</option>
            <option value="Both">Both</option>
        </select>

        <label>Years Playing Football *</label>
        <input type="number" id="yearsPlaying" min="0" max="50" placeholder="e.g. 5" required>

        <label>About Me</label>
        <textarea id="aboutMe" placeholder="Tell us about your playing style..."></textarea>

        <label>Positions you can play * (select at least one)</label>
        ${positionsHTML}

        <label>Primary Position *</label>
        <select id="primaryPosition" required>
            <option value="">Select positions first...</option>
        </select>

        <button onclick="savePlayerProfile()">Save Profile & Continue</button>
    `;
}

// Update primary position dropdown based on selected checkboxes
function updatePrimaryOptions() {
    const checkboxes = document.querySelectorAll('input[name="positions"]:checked');
    const primarySelect = document.getElementById('primaryPosition');
    
    primarySelect.innerHTML = '<option value="">Select primary...</option>';
    
    checkboxes.forEach(cb => {
        const opt = document.createElement('option');
        opt.value = cb.value;
        opt.textContent = cb.value;
        primarySelect.appendChild(opt);
    });
}

// Save the complete player profile
async function savePlayerProfile() {
    const fullName = document.getElementById('fullName').value.trim();
    const nickname = document.getElementById('nickname').value.trim();
    const preferredFoot = document.getElementById('preferredFoot').value;
    const yearsPlaying = parseInt(document.getElementById('yearsPlaying').value);
    const aboutMe = document.getElementById('aboutMe').value.trim();
    const primaryPosition = document.getElementById('primaryPosition').value;

    const selectedPositions = Array.from(document.querySelectorAll('input[name="positions"]:checked'))
        .map(cb => cb.value);

    // Validation
    if (!fullName) {
        alert('Full Name is required');
        return;
    }
    if (!preferredFoot) {
        alert('Please select Preferred Foot');
        return;
    }
    if (isNaN(yearsPlaying) || yearsPlaying < 0) {
        alert('Please enter valid Years Playing');
        return;
    }
    if (selectedPositions.length === 0) {
        alert('Please select at least one position');
        return;
    }
    if (!primaryPosition || !selectedPositions.includes(primaryPosition)) {
        alert('Primary Position must be one of the selected positions');
        return;
    }

    try {
        const playerId = await generatePlayerId();

        const playerData = {
            playerId: playerId,
            fullName: fullName,
            nickname: nickname || null,
            preferredFoot: preferredFoot,
            yearsPlaying: yearsPlaying,
            aboutMe: aboutMe || null,
            positions: selectedPositions,
            primaryPosition: primaryPosition,
            email: currentUser.email,
            isActive: true,
            profileComplete: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('players').doc(currentUser.uid).set(playerData);

        alert('Profile saved successfully!');
        
        // Switch to main app
        document.getElementById('profile-setup').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        loadUserProfile();
        loadPlayers();
    } catch (error) {
        alert('Error saving profile: ' + error.message);
    }
}

// Generate Player ID
async function generatePlayerId() {
    const snapshot = await db.collection('players').get();
    const count = snapshot.size + 1;
    return `GG${count.toString().padStart(3, '0')}`;
}

// Load players
async function loadPlayers() {
    const snapshot = await db.collection('players').where('isActive', '==', true).get();
    players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPlayersList();
}

// Render players
function renderPlayersList() {
    const container = document.getElementById('players-list');
    container.innerHTML = '<h2>Registered Players</h2>';
    
    if (players.length <= 1) {
        container.innerHTML += '<p>No other players registered yet.</p>';
        return;
    }

    players.forEach(player => {
        if (player.id !== currentUser.uid) {
            const div = document.createElement('div');
            div.className = 'player-card';
            div.innerHTML = `
                <div>
                    <h3>${player.fullName || 'Player'} ${player.nickname ? '(' + player.nickname + ')' : ''}</h3>
                    <small>${player.playerId} • ${player.primaryPosition || 'N/A'}</small>
                </div>
                <button onclick="ratePlayer('${player.id}')">Rate Player</button>
            `;
            container.appendChild(div);
        }
    });
}

// === FULL RATING SYSTEM ===
async function ratePlayer(playerId) {
    currentRatingPlayerId = playerId;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // Hide other sections
    document.getElementById('profile-section').innerHTML = '';
    document.getElementById('players-list').innerHTML = '';
    document.getElementById('leaderboards').innerHTML = '';

    let html = `
        <div style="padding: 10px;">
            <h2>Rate ${player.fullName || 'Player'} (${player.playerId})</h2>
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
    html += `<button class="secondary" onclick="cancelRating()">Cancel</button>`;
    html += `</div>`;

    document.getElementById('main-app').innerHTML = html;
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
                <input type="range" id="${id}" min="1" max="10" value="5" oninput="updateOverall()">
                <span id="${id}-value">5</span>
            </div>
        `;
    });

    formHTML += `<h3>Overall Rating: <span id="overall-score" style="font-size: 1.5em; color: #0f3460;">5.0</span></h3>`;
    formContainer.innerHTML = formHTML;
}

function updateOverall() {
    const position = document.getElementById('rating-position').value;
    const isGK = position === 'GK';
    const paramIds = isGK ? 
        ['shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency'] :
        ['ballcontrol','pace','passing','dribbling','shooting','defending','physicality','stamina','gameiq','teamwork'];

    let sum = 0;
    let count = 0;

    paramIds.forEach(id => {
        const slider = document.getElementById(id);
        if (slider) {
            sum += parseInt(slider.value);
            count++;
            document.getElementById(id + '-value').textContent = slider.value;
        }
    });

    const overall = count > 0 ? (sum / count).toFixed(1) : "0";
    document.getElementById('overall-score').textContent = overall;
}

async function submitRating() {
    const position = document.getElementById('rating-position').value;
    const isGK = position === 'GK';
    const paramIds = isGK ? 
        ['shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency'] :
        ['ballcontrol','pace','passing','dribbling','shooting','defending','physicality','stamina','gameiq','teamwork'];

    const ratingData = {
        ratedPlayerId: currentRatingPlayerId,
        ratedByPlayerId: currentUser.uid,
        positionRated: position,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        overall: parseFloat(document.getElementById('overall-score').textContent)
    };

    paramIds.forEach(id => {
        const slider = document.getElementById(id);
        if (slider) ratingData[id] = parseInt(slider.value);
    });

    try {
        await db.collection('ratings').add(ratingData);
        alert('Rating submitted successfully!');
        location.reload();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function cancelRating() {
    location.reload();
}

// Load profile
async function loadUserProfile() {
    const doc = await db.collection('players').doc(currentUser.uid).get();
    if (doc.exists) {
        const profile = doc.data();
        document.getElementById('profile-section').innerHTML = `
            <h2>Welcome, ${profile.fullName || 'Player'}</h2>
            <p>
                <strong>Player ID:</strong> ${profile.playerId}<br>
                <strong>Primary Position:</strong> ${profile.primaryPosition || 'N/A'}<br>
                <strong>Preferred Foot:</strong> ${profile.preferredFoot || 'N/A'}
            </p>
        `;
    }
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        auth.signOut();
    }
}