// Global variables
let currentUser = null;
let players = [];

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
        // Create player profile
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
        fullName: email.split('@')[0], // Placeholder
        email: email,
        isActive: true,
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
                <h3>${player.fullName} (${player.playerId})</h3>
                <button onclick="ratePlayer('${player.id}')">Rate Player</button>
            `;
            container.appendChild(div);
        }
    });
}

// Placeholder for rating
function ratePlayer(playerId) {
    alert(`Rating flow for player ${playerId} - to be implemented`);
    // Implement full rating UI here
}

// Load profile
async function loadUserProfile() {
    const doc = await db.collection('players').doc(currentUser.uid).get();
    if (doc.exists) {
        const profile = doc.data();
        document.getElementById('profile-section').innerHTML = `
            <h2>Welcome, ${profile.fullName}</h2>
            <p>Player ID: ${profile.playerId}</p>
        `;
    }
}

// Logout
function logout() {
    auth.signOut();
}

// More functions to be added for ratings, leaderboards etc.