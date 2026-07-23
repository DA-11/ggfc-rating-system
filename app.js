// Global variables
let currentUser = null;
let players = [];
let currentRatingPlayerId = null;
let confirmCallback = null;

// ========== ADMIN CONFIG ==========
// Only these emails can see the Delete button (case-insensitive)
const ADMIN_EMAILS = [
    'admindivyansh@verify.com'
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

// ========== TOAST ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✓', error: '✕', info: 'ℹ' };
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
            playerId,
            fullName,
            nickname: nickname || null,
            preferredFoot,
            yearsPlaying,
            aboutMe: aboutMe || null,
            positions: selectedPositions,
            primaryPosition,
            email,
            profilePicUrl,
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

// ========== RATING FORM (FIFA Style - No Position Dropdown) ==========
async function ratePlayer(playerId) {
    currentRatingPlayerId = playerId;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const content = document.getElementById('content-area');

    const avatar = player.profilePicUrl
        ? `<img src="${player.profilePicUrl}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`
        : `<div style="width:64px;height:64px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.6rem;">⚽</div>`;

    // Automatically use Primary Position
    const position = player.primaryPosition || "CM";
    const isGK = position === 'GK';

    let html = `
        <div>
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                ${avatar}
                <div>
                    <h2 style="margin:0;">Rate ${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h2>
                    <p style="color:var(--text-muted);margin:0.2rem 0 0;">Rating as <strong>${position}</strong></p>
                </div>
            </div>
            <div id="rating-form"></div>
            <div style="margin-top:1.5rem; display:flex; gap:0.8rem;">
                <button class="btn-primary" onclick="submitRating('${position}')">Submit Rating</button>
                <button class="secondary" onclick="showRatePlayers()">Cancel</button>
            </div>
        </div>
    `;

    content.innerHTML = html;
    loadRatingForm(isGK);
}

function loadRatingForm(isGK) {
    const formContainer = document.getElementById('rating-form');

    const params = isGK ? 
        [
            { name: 'Shot Stopping', code: 'STO', id: 'shotstopping' },
            { name: 'Handling', code: 'HAN', id: 'handling' },
            { name: 'Reflexes', code: 'REF', id: 'reflexes' },
            { name: 'Positioning', code: 'POS', id: 'positioning' },
            { name: 'Communication', code: 'COM', id: 'communication' },
            { name: 'Distribution', code: 'DIS', id: 'distribution' },
            { name: 'Aerial Ability', code: 'AER', id: 'aerialability' },
            { name: 'One-on-One', code: '1v1', id: 'oneononeability' },
            { name: 'Decision Making', code: 'DEC', id: 'decisionmaking' },
            { name: 'Consistency', code: 'CON', id: 'consistency' }
        ] :
        [
            { name: 'Pace', code: 'PAC', id: 'pace' },
            { name: 'Shooting', code: 'SHO', id: 'shooting' },
            { name: 'Passing', code: 'PAS', id: 'passing' },
            { name: 'Dribbling', code: 'DRI', id: 'dribbling' },
            { name: 'Defending', code: 'DEF', id: 'defending' },
            { name: 'Physical', code: 'PHY', id: 'physicality' },
            { name: 'Stamina', code: 'STA', id: 'stamina' },
            { name: 'Game IQ', code: 'IQ', id: 'gameiq' },
            { name: 'Teamwork', code: 'TMW', id: 'teamwork' },
            { name: 'Ball Control', code: 'CTR', id: 'ballcontrol' }
        ];

    let formHTML = '';

    params.forEach(param => {
        formHTML += `
            <div class="fifa-attr">
                <div class="fifa-attr-name">${param.name} (${param.code})</div>
                <div class="fifa-attr-value" id="${param.id}-value">5</div>
                <div class="fifa-bar-container">
                    <div class="fifa-bar-fill" id="${param.id}-bar" style="width: 50%;"></div>
                </div>
            </div>
            <input type="range" class="fifa-slider" id="${param.id}" min="1" max="10" value="5" 
                   oninput="updateFifaBar('${param.id}')">
        `;
    });

    formContainer.innerHTML = formHTML;
}

function updateFifaBar(id) {
    const slider = document.getElementById(id);
    if (!slider) return;
    const value = slider.value;
    document.getElementById(id + '-value').textContent = value;
    document.getElementById(id + '-bar').style.width = (value * 10) + '%';
}

async function submitRating(position) {
    const isGK = position === 'GK';
    const paramIds = isGK ?
        ['shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency'] :
        ['pace','shooting','passing','dribbling','defending','physicality','stamina','gameiq','teamwork','ballcontrol'];

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
            id: p.id,
            fullName: p.fullName,
            nickname: p.nickname,
            primaryPosition: p.primaryPosition,
            preferredFoot: p.preferredFoot,
            profilePicUrl: p.profilePicUrl,
            aboutMe: p.aboutMe,
            yearsPlaying: p.yearsPlaying,
            positions: p.positions,
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

    window._leaderboardData = playerAverages;

    let html = '<h3 style="margin-bottom:1rem;">Overall Leaderboard</h3>';

    if (ranked.length === 0) {
        html += '<p style="color:var(--text-muted);">No ratings submitted yet.</p>';
    } else {
        ranked.forEach((p, index) => {
            const avatar = p.profilePicUrl
                ? `<img src="${p.profilePicUrl}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">`
                : `<div style="width:42px;height:42px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">⚽</div>`;

            html += `
                <div class="player-card" style="cursor:pointer;" onclick="showPlayerDetail('${p.id}')">
                    <div style="display:flex; align-items:center; gap:0.8rem;">
                        <span class="rank-badge">#${index + 1}</span>
                        ${avatar}
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

// ========== PLAYER DETAIL ==========
async function showPlayerDetail(playerId) {
    const content = document.getElementById('content-area');
    content.innerHTML = '<p style="color:var(--text-muted);">Loading player details...</p>';

    let player = window._leaderboardData ? window._leaderboardData[playerId] : null;

    if (!player) {
        const doc = await db.collection('players').doc(playerId).get();
        if (!doc.exists) {
            content.innerHTML = '<p>Player not found.</p><button class="secondary" onclick="showLeaderboard()">Back</button>';
            return;
        }
        player = { id: doc.id, ...doc.data() };
    }

    const ratingsSnap = await db.collection('ratings').where('ratedPlayerId', '==', playerId).get();
    const ratings = ratingsSnap.docs.map(d => d.data());

    const isGK = player.primaryPosition === 'GK';
    const paramKeys = isGK ?
        ['shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency'] :
        ['pace','shooting','passing','dribbling','defending','physicality','stamina','gameiq','teamwork','ballcontrol'];

    const paramLabels = isGK ?
        ['Shot Stopping','Handling','Reflexes','Positioning','Communication','Distribution','Aerial Ability','One-on-One','Decision Making','Consistency'] :
        ['Pace','Shooting','Passing','Dribbling','Defending','Physical','Stamina','Game IQ','Teamwork','Ball Control'];

    const averages = {};
    paramKeys.forEach((key, i) => {
        const values = ratings.map(r => r[key]).filter(v => typeof v === 'number');
        averages[paramLabels[i]] = values.length > 0
            ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
            : '—';
    });

    const overallAvg = player.average || (ratings.length > 0
        ? (ratings.reduce((a, r) => a + (r.overall || 0), 0) / ratings.length).toFixed(1)
        : '—');

    const avatar = player.profilePicUrl
        ? `<img src="${player.profilePicUrl}" alt="" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid var(--border);">`
        : `<div style="width:90px;height:90px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:2.2rem;">⚽</div>`;

    let paramsHtml = '';
    Object.entries(averages).forEach(([label, val]) => {
        paramsHtml += `
            <div style="display:flex;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--border);">
                <span style="color:var(--text-muted);">${label}</span>
                <strong style="color:var(--primary);">${val}</strong>
            </div>
        `;
    });

    content.innerHTML = `
        <div>
            <button class="secondary" style="margin-bottom:1.2rem;" onclick="showLeaderboard()">← Back to Leaderboard</button>

            <div style="display:flex;align-items:center;gap:1.2rem;margin-bottom:1.5rem;">
                ${avatar}
                <div>
                    <h2 style="margin:0 0 0.3rem;">${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h2>
                    <p style="color:var(--text-muted);margin:0;">
                        ${player.primaryPosition || 'N/A'} • ${player.preferredFoot || 'N/A'} foot
                        ${player.yearsPlaying != null ? ' • ' + player.yearsPlaying + ' yrs' : ''}
                    </p>
                    <p style="margin:0.4rem 0 0;font-size:1.4rem;font-weight:700;color:var(--primary);">
                        Overall: ${overallAvg}
                        <span style="font-size:0.85rem;color:var(--text-muted);font-weight:400;">
                            (${ratings.length} rating${ratings.length !== 1 ? 's' : ''})
                        </span>
                    </p>
                </div>
            </div>

            ${player.aboutMe ? `
                <div style="margin-bottom:1.4rem;padding:1rem;background:var(--surface-2);border-radius:10px;">
                    <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.04em;">About</div>
                    <p style="margin:0;line-height:1.5;">${player.aboutMe}</p>
                </div>
            ` : ''}

            <div style="margin-bottom:1rem;">
                <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em;">Positions</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                    ${(player.positions || []).map(p => `
                        <span style="background:var(--surface-2);border:1px solid var(--border);padding:0.3rem 0.7rem;border-radius:6px;font-size:0.85rem;">
                            ${p}${p === player.primaryPosition ? ' ★' : ''}
                        </span>
                    `).join('')}
                </div>
            </div>

            <div style="margin-top:1.5rem;">
                <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.6rem;text-transform:uppercase;letter-spacing:0.04em;">Average Ratings</div>
                ${paramsHtml || '<p style="color:var(--text-muted);">No ratings yet.</p>'}
            </div>
        </div>
    `;
}

// ========== CUSTOM CONFIRM MODAL ==========
function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');

    msgEl.textContent = message;
    confirmCallback = onConfirm;
    okBtn.onclick = () => closeConfirmModal(true);
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

// ========== ADMIN: DELETE PLAYER ==========
async function deletePlayer(playerId, playerName) {
    if (!isAdmin()) {
        showToast('Only admin can delete players', 'error');
        return;
    }

    showConfirm(`Delete player "${playerName}"? Their ratings will no longer count.`, async () => {
        try {
            await db.collection('players').doc(playerId).update({ isActive: false });
            showToast(`Player "${playerName}" deleted`, 'success');
            showRatePlayers();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}
