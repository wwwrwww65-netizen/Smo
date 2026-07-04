
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const authScreen = document.getElementById('auth-screen');
const mainSpa = document.getElementById('main-spa');
const navItems = document.querySelectorAll('.nav-item');
const spaTabs = document.querySelectorAll('.spa-tab');
const btnGender = document.querySelectorAll('.btn-gender');
const btnLogin = document.getElementById('btn-login');
const authName = document.getElementById('auth-name');
const authPassword = document.getElementById('auth-password');
const headerAvatar = document.getElementById('header-avatar');
const headerGold = document.getElementById('header-gold');
const profileAvatarLarge = document.getElementById('profile-avatar-large');
const profileNameLarge = document.getElementById('profile-name-large');
const profileIdLarge = document.getElementById('profile-id-large');
const btnLogout = document.getElementById('btn-logout');
const gameCards = document.querySelectorAll('.game-card');
const iframeModal = document.getElementById('iframe-modal');
const gameIframe = document.getElementById('game-iframe');
const btnCloseIframe = document.getElementById('btn-close-iframe');

let currentUser = null;
let selectedGender = null;

function checkAuth() {
    const savedUser = localStorage.getItem('sumu_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showSpa();
        initFirebaseData();
    }
}

btnGender.forEach(btn => {
    btn.addEventListener('click', () => {
        btnGender.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGender = btn.dataset.gender;
    });
});

btnLogin.addEventListener('click', async () => {
    const name = authName.value.trim();
    const pass = authPassword.value;
    if (!name || !pass || !selectedGender) {
        alert('يرجى إدخال الاسم وكلمة المرور واختيار الجنس.');
        return;
    }
    const id = '100' + Math.floor(100000 + Math.random() * 900000);
    const avatar = selectedGender === 'male' ? `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}&b=%234f46e5` : `https://api.dicebear.com/7.x/adventurer/svg?seed=${name}1&b=%23ec4899`;
    const user = { id, name, gender: selectedGender, avatar, gold: 1000, level: 1 };
    try {
        await set(ref(db, `users/${id}`), user);
        localStorage.setItem('sumu_user', JSON.stringify(user));
        currentUser = user;
        showSpa();
        initFirebaseData();
    } catch (e) {
        alert('حدث خطأ أثناء التسجيل: ' + e.message);
    }
});

btnLogout.addEventListener('click', () => {
    localStorage.removeItem('sumu_user');
    location.reload();
});

function showSpa() {
    authScreen.classList.remove('active-screen');
    authScreen.style.display = 'none';
    mainSpa.classList.remove('hidden');
    if (currentUser) {
        headerAvatar.src = currentUser.avatar;
        headerGold.innerText = currentUser.gold || 0;
        profileAvatarLarge.src = currentUser.avatar;
        profileNameLarge.innerText = currentUser.name;
        profileIdLarge.innerText = currentUser.id;
    }
}

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

const postsFeed = document.getElementById('posts-feed');
const messagesList = document.getElementById('messages-list');

function initFirebaseData() {
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
                            <div class="chat-preview">${msg.isInvite ? '<button class="btn-primary btn-accept-invite" style="font-size:12px; padding:5px 10px; margin-top:5px;" data-game="'+msg.gameUrl+'">قبول والانضمام 🎮</button>' : msg.text}</div>
                        </div>
                        <button class="btn-game-invite" title="دعوة للعب">🎮</button>
                    </div>` + messagesList.innerHTML;
                });
            }
        }
    });

    // Render static rooms
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

// Global click delegation
document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-submit-post') {
        const newPostInput = document.getElementById('new-post-input');
        if (newPostInput && newPostInput.value.trim() && currentUser) {
            const postsRef = ref(db, 'posts');
            await push(postsRef, {
                authorName: currentUser.name,
                authorAvatar: currentUser.avatar,
                content: newPostInput.value.trim(),
                timestamp: Date.now(),
                likes: 0
            });
            newPostInput.value = '';
        }
    }

    if (e.target.id === 'btn-submit-msg') {
        const newMsgInput = document.getElementById('new-msg-input');
        if (newMsgInput && newMsgInput.value.trim() && currentUser) {
            const chatRef = ref(db, 'global_chat');
            await push(chatRef, {
                sender: currentUser.name,
                avatar: currentUser.avatar,
                text: newMsgInput.value.trim(),
                timestamp: Date.now(),
                isInvite: false
            });
            newMsgInput.value = '';
        }
    }


    if (e.target.classList.contains('btn-accept-invite')) {
        const gameUrl = e.target.dataset.game;
        if (gameUrl) {
            window.launchGame(gameUrl);
        }
    }

    if (e.target.closest('.btn-game-invite')) {
        const chatRef = ref(db, 'global_chat');
        await push(chatRef, {
            sender: currentUser.name,
            avatar: currentUser.avatar,
            text: "لقد أرسلت دعوة للعب أونو! 🎮",
            timestamp: Date.now(),
            isInvite: true,
            gameUrl: 'ono.html'
        });
        alert('تم إرسال دعوة للعب في المحادثة العامة!');
    }

    if (e.target.closest('.room-card')) {
        const roomId = e.target.closest('.room-card').dataset.room;
        if(roomId) {
            const legacyModal = document.getElementById('legacy-room-modal');
            const roomIframe = document.getElementById('room-iframe');
            roomIframe.src = 'legacy_game.html?room=' + roomId;
            legacyModal.classList.remove('hidden');
        }
    }

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

    // Public profile open logic
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

checkAuth();
