// Global variables
let currentUser = null;
let players = [];
let currentRatingPlayerId = null;
let confirmCallback = null;

// ========== ADMIN CONFIG ==========
// Only these emails can see the Delete button

const ADMIN_EMAILS = [
    'admindivyansh@verify.com'   // all lowercase
];

function isAdmin() {
    if (!currentUser || !currentUser.email) return false;
    return ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
}

// Available positions
const ALL_POSITIONS = [
    { group: "Goalkeeper", positions: ["GK"] },
    { group: "Defense", positions: ["CB", "LB", "RB", "LWB", "RWB", "SW"] },
    { group: "Midfield", positions: ["CDM", "CM", "CAM", "LM", "RM"] },
    { group: "Attack", positions: ["LW", "RW", "CF", "ST", "SS"] }
];

// ========== TOAST / POPOVER SYSTEM ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}

// ========== AUTH STATE ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');

        document.getElementById('nav-buttons').innerHTML = `
            <button onclick="logout()">Logout</button>
        `;

        const doc = await db.collection('players').doc(user.uid).get();
        if (!doc.exists || !doc.data().profileComplete) {
            showToast('Profile incomplete. Please contact admin.', 'error');
            auth.signOut();
            return;
        }

        loadWelcome();
        showRatePlayers();
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
        showToast('Please enter email and password', 'error');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('Logged in successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ========== PROFILE PIC PREVIEW ==========
function previewProfilePic(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('avatar-preview');
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be smaller than 5MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

// ========== REGISTER ==========
function renderRegisterPositions() {
    const container = document.getElementById('reg-positions-container');
    let html = '';
    ALL_POSITIONS.forEach(group => {
        html += `<div style="margin-bottom:8px;"><strong style="color:var(--text-muted);font-size:0.8rem;">${group.group}</strong></div><div class="checkbox-group">`;
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

    if (!email || !password) { showToast('Email and Password are required', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    if (!fullName) { showToast('Full Name is required', 'error'); return; }
    if (!preferredFoot) { showToast('Please select Preferred Foot', 'error'); return; }
    if (isNaN(yearsPlaying) || yearsPlaying < 0) { showToast('Please enter valid Years Playing', 'error'); return; }
    if (selectedPositions.length === 0) { showToast('Please select at least one position', 'error'); return; }
    if (!primaryPosition || !selectedPositions.includes(primaryPosition)) {
        showToast('Primary Position must be one of the selected positions', 'error');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;
        const playerId = await generatePlayerId();

        // Upload profile picture to Cloudinary (optional)
        let profilePicUrl = null;
        const fileInput = document.getElementById('reg-profilePic');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const file = fileInput.files[0];
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'ggfc_profiles');

                const res = await fetch('https://api.cloudinary.com/v1_1/dfcsc86hq/image/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) throw new Error('Cloudinary upload failed');

                const data = await res.json();
                profilePicUrl = data.secure_url;
            } catch (uploadError) {
                console.warn('Profile picture upload failed:', uploadError);
                showToast('Account created, but profile picture could not be uploaded.', 'info');
            }
        }

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
            profilePicUrl: profilePicUrl,
            isActive: true,
            profileComplete: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('players').doc(uid).set(playerData);
        showToast('Registration successful! Welcome to GG FC.', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ========== GENERATE PLAYER ID ==========
async function generatePlayerId() {
    const snapshot = await db.collection('players').get();
    const count = snapshot.size + 1;
    return `GG${count.toString().padStart(3, '0')}`;
}

// ========== WELCOME ==========
async function loadWelcome() {
    const doc = await db.collection('players').doc(currentUser.uid).get();
    if (doc.exists) {
        const profile = doc.data();
        const avatarHtml = profile.profilePicUrl
            ? `<img src="${profile.profilePicUrl}" alt="Profile" style="width:56px;height:56px;border-radius:50%;object-fit:cover;margin-right:1rem;">`
            : `<div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin-right:1rem;">⚽</div>`;

        document.getElementById('welcome-section').innerHTML = `
            <div style="display:flex;align-items:center;">
                ${avatarHtml}
                <div>
                    <h2>Welcome, ${profile.fullName}${profile.nickname ? ' (' + profile.nickname + ')' : ''}</h2>
                    <p>Primary Position: <strong>${profile.primaryPosition || 'N/A'}</strong> • Preferred Foot: <strong>${profile.preferredFoot || 'N/A'}</strong></p>
                </div>
            </div>
        `;
    }
}

// ========== RATE PLAYERS VIEW ==========
async function showRatePlayers() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<h3 style="margin-bottom:1rem;">Select a player to rate</h3><div id="players-list-container">Loading...</div>';

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
            const avatar = player.profilePicUrl
                ? `<img src="${player.profilePicUrl}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;margin-right:0.8rem;">`
                : `<div style="width:42px;height:42px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-right:0.8rem;">⚽</div>`;

            const deleteBtn = isAdmin()
                ? `<button class="btn-danger" style="margin-left:0.5rem;padding:0.45rem 0.9rem;font-size:0.85rem;" onclick="deletePlayer('${player.id}', '${(player.fullName || '').replace(/'/g, "\\'")}')">Delete</button>`
                : '';

            div.innerHTML = `
                <div style="display:flex;align-items:center;">
                    ${avatar}
                    <div>
                        <h3>${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h3>
                        <small>${player.primaryPosition || 'N/A'} • ${player.preferredFoot || ''} foot</small>
                    </div>
                </div>
                <div style="display:flex;align-items:center;">
                    <button onclick="ratePlayer('${player.id}')">Rate</button>
                    ${deleteBtn}
                </div>
            `;
            container.appendChild(div);
        }
    });

    if (!hasPlayers) {
        container.innerHTML = '<p style="color:var(--text-muted);">No other players registered yet.</p>';
    }
}

// ========== RATING FORM ==========
async function ratePlayer(playerId) {
    currentRatingPlayerId = playerId;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const content = document.getElementById('content-area');
    
    let html = `
        <div>
            <h2 style="margin-bottom:1rem;">Rate ${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h2>
            <div class="form-group">
                <label>Position you are rating for</label>
                <select id="rating-position" onchange="loadRatingForm()">
    `;

    const positions = player.positions || ["CM"];
    positions.forEach(pos => {
        html += `<option value="${pos}">${pos}</option>`;
    });
    html += `</select></div>`;

    html += `<div id="rating-form"></div>`;
    html += `
        <div style="margin-top:1.5rem; display:flex; gap:0.8rem;">
            <button class="btn-primary" onclick="submitRating()">Submit Rating</button>
            <button class="secondary" onclick="showRatePlayers()">Cancel</button>
        </div>
    `;

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

    let formHTML = `<h3 style="margin:1.2rem 0 0.5rem; font-size:1.1rem;">Rating for ${position}</h3>`;
    
    params.forEach(param => {
        const id = param.toLowerCase().replace(/\s+/g, '');
        formHTML += `
            <div>
                <label>${param}</label>
                <input type="range" id="${id}" min="1" max="10" value="5" oninput="updateSliderValue('${id}')">
                <span id="${id}-value">5</span>
            </div>
        `;
    });

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
        showToast('Rating submitted successfully!', 'success');
        showRatePlayers();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ========== LEADERBOARD ==========
async function showLeaderboard() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<h3 style="margin-bottom:1rem;">Overall Leaderboard</h3><p style="color:var(--text-muted);">Loading rankings...</p>';

    const playersSnap = await db.collection('players').where('isActive', '==', true).get();
    const allPlayers = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const ratingsSnap = await db.collection('ratings').get();
    const allRatings = ratingsSnap.docs.map(doc => doc.data());

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
        if (activeRaterIds.has(r.ratedByPlayerId) && playerAverages[r.ratedPlayerId]) {
            playerAverages[r.ratedPlayerId].ratings.push(r.overall || 0);
        }
    });

    Object.keys(playerAverages).forEach(id => {
        const data = playerAverages[id];
        if (data.ratings.length > 0) {
            const sum = data.ratings.reduce((a, b) => a + b, 0);
            data.average = parseFloat((sum / data.ratings.length).toFixed(1));
            data.count = data.ratings.length;
        }
    });

    const ranked = Object.values(playerAverages)
        .filter(p => p.count > 0)
        .sort((a, b) => b.average - a.average);

    let html = '<h3 style="margin-bottom:1rem;">Overall Leaderboard</h3>';
    
    if (ranked.length === 0) {
        html += '<p style="color:var(--text-muted);">No ratings submitted yet.</p>';
    } else {
        ranked.forEach((p, index) => {
            html += `
                <div class="player-card">
                    <div style="display:flex; align-items:center; gap:0.8rem;">
                        <span class="rank-badge">#${index + 1}</span>
                        <div>
                            <h3>${p.fullName}${p.nickname ? ' (' + p.nickname + ')' : ''}</h3>
                            <small>${p.primaryPosition || ''} • ${p.count} rating${p.count > 1 ? 's' : ''}</small>
                        </div>
                    </div>
                    <div class="score-value">${p.average}</div>
                </div>
            `;
        });
    }

    content.innerHTML = html;
}

// ========== CUSTOM CONFIRM MODAL ==========
function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');

    msgEl.textContent = message;
    confirmCallback = onConfirm;

    okBtn.onclick = () => {
        closeConfirmModal(true);
    };

    modal.classList.remove('hidden');
}

function closeConfirmModal(confirmed) {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (confirmed && typeof confirmCallback === 'function') {
        confirmCallback();
    }
    confirmCallback = null;
}

// ========== LOGOUT ==========
function logout() {
    showConfirm('Are you sure you want to logout?', () => {
        auth.signOut();
        showToast('Logged out', 'info');
    });
}

// ========== ADMIN: DELETE PLAYER (soft delete) ==========
async function deletePlayer(playerId, playerName) {
    if (!isAdmin()) {
        showToast('Only admin can delete players', 'error');
        return;
    }

    showConfirm(`Delete player "${playerName}"? Their ratings will no longer count.`, async () => {
        try {
            await db.collection('players').doc(playerId).update({
                isActive: false
            });
            showToast(`Player "${playerName}" deleted`, 'success');
            showRatePlayers(); // refresh list
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}
