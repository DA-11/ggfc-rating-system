// Global variables
let currentUser = null;
let players = [];
let currentRatingPlayerId = null;
let confirmCallback = null;

// ========== ADMIN CONFIG ==========
const ADMIN_EMAILS = [
    'admindivyansh@verify.com'
];

function isAdmin() {
    if (!currentUser || !currentUser.email) return false;
    return ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
}

const ALL_POSITIONS = [
    { group: "Goalkeeper", positions: ["GK"] },
    { group: "Defense", positions: ["CB", "LB", "RB", "LWB", "RWB", "SW"] },
    { group: "Midfield", positions: ["CDM", "CM", "CAM", "LM", "RM"] },
    { group: "Attack", positions: ["LW", "RW", "CF", "ST", "SS"] }
];

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 250); }, 3500);
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('nav-buttons').innerHTML = `
            <button class="nav-profile-btn" onclick="showEditProfile()" title="Edit Profile">👤 Profile</button>
            <button onclick="logout()">Logout</button>
        `;
        const doc = await db.collection('players').doc(user.uid).get();
        if (!doc.exists || !doc.data().profileComplete) {
            showToast('Profile incomplete. Please contact admin.', 'error');
            auth.signOut();
            return;
        }
        loadWelcome();
        renderMenuButtons();
        showRatePlayers();
    } else {
        currentUser = null;
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('nav-buttons').innerHTML = '';
    }
});

function showLoginView() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('register-view').classList.add('hidden');
}

function showRegisterView() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('register-view').classList.remove('hidden');
    renderRegisterPositions();
}

async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { showToast('Please enter email and password', 'error'); return; }
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('Logged in successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function previewProfilePic(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('avatar-preview');
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be smaller than 5MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => { preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`; };
    reader.readAsDataURL(file);
}

function renderRegisterPositions() {
    const container = document.getElementById('reg-positions-container');
    let html = '';
    ALL_POSITIONS.forEach(group => {
        html += `<div style="margin-bottom:8px;"><strong style="color:var(--text-muted);font-size:0.8rem;">${group.group}</strong></div><div class="checkbox-group">`;
        group.positions.forEach(pos => {
            html += `<label><input type="checkbox" name="reg-positions" value="${pos}" onchange="updateRegPrimaryOptions()"> ${pos}</label>`;
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
    if (!primaryPosition || !selectedPositions.includes(primaryPosition)) { showToast('Primary Position must be one of the selected positions', 'error'); return; }
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
                const res = await fetch('https://api.cloudinary.com/v1_1/dfcsc86hq/image/upload', { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Cloudinary upload failed');
                const data = await res.json();
                profilePicUrl = data.secure_url;
            } catch (uploadError) {
                console.warn('Profile picture upload failed:', uploadError);
                showToast('Account created, but profile picture could not be uploaded.', 'info');
            }
        }
        await db.collection('players').doc(uid).set({
            playerId, fullName, nickname: nickname || null, preferredFoot, yearsPlaying,
            aboutMe: aboutMe || null, positions: selectedPositions, primaryPosition, email,
            profilePicUrl, isActive: true, profileComplete: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Registration successful! Welcome to GG FC.', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function generatePlayerId() {
    const snapshot = await db.collection('players').get();
    return `GG${(snapshot.size + 1).toString().padStart(3, '0')}`;
}

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
            </div>`;
    }
}

async function showEditProfile() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<p style="color:var(--text-muted);">Loading profile...</p>';
    const doc = await db.collection('players').doc(currentUser.uid).get();
    if (!doc.exists) { showToast('Profile not found', 'error'); return; }
    const profile = doc.data();
    let positionsHtml = '';
    ALL_POSITIONS.forEach(group => {
        positionsHtml += `<div style="margin-bottom:8px;"><strong style="color:var(--text-muted);font-size:0.8rem;">${group.group}</strong></div><div class="checkbox-group">`;
        group.positions.forEach(pos => {
            const checked = (profile.positions || []).includes(pos) ? 'checked' : '';
            positionsHtml += `<label><input type="checkbox" name="edit-positions" value="${pos}" ${checked} onchange="updateEditPrimaryOptions()"> ${pos}</label>`;
        });
        positionsHtml += `</div>`;
    });
    let primaryOptions = '<option value="">Select primary...</option>';
    (profile.positions || []).forEach(pos => {
        const sel = pos === profile.primaryPosition ? 'selected' : '';
        primaryOptions += `<option value="${pos}" ${sel}>${pos}</option>`;
    });
    content.innerHTML = `
        <h3 style="margin-bottom:1.2rem;">Edit Profile</h3>
        <div class="form-group"><label>Full Name</label>
            <input type="text" id="edit-fullName" value="${(profile.fullName || '').replace(/"/g, '&quot;')}" disabled style="opacity:0.6;">
            <small style="color:var(--text-muted);">Name cannot be changed</small></div>
        <div class="form-group"><label>Nickname</label>
            <input type="text" id="edit-nickname" value="${(profile.nickname || '').replace(/"/g, '&quot;')}" placeholder="e.g. Johnny"></div>
        <div class="form-group"><label>About Me</label>
            <textarea id="edit-aboutMe" placeholder="Tell us about your playing style...">${(profile.aboutMe || '').replace(/</g, '&lt;')}</textarea></div>
        <div class="form-group"><label>Positions you can play *</label>
            <div id="edit-positions-container">${positionsHtml}</div></div>
        <div class="form-group"><label>Primary Position *</label>
            <select id="edit-primaryPosition">${primaryOptions}</select></div>
        <div style="display:flex;gap:0.8rem;margin-top:1.5rem;">
            <button class="btn-primary" onclick="saveProfile()">Save Changes</button>
            <button class="secondary" onclick="showRatePlayers()">Cancel</button>
        </div>`;
}

function updateEditPrimaryOptions() {
    const checkboxes = document.querySelectorAll('input[name="edit-positions"]:checked');
    const primarySelect = document.getElementById('edit-primaryPosition');
    const currentVal = primarySelect.value;
    primarySelect.innerHTML = '<option value="">Select primary...</option>';
    checkboxes.forEach(cb => {
        const opt = document.createElement('option');
        opt.value = cb.value; opt.textContent = cb.value;
        if (cb.value === currentVal) opt.selected = true;
        primarySelect.appendChild(opt);
    });
}

async function saveProfile() {
    const nickname = document.getElementById('edit-nickname').value.trim();
    const aboutMe = document.getElementById('edit-aboutMe').value.trim();
    const primaryPosition = document.getElementById('edit-primaryPosition').value;
    const selectedPositions = Array.from(document.querySelectorAll('input[name="edit-positions"]:checked')).map(cb => cb.value);
    if (selectedPositions.length === 0) { showToast('Please select at least one position', 'error'); return; }
    if (!primaryPosition || !selectedPositions.includes(primaryPosition)) { showToast('Primary Position must be one of the selected positions', 'error'); return; }
    try {
        await db.collection('players').doc(currentUser.uid).update({
            nickname: nickname || null, aboutMe: aboutMe || null,
            positions: selectedPositions, primaryPosition: primaryPosition
        });
        showToast('Profile updated successfully!', 'success');
        loadWelcome();
        showRatePlayers();
    } catch (error) { showToast(error.message, 'error'); }
}

function renderMenuButtons() {
    const menu = document.querySelector('.menu-buttons');
    if (!menu) return;
    let adminBtn = '';
    if (isAdmin()) {
        adminBtn = `<button class="btn-menu" onclick="showAdminRatings()" style="border-color:#ff5c7a;"><span class="btn-icon">🛡️</span>All Ratings</button>`;
    }
    menu.innerHTML = `
        <button class="btn-menu" onclick="showRatePlayers()"><span class="btn-icon">⭐</span>Rate a Player</button>
        <button class="btn-menu" onclick="showLeaderboard()"><span class="btn-icon">🏆</span>Leaderboard</button>
        ${adminBtn}`;
}

async function showAdminRatings() {
    if (!isAdmin()) { showToast('Access denied. Admin only.', 'error'); showRatePlayers(); return; }
    const content = document.getElementById('content-area');
    content.innerHTML = '<h3 style="margin-bottom:1rem;">All Ratings (Admin)</h3><p style="color:var(--text-muted);">Loading...</p>';
    try {
        const playersSnap = await db.collection('players').get();
        const playerMap = {};
        playersSnap.docs.forEach(doc => {
            const d = doc.data();
            playerMap[doc.id] = { fullName: d.fullName || 'Unknown', playerId: d.playerId || '—', nickname: d.nickname || null };
        });
        const ratingsSnap = await db.collection('ratings').get();
        if (ratingsSnap.empty) {
            content.innerHTML = '<h3 style="margin-bottom:1rem;">All Ratings (Admin)</h3><p style="color:var(--text-muted);">No ratings submitted yet.</p>';
            return;
        }
        function formatParams(r) {
            const keys = ['pace','shooting','passing','dribbling','defending','physicality','stamina','gameiq','teamwork','ballcontrol','shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency'];
            const short = { pace:'PAC',shooting:'SHO',passing:'PAS',dribbling:'DRI',defending:'DEF',physicality:'PHY',stamina:'STA',gameiq:'IQ',teamwork:'TMW',ballcontrol:'CTR',shotstopping:'STO',handling:'HAN',reflexes:'REF',positioning:'POS',communication:'COM',distribution:'DIS',aerialability:'AER',oneononeability:'1v1',decisionmaking:'DEC',consistency:'CON' };
            return keys.filter(k => typeof r[k] === 'number').map(k => `${short[k]||k}:${r[k]}`).join('  ');
        }
        let tableRows = '';
        ratingsSnap.docs.forEach(doc => {
            const r = doc.data();
            const rated = playerMap[r.ratedPlayerId] || { fullName: 'Unknown', playerId: '—' };
            const rater = playerMap[r.ratedByPlayerId] || { fullName: 'Unknown', playerId: '—' };
            const ratedName = rated.nickname ? `${rated.fullName} (${rated.nickname})` : rated.fullName;
            const raterName = rater.nickname ? `${rater.fullName} (${rater.nickname})` : rater.fullName;
            tableRows += `<tr><td>${ratedName}</td><td>${raterName}</td><td>${rater.playerId}</td><td>${r.positionRated || '—'}</td><td class="params-cell">${formatParams(r)}</td><td class="overall-cell">${r.overall != null ? r.overall : '—'}</td></tr>`;
        });
        content.innerHTML = `
            <h3 style="margin-bottom:0.5rem;">All Ratings (Admin)</h3>
            <p style="color:var(--text-muted);margin-bottom:1rem;font-size:0.9rem;">${ratingsSnap.size} rating${ratingsSnap.size !== 1 ? 's' : ''} total • Visible only to admins</p>
            <div class="admin-table-wrap"><table class="admin-ratings-table">
                <thead><tr><th>Rated Player</th><th>Rated By</th><th>Rated By ID</th><th>Position</th><th>Parameters</th><th>Overall</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table></div>`;
    } catch (error) {
        content.innerHTML = `<h3>All Ratings (Admin)</h3><p style="color:var(--danger);">Error: ${error.message}</p><button class="secondary" onclick="showRatePlayers()">Back</button>`;
    }
}

let showAllPlayersFlag = false;

async function showRatePlayers(showAll = false) {
    showAllPlayersFlag = showAll;
    const content = document.getElementById('content-area');
    content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.6rem;">
            <h3 style="margin:0;">Select a player to rate</h3>
            <button class="secondary" style="padding:0.45rem 0.9rem;font-size:0.85rem;" onclick="showRatePlayers(${!showAll})">
                ${showAll ? 'Show Unrated Only' : 'Show All Players'}
            </button>
        </div>
        <div id="players-list-container">Loading...</div>`;
    const snapshot = await db.collection('players').where('isActive', '==', true).get();
    players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const myRatingsSnap = await db.collection('ratings').where('ratedByPlayerId', '==', currentUser.uid).get();
    const ratedPlayerIds = new Set();
    myRatingsSnap.docs.forEach(doc => ratedPlayerIds.add(doc.data().ratedPlayerId));
    const container = document.getElementById('players-list-container');
    container.innerHTML = '';
    let hasPlayers = false;
    players.forEach(player => {
        if (player.id === currentUser.uid) return;
        if (!showAll && ratedPlayerIds.has(player.id)) return;
        hasPlayers = true;
        const div = document.createElement('div');
        div.className = 'player-card';
        const avatar = player.profilePicUrl
            ? `<img src="${player.profilePicUrl}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;margin-right:0.8rem;">`
            : `<div style="width:42px;height:42px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.1rem;margin-right:0.8rem;">⚽</div>`;
        const alreadyRated = ratedPlayerIds.has(player.id);
        const deleteBtn = isAdmin()
            ? `<button class="btn-danger" style="margin-left:0.5rem;padding:0.45rem 0.9rem;font-size:0.85rem;" onclick="deletePlayer('${player.id}', '${(player.fullName || '').replace(/'/g, "\\'")}')">Delete</button>` : '';
        div.innerHTML = `
            <div style="display:flex;align-items:center;">${avatar}<div>
                <h3>${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h3>
                <small>${player.primaryPosition || 'N/A'} • ${player.preferredFoot || ''} foot${alreadyRated ? ' • <span style="color:var(--accent);">Already rated</span>' : ''}</small>
            </div></div>
            <div style="display:flex;align-items:center;">
                <button onclick="ratePlayer('${player.id}')">${alreadyRated ? 'Rate Again' : 'Rate'}</button>${deleteBtn}
            </div>`;
        container.appendChild(div);
    });
    if (!hasPlayers) {
        container.innerHTML = showAll
            ? '<p style="color:var(--text-muted);">No other players registered yet.</p>'
            : '<p style="color:var(--text-muted);">You have rated all players. Click <strong>Show All Players</strong> to rate someone again.</p>';
    }
}

async function ratePlayer(playerId) {
    currentRatingPlayerId = playerId;
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    const content = document.getElementById('content-area');
    const avatar = player.profilePicUrl
        ? `<img src="${player.profilePicUrl}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`
        : `<div style="width:64px;height:64px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.6rem;">⚽</div>`;
    const position = player.primaryPosition || "CM";
    const isGK = position === 'GK';
    content.innerHTML = `
        <div>
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                ${avatar}<div>
                    <h2 style="margin:0;">Rate ${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h2>
                    <p style="color:var(--text-muted);margin:0.2rem 0 0;">Rating as <strong>${position}</strong></p>
                </div>
            </div>
            <div id="rating-form"></div>
            <div style="margin-top:1.5rem; display:flex; gap:0.8rem;">
                <button class="btn-primary" onclick="submitRating('${position}')">Submit Rating</button>
                <button class="secondary" onclick="showRatePlayers()">Cancel</button>
            </div>
        </div>`;
    loadRatingForm(isGK);
}

function loadRatingForm(isGK) {
    const formContainer = document.getElementById('rating-form');
    const params = isGK ? [
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
    ] : [
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
                <div class="fifa-bar-container"><div class="fifa-bar-fill" id="${param.id}-bar" style="width: 50%;"></div></div>
            </div>
            <input type="range" class="fifa-slider" id="${param.id}" min="1" max="10" value="5" oninput="updateFifaBar('${param.id}')">`;
    });
    formContainer.innerHTML = formHTML;
}

function updateFifaBar(id) {
    const slider = document.getElementById(id);
    if (!slider) return;
    document.getElementById(id + '-value').textContent = slider.value;
    document.getElementById(id + '-bar').style.width = (slider.value * 10) + '%';
}

async function submitRating(position) {
    const isGK = position === 'GK';
    const paramIds = isGK
        ? ['shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency']
        : ['pace','shooting','passing','dribbling','defending','physicality','stamina','gameiq','teamwork','ballcontrol'];
    let sum = 0, count = 0;
    const ratingData = {
        ratedPlayerId: currentRatingPlayerId,
        ratedByPlayerId: currentUser.uid,
        positionRated: position,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    paramIds.forEach(id => {
        const slider = document.getElementById(id);
        if (slider) { const val = parseInt(slider.value); ratingData[id] = val; sum += val; count++; }
    });
    ratingData.overall = count > 0 ? parseFloat((sum / count).toFixed(1)) : 0;
    try {
        await db.collection('ratings').add(ratingData);
        showToast('Rating submitted successfully!', 'success');
        showRatePlayers();
    } catch (error) { showToast(error.message, 'error'); }
}

async function showLeaderboard() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<h3 style="margin-bottom:1rem;">Overall Leaderboard</h3><p style="color:var(--text-muted);">Loading rankings...</p>';
    const playersSnap = await db.collection('players').where('isActive', '==', true).get();
    const allPlayers = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const ratingsSnap = await db.collection('ratings').get();
    const latestByPair = {};
    ratingsSnap.docs.forEach(doc => {
        const r = doc.data();
        const key = `${r.ratedPlayerId}_${r.ratedByPlayerId}`;
        const ts = r.timestamp && r.timestamp.toMillis ? r.timestamp.toMillis() : 0;
        if (!latestByPair[key] || ts > latestByPair[key].ts) latestByPair[key] = { ...r, ts };
    });
    const allRatings = Object.values(latestByPair);
    const activeRaterIds = new Set(allPlayers.map(p => p.id));
    const playerAverages = {};
    allPlayers.forEach(p => {
        playerAverages[p.id] = {
            id: p.id, fullName: p.fullName, nickname: p.nickname, primaryPosition: p.primaryPosition,
            preferredFoot: p.preferredFoot, profilePicUrl: p.profilePicUrl, aboutMe: p.aboutMe,
            yearsPlaying: p.yearsPlaying, positions: p.positions, ratings: [], average: 0, count: 0
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
            data.average = parseFloat((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1));
            data.count = data.ratings.length;
        }
    });
    const ranked = Object.values(playerAverages).filter(p => p.count > 0).sort((a, b) => b.average - a.average);
    window._leaderboardData = playerAverages;
    let html = '<h3 style="margin-bottom:1rem;">Overall Leaderboard</h3>';
    if (ranked.length === 0) {
        html += '<p style="color:var(--text-muted);">No ratings submitted yet.</p>';
    } else {
        ranked.forEach((p, index) => {
            const avatar = p.profilePicUrl
                ? `<img src="${p.profilePicUrl}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">`
                : `<div style="width:42px;height:42px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">⚽</div>`;
            html += `<div class="player-card" style="cursor:pointer;" onclick="showPlayerDetail('${p.id}')">
                <div style="display:flex;align-items:center;gap:0.8rem;">
                    <span class="rank-badge">#${index + 1}</span>${avatar}
                    <div><h3>${p.fullName}${p.nickname ? ' (' + p.nickname + ')' : ''}</h3>
                    <small>${p.primaryPosition || ''} • ${p.count} rating${p.count > 1 ? 's' : ''}</small></div>
                </div>
                <div class="score-value">${p.average}</div></div>`;
        });
    }
    content.innerHTML = html;
}

async function showPlayerDetail(playerId) {
    const content = document.getElementById('content-area');
    content.innerHTML = '<p style="color:var(--text-muted);">Loading player details...</p>';
    let player = window._leaderboardData ? window._leaderboardData[playerId] : null;
    if (!player) {
        const doc = await db.collection('players').doc(playerId).get();
        if (!doc.exists) { content.innerHTML = '<p>Player not found.</p><button class="secondary" onclick="showLeaderboard()">Back</button>'; return; }
        player = { id: doc.id, ...doc.data() };
    }
    const ratingsSnap = await db.collection('ratings').where('ratedPlayerId', '==', playerId).get();
    const latestByRater = {};
    ratingsSnap.docs.forEach(doc => {
        const r = doc.data();
        const key = r.ratedByPlayerId;
        const ts = r.timestamp && r.timestamp.toMillis ? r.timestamp.toMillis() : 0;
        if (!latestByRater[key] || ts > latestByRater[key].ts) latestByRater[key] = { ...r, ts };
    });
    const ratings = Object.values(latestByRater);
    const isGK = player.primaryPosition === 'GK';
    const paramKeys = isGK
        ? ['shotstopping','handling','reflexes','positioning','communication','distribution','aerialability','oneononeability','decisionmaking','consistency']
        : ['pace','shooting','passing','dribbling','defending','physicality','stamina','gameiq','teamwork','ballcontrol'];
    const paramLabels = isGK
        ? ['Shot Stopping','Handling','Reflexes','Positioning','Communication','Distribution','Aerial Ability','One-on-One','Decision Making','Consistency']
        : ['Pace','Shooting','Passing','Dribbling','Defending','Physical','Stamina','Game IQ','Teamwork','Ball Control'];
    const averages = {};
    paramKeys.forEach((key, i) => {
        const values = ratings.map(r => r[key]).filter(v => typeof v === 'number');
        averages[paramLabels[i]] = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '—';
    });
    const overallAvg = player.average || (ratings.length > 0 ? (ratings.reduce((a, r) => a + (r.overall || 0), 0) / ratings.length).toFixed(1) : '—');
    const avatar = player.profilePicUrl
        ? `<img src="${player.profilePicUrl}" alt="" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid var(--border);">`
        : `<div style="width:90px;height:90px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:2.2rem;">⚽</div>`;
    let paramsHtml = '';
    Object.entries(averages).forEach(([label, val]) => {
        paramsHtml += `<div style="display:flex;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">${label}</span><strong style="color:var(--primary);">${val}</strong></div>`;
    });
    content.innerHTML = `
        <div>
            <button class="secondary" style="margin-bottom:1.2rem;" onclick="showLeaderboard()">← Back to Leaderboard</button>
            <div style="display:flex;align-items:center;gap:1.2rem;margin-bottom:1.5rem;">
                ${avatar}<div>
                    <h2 style="margin:0 0 0.3rem;">${player.fullName}${player.nickname ? ' (' + player.nickname + ')' : ''}</h2>
                    <p style="color:var(--text-muted);margin:0;">${player.primaryPosition || 'N/A'} • ${player.preferredFoot || 'N/A'} foot${player.yearsPlaying != null ? ' • ' + player.yearsPlaying + ' yrs' : ''}</p>
                    <p style="margin:0.4rem 0 0;font-size:1.4rem;font-weight:700;color:var(--primary);">Overall: ${overallAvg}
                        <span style="font-size:0.85rem;color:var(--text-muted);font-weight:400;">(${ratings.length} rating${ratings.length !== 1 ? 's' : ''})</span></p>
                </div>
            </div>
            ${player.aboutMe ? `<div style="margin-bottom:1.4rem;padding:1rem;background:var(--surface-2);border-radius:10px;"><div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.3rem;text-transform:uppercase;">About</div><p style="margin:0;line-height:1.5;">${player.aboutMe}</p></div>` : ''}
            <div style="margin-bottom:1rem;"><div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;text-transform:uppercase;">Positions</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">${(player.positions || []).map(p => `<span style="background:var(--surface-2);border:1px solid var(--border);padding:0.3rem 0.7rem;border-radius:6px;font-size:0.85rem;">${p}${p === player.primaryPosition ? ' ★' : ''}</span>`).join('')}</div></div>
            <div style="margin-top:1.5rem;"><div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.6rem;text-transform:uppercase;">Average Ratings</div>
                ${paramsHtml || '<p style="color:var(--text-muted);">No ratings yet.</p>'}</div>
        </div>`;
}

function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = onConfirm;
    document.getElementById('confirm-ok-btn').onclick = () => closeConfirmModal(true);
    modal.classList.remove('hidden');
}

function closeConfirmModal(confirmed) {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (confirmed && typeof confirmCallback === 'function') confirmCallback();
    confirmCallback = null;
}

function logout() {
    showConfirm('Are you sure you want to logout?', () => {
        auth.signOut();
        showToast('Logged out', 'info');
    });
}

async function deletePlayer(playerId, playerName) {
    if (!isAdmin()) { showToast('Only admin can delete players', 'error'); return; }
    showConfirm(`Delete player "${playerName}"? Their ratings will no longer count.`, async () => {
        try {
            await db.collection('players').doc(playerId).update({ isActive: false });
            showToast(`Player "${playerName}" deleted`, 'success');
            showRatePlayers();
        } catch (error) { showToast(error.message, 'error'); }
    });
}
