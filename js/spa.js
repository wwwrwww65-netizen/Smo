
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, push, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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

// Game Cards
gameCards.forEach(card => {
    card.addEventListener('click', () => {
        const gameUrl = card.dataset.game;
        if (gameUrl) {
            gameIframe.src = gameUrl;
            iframeModal.classList.remove('hidden');
        }
    });
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
btnCreateMyRoom.addEventListener('click', async () => {
    if (!currentUser) {
        showError('يرجى تسجيل الدخول أولاً');
        return;
    }

    try {
        if (!db) throw new Error('قاعدة البيانات غير متصلة');

        const roomId = `room_${currentUser.id}_${Date.now()}`;
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

        await set(ref(db, `user_rooms/${currentUser.id}/${roomId}`), newRoom);
        showSuccess(`✅ تم إنشاء غرفتك!\nاسم الغرفة: ${newRoom.name}`);
        console.log('✅ Room created:', newRoom);
        
        // إعادة تحميل قائمة الغرف
        loadUserRooms();
    } catch (error) {
        showError('خطأ في إنشاء الغرفة: ' + error.message);
        console.error('❌ Room creation error:', error);
    }
});

// Load User Rooms
function loadUserRooms() {
    if (!currentUser || !db) return;

    try {
        const userRoomsRef = ref(db, `user_rooms/${currentUser.id}`);
        onValue(userRoomsRef, (snapshot) => {
            const myRoomContent = document.getElementById('rooms-my-room');
            if (!myRoomContent) return;

            const rooms = snapshot.val();
            let roomsHTML = '<button id="btn-create-my-room" class="btn-primary">إنشاء غرفة جديدة 🎤</button>';
            
            if (rooms) {
                roomsHTML += '<div style="margin-top: 20px;">';
                for (const roomId in rooms) {
                    const room = rooms[roomId];
                    roomsHTML += `
                    <div class="room-card" data-room="${roomId}" style="margin-bottom: 15px; cursor: pointer;">
                        <img src="${room.ownerAvatar}" class="room-avatar">
                        <div class="room-info">
                            <div class="room-name">${room.name}</div>
                            <div class="room-stats">المضيف: ${room.owner} | 👥 ${room.currentUsers}/${room.capacity} | Lvl ${room.level}</div>
                        </div>
                    </div>`;
                }
                roomsHTML += '</div>';
            }

            myRoomContent.innerHTML = roomsHTML;
            
            // إعادة تعيين مستمع الزر الجديد
            const newBtnCreateMyRoom = myRoomContent.querySelector('#btn-create-my-room');
            if (newBtnCreateMyRoom) {
                newBtnCreateMyRoom.addEventListener('click', async () => {
                    if (!currentUser) {
                        showError('يرجى تسجيل الدخول أولاً');
                        return;
                    }

                    try {
                        const roomId = `room_${currentUser.id}_${Date.now()}`;
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

                        await set(ref(db, `user_rooms/${currentUser.id}/${roomId}`), newRoom);
                        showSuccess(`✅ تم إنشاء غرفتك!\nاسم الغرفة: ${newRoom.name}`);
                        console.log('✅ Room created:', newRoom);
                    } catch (error) {
                        showError('خطأ في إنشاء الغرفة: ' + error.message);
                    }
                });
            }

            // إضافة مستمع الروم كاردات
            const roomCards = myRoomContent.querySelectorAll('.room-card');
            roomCards.forEach(card => {
                card.addEventListener('click', () => {
                    const roomId = card.dataset.room;
                    if (roomId) {
                        window.location.href = `live/index.html?room=${roomId}`;
                    }
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

    // Static Rooms
    const roomsList = document.getElementById('active-rooms-list');
    if (roomsList) {
        let roomsHTML = '';
        for (let i=1; i<=4; i++) {
            roomsHTML += `
            <div class="room-card" data-room="room${i}">
                <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=Host${i}" class="room-avatar">
                <div class="room-info">
                    <div class="room-name">غرفة المرح ${i}</div>
                    <div class="room-stats">المضيف: مستخدم ${i} | 👥 ${Math.floor(Math.random()*7)+1}/8 | Lvl 5</div>
                </div>
            </div>`;
        }
        roomsList.innerHTML = roomsHTML;
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
                const chatRef = ref(db, 'global_chat');
                await push(chatRef, {
                    sender: currentUser.name,
                    avatar: currentUser.avatar,
                    text: "لقد أرسلت دعوة للعب أونو! 🎮",
                    timestamp: Date.now(),
                    isInvite: true,
                    gameUrl: 'ono.html'
                });
            }
            showSuccess('تم إرسال الدعوة!');
        } catch (error) {
            showError('خطأ في الدعوة: ' + error.message);
        }
    }

    // Room Card
    if (e.target.closest('.room-card')) {
        const roomId = e.target.closest('.room-card').dataset.room;
        if(roomId) {
            window.location.href = 'live/index.html?room=' + roomId;
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
        const pubAvatar = document.getElementById('pub-avatar');
        const pubName = document.getElementById('pub-name');
        const pubId = document.getElementById('pub-id');

        pubAvatar.src = e.target.src;
        const parentNode = e.target.parentNode;
        let nameText = "مستخدم";

        if (parentNode.querySelector('.chat-name')) {
            nameText = parentNode.querySelector('.chat-name').innerText;
        } else if (parentNode.querySelector('.post-author')) {
            nameText = parentNode.querySelector('.post-author').innerText;
        }

        pubName.innerText = nameText;
        pubId.innerText = generateUserId();

        document.getElementById('public-profile-modal').classList.remove('hidden');
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

// Initialize on Load
checkAuth();
