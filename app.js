// Global variables
let currentUser = null;
let players = [];
let currentRatingPlayerId = null;

// Auth state listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        loadUserProfile();
        loadPlayers();
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }
});

// Register function
async function register() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await createPlayerProfile(userCredential.user.uid, email);
        alert('Registration successful!');
    } catch (error) {
        alert(error.message);
    }
}

// Login function
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert(error.message);
    }
}

// Create initial player profile
async function createPlayerProfile(uid, email) {
    const playerData = {
        playerId: await generatePlayerId(),
        fullName: email.split('@')[0],
        email: email,
        isActive: true,
        positions: ["CM"], // default
        primaryPosition: "CM",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('players').doc(uid).set(playerData);
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
    players.forEach(player => {
        if (player.id !== currentUser.uid) {
            const div = document.createElement('div');
            div.innerHTML = `
                <h3>${player.fullName || 'Player'} (${player.playerId})</h3>
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

    let html = `
        <div style="padding: 20px;">
            <h2>Rate ${player.fullName || 'Player'} (${player.playerId})</h2>
            <div>
                <label>Position: </label>
                <select id="rating-position" onchange="loadRatingForm()">
    `;

    const positions = player.positions || ["CM"];
    positions.forEach(pos => {
        html += `<option value="${pos}">${pos}</option>`;
    });
    html += `</select></div>`;

    html += `<div id="rating-form" style="margin-top: 20px;"></div>`;
    html += `<button onclick="submitRating()" style="margin: 10px;">Submit Rating</button>`;
    html += `<button onclick="cancelRating()" style="margin: 10px;">Cancel</button>`;
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
            <div style="margin: 10px 0;">
                <label>${param} (1-10):</label><br>
                <input type="range" id="${id}" min="1" max="10" value="5" oninput="updateOverall()">
                <span id="${id}-value" style="margin-left: 10px;">5</span>
            </div>
        `;
    });

    formHTML += `<h3>Overall Rating: <span id="overall-score" style="font-size: 1.5em;">5.0</span></h3>`;
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
        alert('Rating submitted successfully! Thank you.');
        location.reload(); // back to main view
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
            <p>Player ID: ${profile.playerId}</p>
        `;
    }
}

// Logout
function logout() {
    auth.signOut();
}