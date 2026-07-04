
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
        showError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
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

        // البحث عن المستخدم بناءً على البريد أو الاسم
        for (const uid in users) {
            const user = users[uid];
            if ((user.email === email || user.name === email) && user.password === password) {
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
            showError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        }
    } catch (error) {
        showError('خطأ في تسجيل الدخول: ' + error.message);
        console.error('❌ Login error:', error);
    }
});

// Signup Function
btnSignup.addEventListener('click', async () => {
    const name = signupName.value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    const passwordConfirm = signupPasswordConfirm.value;

    if (!name || !email || !password || !selectedGender) {
        showError('يرجى ملء جميع الحقول واختيار الجنس');
        return;
    }

    if (password.length < 6) {
        showError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }

    if (password !== passwordConfirm) {
        showError('كلمات ال��رور غير متطابقة');
        return;
    }

    if (!email.includes('@')) {
        showError('البريد الإلكتروني غير صحيح');
        return;
    }

    try {
        if (!db) throw new Error('قاعدة البيانات غير متصلة');

        // التحقق من عدم وجود بريد مسجل بالفعل
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        
        if (snapshot.exists()) {
            const users = snapshot.val();
            for (const uid in users) {
                if (users[uid].email === email) {
                    showError('هذا البريد الإلكتروني مسجل بالفعل');
                    return;
                }
            }
        }

        const userId = 'user_' + Date.now();
        const avatar = selectedGender === 'male' 
            ? `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}&b=%234f46e5` 
            : `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}1&b=%23ec4899`;

        const newUser = {
            id: userId,
            name,
            email,
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
        
        showSuccess('تم إنشاء الحساب بنجاح! جاري تسجيل الدخول...');
        console.log('✅ New user created:', currentUser);
        
        // إعادة تعيين النموذج
        signupName.value = '';
        signupEmail.value = '';
        signupPassword.value = '';
        signupPasswordConfirm.value = '';
        selectedGender = null;
        btnGender.forEach(b => b.classList.remove('selected'));
        
        setTimeout(() => {
            showSpa();
            initFirebaseData();
        }, 1000);
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
                    text: "لق�� أرسلت دعوة للعب أونو! 🎮",
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
        pubId.innerText = '100' + Math.floor(100000 + Math.random() * 900000);

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
