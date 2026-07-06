
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, push, query, orderByChild, equalTo, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { firebaseConfig } from './config.js';

let app, db;
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization failed:', error);
}

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const mainSpa = document.getElementById('main-spa');
const navItems = document.querySelectorAll('.nav-item');
const spaTabs = document.querySelectorAll('.spa-tab');

// Auth Tabs
const authTabBtns = document.querySelectorAll('.auth-tab-btn');
const authSections = document.querySelectorAll('.auth-section');

// Login Elements
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const btnLogin = document.getElementById('btn-login');

// Signup Elements
const signupName = document.getElementById('signup-name');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupPasswordConfirm = document.getElementById('signup-password-confirm');
const btnGender = document.querySelectorAll('.btn-gender');
const btnSignup = document.getElementById('btn-signup');

// Profile Elements
const headerAvatar = document.getElementById('header-avatar');
const headerGold = document.getElementById('header-gold');
const profileAvatarLarge = document.getElementById('profile-avatar-large');
const profileNameLarge = document.getElementById('profile-name-large');
const profileIdLarge = document.getElementById('profile-id-large');
const btnLogout = document.getElementById('btn-logout');

// Game & Room Elements
const gameCards = document.querySelectorAll('.game-card');
const iframeModal = document.getElementById('iframe-modal');
const gameIframe = document.getElementById('game-iframe');
const btnCloseIframe = document.getElementById('btn-close-iframe');
const btnCreateMyRoom = document.getElementById('btn-create-my-room');

// Message Elements
const postsFeed = document.getElementById('posts-feed');
const messagesList = document.getElementById('messages-list');

// Error/Success Messages
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');

let currentUser = null;
let selectedGender = null;

// Utility Functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => errorMessage.classList.remove('show'), 4000);
    console.error('❌', message);
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.add('show');
    setTimeout(() => successMessage.classList.remove('show'), 3000);
    console.log('✅', message);
}

// Generate 9-digit ID
function generateUserId() {
    // Generate random 9-digit number (100000000 to 999999999)
    return Math.floor(100000000 + Math.random() * 900000000).toString();
}

function updatePresence() {
    if (!currentUser || !db) return;
    const presenceRef = ref(db, `presence/${currentUser.uid}`);
    onDisconnect(presenceRef).remove();
    set(presenceRef, {
        name: currentUser.name,
        avatar: currentUser.avatar,
        lastSeen: serverTimestamp()
    });
}

// Generate 6-digit Room ID
function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Auth Tab Switching
authTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        authTabBtns.forEach(b => b.classList.remove('active'));
        authSections.forEach(section => section.classList.remove('active'));
        
        btn.classList.add('active');
        const tabName = btn.dataset.tab;
        document.getElementById(`${tabName}-section`).classList.add('active');
    });
});

// Gender Selection for Signup
btnGender.forEach(btn => {
    btn.addEventListener('click', () => {
        btnGender.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGender = btn.dataset.gender;
    });
});

// Login Function
btnLogin.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
        showError('يرجى إدخال اسم المستخدم وكلمة المرور');
        return;
    }

    try {
        // البحث عن المستخدم في Firebase
        if (!db) throw new Error('قاعدة البيانات غير متصلة');

        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        
        if (!snapshot.exists()) {
            showError('لا توجد حسابات مسجلة. يرجى إنشاء حساب جديد.');
            return;
        }

        const users = snapshot.val();
        let foundUser = null;

        // البحث عن المستخدم بناءً على الاسم أو الـ ID
        for (const uid in users) {
            const user = users[uid];
            if ((user.name === email || user.id === email) && user.password === password) {
                foundUser = { ...user, uid };
                break;
            }
        }

        if (foundUser) {
            currentUser = foundUser;
            localStorage.setItem('sumu_user', JSON.stringify(currentUser));
            localStorage.setItem('sumu_user_id', foundUser.uid);
            showSuccess('تم تسجيل الدخول بنجاح!');
            console.log('✅ User logged in:', currentUser);
            showSpa();
            initFirebaseData();
            updatePresence();
        } else {
            showError('اسم المستخدم أو كلمة المرور غير صحيحة');
        }
    } catch (error) {
        showError('خطأ في تسجيل الدخول: ' + error.message);
        console.error('❌ Login error:', error);
    }
});

// Signup Function
btnSignup.addEventListener('click', async () => {
    const name = signupName.value.trim();
    const password = signupPassword.value;
    const passwordConfirm = signupPasswordConfirm.value;

    if (!name || !password || !selectedGender) {
        showError('يرجى ملء جميع الحقول واختيار الجنس');
        return;
    }

    if (password.length < 6) {
        showError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }

    if (password !== passwordConfirm) {
        showError('كلمات المرور غير متطابقة');
        return;
    }

    try {
        if (!db) throw new Error('قاعدة البيانات غير متصلة');

        // التحقق من عدم وجود اسم مكرر
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        
        if (snapshot.exists()) {
            const users = snapshot.val();
            for (const uid in users) {
                if (users[uid].name === name) {
                    showError('هذا الاسم مستخدم بالفعل. يرجى اختيار اسم آخر');
                    return;
                }
            }
        }

        // إنشاء ID جديد (9 أرقام)
        const userId = generateUserId();
        const avatar = selectedGender === 'male' 
            ? `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}&b=%234f46e5` 
            : `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}1&b=%23ec4899`;

        const newUser = {
            id: userId,
            name,
            password, // ⚠️ ملاحظة: في التطبيقات الحقيقية، استخدم التشفير
            gender: selectedGender,
            avatar,
            gold: 1000,
            level: 1,
            createdAt: Date.now()
        };

        await set(ref(db, `users/${userId}`), newUser);
        
        currentUser = { ...newUser, uid: userId };
        localStorage.setItem('sumu_user', JSON.stringify(currentUser));
        localStorage.setItem('sumu_user_id', userId);
        
        showSuccess(`تم إنشاء الحساب بنجاح! 🎉\nالـ ID الخاص بك: ${userId}`);
        console.log('✅ New user created:', currentUser);
        
        // إعادة تعيين النموذج
        signupName.value = '';
        signupPassword.value = '';
        signupPasswordConfirm.value = '';
        selectedGender = null;
        btnGender.forEach(b => b.classList.remove('selected'));
        
        setTimeout(() => {
            showSpa();
            initFirebaseData();
        }, 1500);
    } catch (error) {
        showError('خطأ في إنشاء الحساب: ' + error.message);
        console.error('❌ Signup error:', error);
    }
});

// Check existing auth
function checkAuth() {
    const savedUser = localStorage.getItem('sumu_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        console.log('✅ User restored from localStorage:', currentUser);
        showSpa();
        initFirebaseData();
        updatePresence();
    } else {
        console.log('📍 No saved user, showing auth screen');
    }
}

function showSpa() {
    console.log('📍 Showing SPA...');
    authScreen.classList.remove('active-screen');
    authScreen.style.display = 'none';
    mainSpa.classList.remove('hidden');
    mainSpa.style.display = 'block';
    
    if (currentUser) {
        headerAvatar.src = currentUser.avatar;
        headerGold.innerText = currentUser.gold || 0;
        profileAvatarLarge.src = currentUser.avatar;
        profileNameLarge.innerText = currentUser.name;
        profileIdLarge.innerText = currentUser.id;
        console.log('✅ SPA displayed successfully');
    }
}

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        spaTabs.forEach(tab => tab.classList.add('hidden'));
        spaTabs.forEach(tab => tab.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.dataset.target;
        const targetTab = document.getElementById(targetId);
        targetTab.classList.remove('hidden');
        targetTab.classList.add('active');
    });
});

// Game Launcher Logic
const gameLauncherModal = document.getElementById('game-launcher-modal');
const launcherGameTitle = document.getElementById('launcher-game-title');
const launcherGameIcon = document.getElementById('launcher-game-icon');
const btnLauncherCreate = document.getElementById('btn-launcher-create');
const btnLauncherSearch = document.getElementById('btn-launcher-search');
const btnLauncherJoin = document.getElementById('btn-launcher-join');
const launcherRoomCode = document.getElementById('launcher-room-code');
const launcherLoading = document.getElementById('launcher-loading');
const btnCancelSearch = document.getElementById('btn-cancel-search');
const btnCloseLauncher = document.getElementById('btn-close-launcher');

let selectedGameUrl = '';
let searchTimeout = null;

gameCards.forEach(card => {
    card.addEventListener('click', () => {
        selectedGameUrl = card.dataset.game;
        const gameTitle = card.querySelector('h3').innerText;
        const gameIconText = card.querySelector('.game-icon').innerText;
        const gameIconBg = card.querySelector('.game-icon').style.background;

        launcherGameTitle.innerText = gameTitle;
        launcherGameIcon.innerText = gameIconText;
        launcherGameIcon.style.background = gameIconBg;

        gameLauncherModal.classList.remove('hidden');
    });
});

btnCloseLauncher.addEventListener('click', () => {
    gameLauncherModal.classList.add('hidden');
    launcherLoading.classList.add('hidden');
    clearTimeout(searchTimeout);
});

btnLauncherCreate.addEventListener('click', () => {
    if (selectedGameUrl) {
        const roomId = generateRoomId();
        const url = `${selectedGameUrl}?roomID=${roomId}&role=owner&username=${encodeURIComponent(currentUser.name)}`;
        window.launchGame(url);
        gameLauncherModal.classList.add('hidden');
    }
});

btnLauncherJoin.addEventListener('click', () => {
    const code = launcherRoomCode.value.trim();
    if (code && selectedGameUrl) {
        const url = `${selectedGameUrl}?roomID=${code}&role=guest&username=${encodeURIComponent(currentUser.name)}`;
        window.launchGame(url);
        gameLauncherModal.classList.add('hidden');
        launcherRoomCode.value = '';
    } else {
        showError('يرجى إدخال رمز الغرفة');
    }
});

btnLauncherSearch.addEventListener('click', () => {
    launcherLoading.classList.remove('hidden');

    // محاكاة بحث رائع
    searchTimeout = setTimeout(() => {
        launcherLoading.classList.add('hidden');
        // في التطبيق الحقيقي سنبحث في قاعدة البيانات عن غرف متاحة
        // هنا سنقوم بإنشاء غرفة جديدة لغرض العرض إذا لم يجد
        const roomId = generateRoomId();
        const url = `${selectedGameUrl}?roomID=${roomId}&role=owner&username=${encodeURIComponent(currentUser.name)}`;
        window.launchGame(url);
        gameLauncherModal.classList.add('hidden');
    }, 3000);
});

btnCancelSearch.addEventListener('click', () => {
    launcherLoading.classList.add('hidden');
    clearTimeout(searchTimeout);
});

btnCloseIframe.addEventListener('click', () => {
    iframeModal.classList.add('hidden');
    gameIframe.src = '';
});

// Sub-tabs for Rooms
const subTabs = document.querySelectorAll('.sub-tab');
const subContents = document.querySelectorAll('.sub-tab-content');
subTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.sub;
        subTabs.forEach(t => t.classList.remove('active'));
        subContents.forEach(c => c.classList.add('hidden'));
        subContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const content = document.getElementById(`rooms-${target}`);
        if(content) {
            content.classList.remove('hidden');
            content.classList.add('active');
        }
    });
});

// Create My Room
async function handleCreateRoom() {
    if (!currentUser) {
        showError('يرجى تسجيل الدخول أولاً');
        return;
    }

    try {
        if (!db) throw new Error('قاعدة البيانات غير متصلة');

        const roomId = generateRoomId();
        const newRoom = {
            id: roomId,
            name: `غرفة ${currentUser.name}`,
            owner: currentUser.name,
            ownerId: currentUser.id,
            ownerAvatar: currentUser.avatar,
            capacity: 8,
            currentUsers: 1,
            level: currentUser.level,
            createdAt: Date.now(),
            isActive: true
        };

        // حفظ في غرف المستخدم وفي الغرف العامة "استكشف"
        await set(ref(db, `user_rooms/${currentUser.id}/${roomId}`), newRoom);
        await set(ref(db, `public_rooms/${roomId}`), newRoom);

        showSuccess(`✅ تم إنشاء غرفتك!\nرقم الغرفة: ${roomId}`);
        console.log('✅ Room created:', newRoom);
        
        // الانتقال للغرفة كمالك
        setTimeout(() => {
            enterRoom(roomId, 'owner');
        }, 1500);

    } catch (error) {
        showError('خطأ في إنشاء الغرفة: ' + error.message);
        console.error('❌ Room creation error:', error);
    }
}

function enterRoom(roomId, role = 'guest') {
    if (!roomId) return;
    const url = `live/index.html?roomID=${roomId}&username=${encodeURIComponent(currentUser.name)}&role=${role}`;
    window.location.href = url;
}

btnCreateMyRoom.addEventListener('click', handleCreateRoom);

// Load User Rooms
function loadUserRooms() {
    if (!currentUser || !db) return;

    try {
        const userRoomsRef = ref(db, `user_rooms/${currentUser.id}`);
        onValue(userRoomsRef, (snapshot) => {
            const myRoomContent = document.getElementById('rooms-my-room');
            if (!myRoomContent) return;

            const rooms = snapshot.val();
            let roomsHTML = '<button id="btn-create-my-room-inner" class="btn-primary">إنشاء غرفة جديدة 🎤</button>';
            
            if (rooms) {
                roomsHTML += '<div style="margin-top: 20px;">';
                for (const roomId in rooms) {
                    const room = rooms[roomId];
                    roomsHTML += `
                    <div class="room-card" data-room="${room.id}" data-role="owner" style="margin-bottom: 15px; cursor: pointer;">
                        <img src="${room.ownerAvatar}" class="room-avatar">
                        <div class="room-info">
                            <div class="room-name">${room.name}</div>
                            <div class="room-stats">المضيف: ${room.owner} | ID: ${room.id} | 👥 ${room.currentUsers}/${room.capacity}</div>
                        </div>
                    </div>`;
                }
                roomsHTML += '</div>';
            }

            myRoomContent.innerHTML = roomsHTML;
            
            const innerBtn = myRoomContent.querySelector('#btn-create-my-room-inner');
            if (innerBtn) innerBtn.onclick = handleCreateRoom;

            // إضافة مستمع الروم كاردات
            const roomCards = myRoomContent.querySelectorAll('.room-card');
            roomCards.forEach(card => {
                card.addEventListener('click', () => {
                    const roomId = card.dataset.room;
                    const role = card.dataset.role || 'guest';
                    enterRoom(roomId, role);
                });
            });
        });
    } catch (error) {
        console.error('❌ Error loading user rooms:', error);
    }
}

// Logout
btnLogout.addEventListener('click', () => {
    localStorage.removeItem('sumu_user');
    localStorage.removeItem('sumu_user_id');
    currentUser = null;
    location.reload();
});

// Firebase Data Sync
function initFirebaseData() {
    if (!db) {
        console.warn('⚠️ Firebase not initialized');
        return;
    }

    try {
        // Posts
        const postsRef = ref(db, 'posts');
        onValue(postsRef, (snapshot) => {
            if(postsFeed) {
                postsFeed.innerHTML = '';
                const posts = snapshot.val();
                if(posts) {
                    Object.keys(posts).forEach(key => {
                        const post = posts[key];
                        postsFeed.innerHTML = `
                        <div class="post-card">
                            <div class="post-header">
                                <img src="${post.authorAvatar}" class="post-avatar">
                                <div>
                                    <div class="post-author">${post.authorName}</div>
                                    <div class="post-time">${new Date(post.timestamp).toLocaleTimeString('ar-SA')}</div>
                                </div>
                            </div>
                            <div class="post-content">${post.content}</div>
                            <div class="post-actions">
                                <button class="btn-post-action">❤️ إعجاب (${post.likes || 0})</button>
                                <button class="btn-post-action">💬 تعليق</button>
                            </div>
                        </div>` + postsFeed.innerHTML;
                    });
                }
            }
        });

        // Messages
        const chatRef = ref(db, 'global_chat');
        onValue(chatRef, (snapshot) => {
            if(messagesList) {
                messagesList.innerHTML = '';
                const messages = snapshot.val();
                if(messages) {
                    Object.keys(messages).forEach(key => {
                        const msg = messages[key];
                        messagesList.innerHTML = `
                        <div class="chat-item">
                            <img src="${msg.avatar}" class="chat-avatar">
                            <div class="chat-info">
                                <div class="chat-name">${msg.sender}</div>
                                <div class="chat-preview">${msg.isInvite ? '<button class="btn-primary btn-accept-invite" style="font-size:12px; padding:5px 10px; margin-top:5px;" data-game="'+msg.gameUrl+'">دعوة للعب 🎮</button>' : msg.text}</div>
                            </div>
                            <button class="btn-game-invite" title="دعوة للعب">🎮</button>
                        </div>` + messagesList.innerHTML;
                    });
                }
            }
        });

        // Load user rooms
        loadUserRooms();
    } catch (error) {
        console.error('❌ Firebase data initialization failed:', error);
    }

    // Real Rooms for Explore
    const roomsList = document.getElementById('active-rooms-list');
    if (roomsList) {
        const publicRoomsRef = ref(db, 'public_rooms');
        onValue(publicRoomsRef, (snapshot) => {
            const rooms = snapshot.val();
            if (!rooms) {
                roomsList.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">لا توجد غرف نشطة حالياً</div>';
                return;
            }

            let roomsHTML = '';
            // Convert to array and sort by latest or participants
            const roomArray = Object.values(rooms).sort((a, b) => b.createdAt - a.createdAt);

            roomArray.forEach(room => {
                roomsHTML += `
                <div class="room-card" data-room="${room.id}">
                    <img src="${room.ownerAvatar}" class="room-avatar">
                    <div class="room-info">
                        <div class="room-name">${room.name}</div>
                        <div class="room-stats">المضيف: ${room.owner} | ID: ${room.id} | 👥 ${room.currentUsers || 0}/${room.capacity}</div>
                    </div>
                </div>`;
            });
            roomsList.innerHTML = roomsHTML;
        });
    }
}

// Global Event Delegation
document.addEventListener('click', async (e) => {
    // Posts
    if (e.target.id === 'btn-submit-post') {
        const newPostInput = document.getElementById('new-post-input');
        if (newPostInput && newPostInput.value.trim() && currentUser) {
            try {
                if (db) {
                    const postsRef = ref(db, 'posts');
                    await push(postsRef, {
                        authorName: currentUser.name,
                        authorAvatar: currentUser.avatar,
                        content: newPostInput.value.trim(),
                        timestamp: Date.now(),
                        likes: 0
                    });
                }
                newPostInput.value = '';
                showSuccess('تم نشر المنشور!');
            } catch (error) {
                showError('خطأ في النشر: ' + error.message);
            }
        }
    }

    // Messages
    if (e.target.id === 'btn-submit-msg') {
        const newMsgInput = document.getElementById('new-msg-input');
        if (newMsgInput && newMsgInput.value.trim() && currentUser) {
            try {
                if (db) {
                    const chatRef = ref(db, 'global_chat');
                    await push(chatRef, {
                        sender: currentUser.name,
                        avatar: currentUser.avatar,
                        text: newMsgInput.value.trim(),
                        timestamp: Date.now(),
                        isInvite: false
                    });
                }
                newMsgInput.value = '';
                showSuccess('تم إرسال الرسالة!');
            } catch (error) {
                showError('خطأ في الإرسال: ' + error.message);
            }
        }
    }

    // Accept Invite
    if (e.target.classList.contains('btn-accept-invite')) {
        const gameUrl = e.target.dataset.game;
        if (gameUrl) {
            window.launchGame(gameUrl);
        }
    }

    // Game Invite
    if (e.target.closest('.btn-game-invite')) {
        try {
            if (db) {
                const roomId = generateRoomId();
                const chatRef = ref(db, 'global_chat');
                await push(chatRef, {
                    sender: currentUser.name,
                    avatar: currentUser.avatar,
                    text: "لقد أرسلت دعوة للعب أونو! 🎮",
                    timestamp: Date.now(),
                    isInvite: true,
                    gameUrl: `ono.html?roomID=${roomId}&role=guest&username=${encodeURIComponent(currentUser.name)}`
                });
            }
            showSuccess('تم إرسال الدعوة!');
        } catch (error) {
            showError('خطأ في الدعوة: ' + error.message);
        }
    }

    // Room Card
    if (e.target.closest('.room-card')) {
        const card = e.target.closest('.room-card');
        const roomId = card.dataset.room;
        const role = card.dataset.role || 'guest';
        if(roomId && currentUser) {
            enterRoom(roomId, role);
        }
    }

    // Room Modal Controls
    if (e.target.id === 'btn-minimize-room') {
        document.getElementById('legacy-room-modal').classList.add('hidden');
        document.getElementById('minimized-room-bubble').classList.remove('hidden');
        document.getElementById('minimized-room-bubble').style.display = 'flex';
    }

    if (e.target.id === 'btn-close-room') {
        document.getElementById('legacy-room-modal').classList.add('hidden');
        document.getElementById('room-iframe').src = '';
    }

    if (e.target.id === 'minimized-room-bubble') {
        document.getElementById('minimized-room-bubble').classList.add('hidden');
        document.getElementById('minimized-room-bubble').style.display = 'none';
        document.getElementById('legacy-room-modal').classList.remove('hidden');
    }

    // Public Profile
    if (e.target.tagName === 'IMG' && (e.target.classList.contains('chat-avatar') || e.target.classList.contains('post-avatar') || e.target.classList.contains('room-avatar'))) {
    const card = e.target.closest('.chat-item') || e.target.closest('.post-card') || e.target.closest('.room-card');
    let targetUid = null;
    let targetName = "مستخدم";
    let targetAvatar = e.target.src;

    if (card) {
        if (card.dataset.userId) targetUid = card.dataset.userId;
        else if (card.querySelector('.chat-name')) targetName = card.querySelector('.chat-name').innerText;
        else if (card.querySelector('.post-author')) targetName = card.querySelector('.post-author').innerText;
        else if (card.querySelector('.room-name')) targetName = card.querySelector('.room-name').innerText;
        }

    showPublicProfile(targetUid, targetName, targetAvatar);
    }

    if (e.target.id === 'btn-close-profile') {
        document.getElementById('public-profile-modal').classList.add('hidden');
    }
});

window.launchGame = function(gameUrl) {
    if (gameUrl) {
        gameIframe.src = gameUrl;
        iframeModal.classList.remove('hidden');
    }
}

// ================== FRIEND & CHAT SYSTEM ==================

const searchUsersModal = document.getElementById('search-users-modal');
const btnOpenSearchUsers = document.getElementById('btn-open-search-users');
const btnCloseSearchUsers = document.getElementById('btn-close-search-users');
const userSearchInput = document.getElementById('user-search-input');
const searchResults = document.getElementById('search-results');

const friendRequestsModal = document.getElementById('friend-requests-modal');
const inboxFriendRequests = document.getElementById('inbox-friend-requests');
const btnCloseFriendRequests = document.getElementById('btn-close-friend-requests');
const friendRequestsList = document.getElementById('friend-requests-list');
const friendRequestsBadge = document.getElementById('friend-requests-badge');

const privateChatModal = document.getElementById('private-chat-modal');
const btnBackFromChat = document.getElementById('btn-back-from-chat');
const privateMessagesLog = document.getElementById('private-messages-log');
const privateChatInput = document.getElementById('private-chat-input');
const btnSendPrivateMsg = document.getElementById('btn-send-private-msg');
const chatsList = document.getElementById('chats-list');
const globalUnreadBadge = document.getElementById('global-unread-badge');

const chatTargetAvatar = document.getElementById('chat-target-avatar');
const chatTargetName = document.getElementById('chat-target-name');

let currentChatId = null;
let currentChatPartner = null;

// Show Public Profile
async function showPublicProfile(uid, name, avatar) {
    const pubAvatar = document.getElementById('pub-avatar');
    const pubName = document.getElementById('pub-name');
    const pubId = document.getElementById('pub-id');
    const profileActionsArea = document.getElementById('profile-actions-area');

    pubAvatar.src = avatar;
    pubName.innerText = name;

    if (!uid) {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        if (snapshot.exists()) {
            const users = snapshot.val();
            for (const id in users) {
                if (users[id].name === name) {
                    uid = id;
                    break;
                }
            }
        }
    }

    pubId.innerText = uid || "غير معروف";

    if (uid && currentUser && uid !== currentUser.uid) {
        const friendRef = ref(db, `friends/${currentUser.uid}/${uid}`);
        const friendSnap = await get(friendRef);

        const requestRef = ref(db, `friend_requests/${uid}/${currentUser.uid}`);
        const requestSnap = await get(requestRef);

        if (friendSnap.exists()) {
            profileActionsArea.innerHTML = '<button class="btn-success" style="width: 100%;" disabled>أصدقاء ✅</button>';
        } else if (requestSnap.exists()) {
            profileActionsArea.innerHTML = '<button class="btn-secondary" style="width: 100%;" disabled>طلب معلق...</button>';
        } else {
            profileActionsArea.innerHTML = `<button id="btn-add-friend-action" class="btn-primary" style="width: 100%;" data-uid="${uid}" data-name="${name}" data-avatar="${avatar}">إضافة صديق ➕</button>`;
            document.getElementById('btn-add-friend-action').onclick = (e) => sendFriendRequest(e.target.dataset.uid, e.target.dataset.name, e.target.dataset.avatar);
        }
    } else {
        profileActionsArea.innerHTML = '';
    }

    document.getElementById('public-profile-modal').classList.remove('hidden');
}

// Send Friend Request
async function sendFriendRequest(targetUid, targetName, targetAvatar) {
    if (!currentUser || !targetUid) return;

    try {
        const requestRef = ref(db, `friend_requests/${targetUid}/${currentUser.uid}`);
        await set(requestRef, {
            fromId: currentUser.uid,
            fromName: currentUser.name,
            fromAvatar: currentUser.avatar,
            timestamp: Date.now(),
            status: 'pending'
        });
        showSuccess('تم إرسال طلب الصداقة بنجاح!');
        document.getElementById('public-profile-modal').classList.add('hidden');
    } catch (error) {
        showError('فشل إرسال الطلب');
    }
}

// Search Users
userSearchInput.addEventListener('input', async () => {
    const queryStr = userSearchInput.value.trim().toLowerCase();
    if (queryStr.length < 2) {
        searchResults.innerHTML = '';
        return;
    }
    // We rely on the search button for heavy lifting, or we can call performUserSearch here
    // For performance, let's just clear if too short, otherwise let user click search
});

if (btnOpenSearchUsers) btnOpenSearchUsers.onclick = () => searchUsersModal.classList.remove('hidden');
if (btnCloseSearchUsers) btnCloseSearchUsers.onclick = () => searchUsersModal.classList.add('hidden');

const btnMainSearch = document.getElementById('btn-main-search');
if (btnMainSearch) {
    btnMainSearch.onclick = () => {
        searchUsersModal.classList.remove('hidden');
    };
}

const btnExecuteUserSearch = document.getElementById('btn-execute-user-search');
if (btnExecuteUserSearch) {
    btnExecuteUserSearch.onclick = async () => {
        const queryStr = userSearchInput.value.trim().toLowerCase();
        if (!queryStr) {
            showError('يرجى إدخال كلمة البحث');
            return;
        }
        await performUserSearch(queryStr);
    };
}

async function performUserSearch(queryStr) {
    searchResults.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div> جاري البحث...</div>';

    try {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        if (snapshot.exists()) {
            const users = snapshot.val();
            let html = '';
            let count = 0;
            for (const uid in users) {
                const user = users[uid];
                if (currentUser && uid === currentUser.uid) continue;

                const name = String(user.name || "").toLowerCase();
                const id = String(user.id || "");

                if (name.includes(queryStr) || id.includes(queryStr)) {
                    count++;
                    html += `
                    <div class="chat-item" onclick="showPublicProfile('${uid}', '${user.name}', '${user.avatar}')">
                        <img src="${user.avatar}" class="chat-avatar">
                        <div class="chat-info">
                            <div class="chat-name">${user.name}</div>
                            <div class="chat-preview">ID: ${user.id}</div>
                        </div>
                        <button class="btn-primary btn-add-direct"
                                data-uid="${uid}"
                                data-name="${user.name}"
                                data-avatar="${user.avatar}"
                                style="padding: 5px 15px; font-size: 12px; position: relative; z-index: 10;">إضافة</button>
                    </div>`;
                }
            }
            searchResults.innerHTML = html || '<div style="text-align:center; padding:20px; color:#888;">لم يتم العثور على نتائج</div>';

            // Add event listeners for direct add buttons
            searchResults.querySelectorAll('.btn-add-direct').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation(); // Prevent opening profile
                    sendFriendRequest(btn.dataset.uid, btn.dataset.name, btn.dataset.avatar);
                    btn.disabled = true;
                    btn.innerText = 'تم';
                    btn.style.opacity = '0.5';
                };
            });
        } else {
            searchResults.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">لم يتم العثور على نتائج</div>';
        }
    } catch (error) {
        console.error("Search error:", error);
        showError('حدث خطأ أثناء البحث');
        searchResults.innerHTML = '<div style="text-align:center; padding:20px; color:#f87171;">فشل جلب البيانات</div>';
    }
}

// Friend Requests Listener
function initFriendRequestsListener() {
    if (!currentUser) return;
    const requestsRef = ref(db, `friend_requests/${currentUser.uid}`);
    onValue(requestsRef, (snapshot) => {
        const requests = snapshot.val();
        if (requests) {
            const count = Object.keys(requests).length;
            friendRequestsBadge.innerText = count;
            friendRequestsBadge.classList.remove('hidden');

            let html = '';
            Object.keys(requests).forEach(reqId => {
                const req = requests[reqId];
                html += `
                <div class="chat-item">
                    <img src="${req.fromAvatar}" class="chat-avatar">
                    <div class="chat-info">
                        <div class="chat-name">${req.fromName}</div>
                        <div class="chat-preview">يريد مصادقتك</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-success btn-accept-friend" data-uid="${req.fromId}" data-name="${req.fromName}" data-avatar="${req.fromAvatar}" style="padding: 5px 10px; font-size: 12px;">قبول</button>
                        <button class="btn-danger btn-ignore-friend" data-uid="${req.fromId}" style="padding: 5px 10px; font-size: 12px;">تجاهل</button>
                    </div>
                </div>`;
            });
            friendRequestsList.innerHTML = html;

            friendRequestsList.querySelectorAll('.btn-accept-friend').forEach(btn => {
                btn.onclick = () => acceptFriendRequest(btn.dataset.uid, btn.dataset.name, btn.dataset.avatar);
            });
            friendRequestsList.querySelectorAll('.btn-ignore-friend').forEach(btn => {
                btn.onclick = () => ignoreFriendRequest(btn.dataset.uid);
            });
        } else {
            friendRequestsBadge.classList.add('hidden');
            friendRequestsList.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">لا توجد طلبات معلقة</div>';
        }
    });
}

async function acceptFriendRequest(uid, name, avatar) {
    try {
        await set(ref(db, `friends/${currentUser.uid}/${uid}`), { name, avatar, timestamp: Date.now() });
        await set(ref(db, `friends/${uid}/${currentUser.uid}`), { name: currentUser.name, avatar: currentUser.avatar, timestamp: Date.now() });
        await set(ref(db, `friend_requests/${currentUser.uid}/${uid}`), null);
        showSuccess('تم قبول طلب الصداقة! 🎉');
        const chatId = [currentUser.uid, uid].sort().join('_');
        await update(ref(db, `chats/${chatId}/meta`), {
            lastMessage: "تم قبول طلب الصداقة، ابدأ الدردشة الآن!",
            timestamp: Date.now(),
            users: [currentUser.uid, uid]
        });
    } catch (e) { showError('فشل قبول الطلب'); }
}

async function ignoreFriendRequest(uid) {
    await set(ref(db, `friend_requests/${currentUser.uid}/${uid}`), null);
}

if (inboxFriendRequests) inboxFriendRequests.onclick = () => friendRequestsModal.classList.remove('hidden');
if (btnCloseFriendRequests) btnCloseFriendRequests.onclick = () => friendRequestsModal.classList.add('hidden');

// Chats List Listener
function initChatsListener() {
    if (!currentUser) return;
    const friendsRef = ref(db, `friends/${currentUser.uid}`);
    onValue(friendsRef, (snapshot) => {
        const friends = snapshot.val();
        if (friends) {
            chatsList.innerHTML = '';
            Object.keys(friends).forEach(fUid => {
                const friend = friends[fUid];
                const chatId = [currentUser.uid, fUid].sort().join('_');

                const metaRef = ref(db, `chats/${chatId}/meta`);
                onValue(metaRef, (metaSnap) => {
                    const meta = metaSnap.val() || {};
                    let chatEl = document.getElementById(`chat-item-${chatId}`);
                    const preview = meta.lastMessage || "ابدأ الدردشة...";
                    const unreadCount = meta[`unread_${currentUser.uid}`] || 0;

                    const chatHtml = `
                    <div class="inbox-item" id="chat-item-${chatId}" data-chatid="${chatId}" data-partnerid="${fUid}" data-partnername="${friend.name}" data-partneravatar="${friend.avatar}">
                        <img src="${friend.avatar}" class="chat-avatar">
                        <div class="inbox-info">
                            <div class="inbox-name">${friend.name}</div>
                            <div class="inbox-preview">${preview}</div>
                        </div>
                        ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                    </div>`;

                    if (chatEl) {
                        chatEl.outerHTML = chatHtml;
                    } else {
                        chatsList.innerHTML += chatHtml;
                    }
                    updateGlobalUnreadBadge();
                });
            });
        } else {
            chatsList.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">لا توجد محادثات نشطة</div>';
        }
    });
}

function updateGlobalUnreadBadge() {
    let total = 0;
    // Calculate total unread from chats
    document.querySelectorAll('#chats-list .unread-badge').forEach(b => total += parseInt(b.innerText || 0));

    // Add friend requests count
    const frBadge = document.getElementById('friend-requests-badge');
    if (frBadge && !frBadge.classList.contains('hidden')) {
        total += parseInt(frBadge.innerText || 0);
    }

    if (globalUnreadBadge) {
        globalUnreadBadge.innerText = total > 99 ? '99+' : total;
        globalUnreadBadge.classList.toggle('hidden', total === 0);
    }
}

document.addEventListener('click', (e) => {
    const chatItem = e.target.closest('.inbox-item[data-chatid]');
    if (chatItem) {
        const { chatid, partnerid, partnername, partneravatar } = chatItem.dataset;
        openPrivateChat(chatid, partnerid, partnername, partneravatar);
    }
});

function openPrivateChat(chatId, partnerId, partnerName, partnerAvatar) {
    currentChatId = chatId;
    currentChatPartner = partnerId;
    chatTargetName.innerText = partnerName;
    chatTargetAvatar.src = partnerAvatar;
    privateChatModal.classList.remove('hidden');
    update(ref(db, `chats/${chatId}/meta`), {
        [`unread_${currentUser.uid}`]: 0
    });
    const msgsRef = ref(db, `chats/${chatId}/messages`);
    onValue(msgsRef, (snapshot) => {
        if (currentChatId !== chatId) return;
        privateMessagesLog.innerHTML = '';
        const msgs = snapshot.val();
        if (msgs) {
            Object.values(msgs).forEach(msg => {
                const isMine = msg.senderId === currentUser.uid;
                if (msg.type === 'game_invite') {
                    privateMessagesLog.innerHTML += `
                    <div class="game-invite-card ${isMine ? 'bubble-right' : 'bubble-left'}" style="align-self: ${isMine ? 'flex-end' : 'flex-start'}">
                        <div class="invite-game-icon">${msg.gameIcon || '🎮'}</div>
                        <div style="font-weight:bold;">دعوة للعب ${msg.gameName}</div>
                        <button class="btn-join-invite" onclick="window.launchGame('${msg.gameUrl}?roomID=${msg.gameRoom}&role=guest&username=${encodeURIComponent(currentUser.name)}')">انضم الآن</button>
                    </div>`;
                } else {
                    privateMessagesLog.innerHTML += `
                    <div class="chat-bubble-p ${isMine ? 'bubble-right' : 'bubble-left'}">
                        ${msg.text}
                    </div>`;
                }
            });
            privateMessagesLog.scrollTop = privateMessagesLog.scrollHeight;
        }
    });
}

if (btnBackFromChat) btnBackFromChat.onclick = () => {
    privateChatModal.classList.add('hidden');
    currentChatId = null;
};

async function sendPrivateMessage(text, type = 'text', extra = {}) {
    if (!currentChatId || (!text && type === 'text')) return;
    const msgData = {
        senderId: currentUser.uid,
        text: text,
        type: type,
        timestamp: Date.now(),
        ...extra
    };
    const chatId = currentChatId;
    const partnerId = currentChatPartner;
    await push(ref(db, `chats/${chatId}/messages`), msgData);
    const metaRef = ref(db, `chats/${chatId}/meta`);
    const metaSnap = await get(metaRef);
    const meta = metaSnap.val() || {};
    const partnerUnread = (meta[`unread_${partnerId}`] || 0) + 1;
    await update(metaRef, {
        lastMessage: type === 'game_invite' ? `دعوة للعب ${extra.gameName}` : text,
        timestamp: Date.now(),
        [`unread_${partnerId}`]: partnerUnread
    });
    privateChatInput.value = '';
}

if (btnSendPrivateMsg) btnSendPrivateMsg.onclick = () => sendPrivateMessage(privateChatInput.value.trim());
if (privateChatInput) privateChatInput.onkeypress = (e) => { if (e.key === 'Enter') btnSendPrivateMsg.click(); };

const btnChatGames = document.getElementById('btn-chat-games');
const chatGamePopup = document.getElementById('chat-game-popup');
if (btnChatGames) btnChatGames.onclick = () => chatGamePopup.classList.toggle('hidden');

document.querySelectorAll('.game-invite-option').forEach(opt => {
    opt.onclick = () => {
        const gameUrl = opt.dataset.game;
        const gameName = opt.querySelector('span').innerText;
        const gameIcon = opt.querySelector('.icon').innerText;
        const roomId = generateRoomId();
        sendPrivateMessage(`أرسلت دعوة للعب ${gameName}`, 'game_invite', {
            gameUrl, gameName, gameIcon, gameRoom: roomId
        });
        chatGamePopup.classList.add('hidden');
        window.launchGame(`${gameUrl}?roomID=${roomId}&role=owner&username=${encodeURIComponent(currentUser.name)}`);
    };
});

// Online Friends Listener
function initOnlineFriendsListener() {
    if (!currentUser) return;
    const friendsRef = ref(db, `friends/${currentUser.uid}`);
    const onlineFriendsList = document.getElementById('online-friends-list');

    onValue(friendsRef, (snapshot) => {
        const friends = snapshot.val();
        if (friends) {
            onlineFriendsList.innerHTML = '';
            Object.keys(friends).forEach(fUid => {
                const presenceRef = ref(db, `presence/${fUid}`);
                onValue(presenceRef, (pSnap) => {
                    const presence = pSnap.val();
                    const existing = document.getElementById(`online-bubble-${fUid}`);
                    if (presence) {
                        const html = `
                        <div class="online-friend-bubble" id="online-bubble-${fUid}" style="position: relative; cursor: pointer; min-width: 60px;">
                            <img src="${presence.avatar}" style="width: 50px; height: 50px; border-radius: 50%; border: 2px solid var(--accent-color);">
                            <div style="position: absolute; bottom: 15px; right: 5px; width: 12px; height: 12px; background: #22c55e; border-radius: 50%; border: 2px solid var(--bg-dark);"></div>
                            <span style="font-size: 11px; margin-top: 5px; display: block; text-align: center; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${presence.name}</span>
                        </div>`;
                        if (existing) existing.outerHTML = html;
                        else onlineFriendsList.innerHTML += html;

                        const newBubble = document.getElementById(`online-bubble-${fUid}`);
                        newBubble.onclick = () => showPublicProfile(fUid, presence.name, presence.avatar);
                    } else if (existing) {
                        existing.remove();
                    }
                });
            });
        }
    });
}

const originalInitFirebaseData = initFirebaseData;
initFirebaseData = function() {
    originalInitFirebaseData();
    initFriendRequestsListener();
    initChatsListener();
    initOnlineFriendsListener();
};

checkAuth();
