/**
 * Live Broadcast (هــَــش Fyo) Logic
 * Updated for Absolute Sync, PeerJS Voice Chat, and Professional UI
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, onDisconnect, get, serverTimestamp, remove }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfcHB-d68R2Kf-jisYudWKIjHZ9lgjUdM",
  authDomain: "smo1-5f999.firebaseapp.com",
  projectId: "smo1-5f999",
  storageBucket: "smo1-5f999.firebasestorage.app",
  messagingSenderId: "376255463194",
  appId: "1:376255463194:web:26bd4efe2d8f4c279f76a3",
  measurementId: "G-T103PXE8LF"
};

class LiveManager {
    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase(this.app);
        this.auth = getAuth(this.app);

        this.urlParams = new URLSearchParams(window.location.search);
        this.roomId = this.urlParams.get('roomID');
        this.username = this.urlParams.get('username') || 'ضيف';
        this.role = this.urlParams.get('role') || 'guest';
        this.myId = null;
        this.userAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.username}_${Math.random()}`;

        this.playlistData = {};

        // Media State (YouTube, Generic Video, Web Browser)
        this.player = null;
        this.mediaState = { type: 'none', url: '', videoId: '', state: -1, currentTime: 0, updatedAt: 0 };
        this.isSyncing = false;
        this.serverOffset = 0;
        this.isMutedByPolicy = true;
        this.guestRevertInterval = null;

        // PeerJS Voice State
        this.peer = null;
        this.myStream = null;
        this.isMicOn = false;
        this.activeCalls = {}; // peerId -> call object
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.silentStream = this.createSilentAudioStream();
        this.analysers = {}; // uid -> analyser node
        this.isPeerInitialized = false;
        this.audioPool = [];
        this.maxPoolSize = 6;
        this.sessionId = Math.random().toString(36).substring(2, 8); // Unique session ID

        this.iceConfig = {
            'iceServers': [
                { 'urls': 'stun:stun.l.google.com:19302' },
                { 'urls': 'stun:stun1.l.google.com:19302' },
                { 'urls': 'stun:stun2.l.google.com:19302' },
                {
                    'urls': 'turn:global.metered.ca:443',
                    'username': 'cc045d3456c33ca2d5c8b09d',
                    'credential': 'Ab6Gsl42QGT6sNcK'
                },
                {
                    'urls': 'turn:global.metered.ca:443?transport=tcp',
                    'username': 'cc045d3456c33ca2d5c8b09d',
                    'credential': 'Ab6Gsl42QGT6sNcK'
                }
            ]
        };

        this.initElements();
        this.initAuth();
        this.setupYouTube();
        this.calculateServerOffset();
        this.createParticles();
    }

    createParticles() {
        const bg = document.getElementById('bg-animated');
        if (!bg) return;
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 25 + 8;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            p.style.left = `${Math.random() * 100}%`;
            p.style.animationDuration = `${Math.random() * 12 + 12}s`;
            p.style.animationDelay = `${Math.random() * 10}s`;
            bg.appendChild(p);
        }
    }

    initializeAudioPool() {
        if (this.audioPool.length > 0) return;
        console.log("Initializing Audio Pool...");
        for (let i = 0; i < this.maxPoolSize; i++) {
            const audio = document.createElement('audio');
            audio.id = `audio-pool-${i}`;
            audio.autoplay = true;
            audio.playsInline = true;
            audio.style.display = 'none';
            document.body.appendChild(audio);
            this.audioPool.push(audio);

            // "Prime" the element with a user gesture
            audio.play().catch(() => {});
        }
    }

    initElements() {
        // Voice Log Element
        this.voiceLogEl = document.getElementById('voice-activity-log');

        document.addEventListener('click', () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            this.initializeAudioPool();
        }, { once: true });

        const unmuteOverlay = document.getElementById('unmute-overlay');
        const btnUnmuteTap = document.getElementById('btn-unmute-tap');
        if (unmuteOverlay) unmuteOverlay.onclick = () => this.handleUserUnmute();
        if (btnUnmuteTap) btnUnmuteTap.onclick = (e) => { e.stopPropagation(); this.handleUserUnmute(); };

        // UI Refs
        this.onlineCountEl = document.getElementById('online-count');
        this.chatLogEl = document.getElementById('chat-log');
        this.chatInput = document.getElementById('chat-input');
        this.btnSendChat = document.getElementById('btn-send-chat');
        this.seatsContainer = document.getElementById('seats-container');
        this.toastContainer = document.getElementById('toast-container');

        // Media Containers
        this.ytPlayerContainer = document.getElementById('youtube-player-container');
        this.genericVideoContainer = document.getElementById('generic-video-container');
        this.genericVideo = document.getElementById('generic-video');
        this.browserContainer = document.getElementById('browser-container');
        this.browserIframe = document.getElementById('browser-iframe');
        this.browserToolbar = document.getElementById('browser-toolbar');
        this.browserUrlInput = document.getElementById('browser-url-input');
        this.btnBrowserGo = document.getElementById('btn-browser-go');
        this.btnBrowserSync = document.getElementById('btn-browser-sync');
        this.btnBrowserBack = document.getElementById('btn-browser-back');
        this.btnBrowserFallback = document.getElementById('btn-browser-fallback');
        this.browserLoadingOverlay = document.getElementById('browser-loading-overlay');

        this.vidPlaceholder = document.getElementById('vid-placeholder');
        this.vidMiniThumb = document.getElementById('vid-mini-thumb');
        this.vidTitle = document.getElementById('vid-title');
        this.vidOwner = document.getElementById('vid-owner');
        this.vidHeaderTop = document.querySelector('.vid-header-top');
        this.mediaBrand = document.getElementById('media-brand');

        // Modals
        this.btnOpenControl = document.getElementById('btn-open-control');
        this.modalYT = document.getElementById('modal-yt-control');
        this.ytUrlInput = document.getElementById('yt-url-input');
        this.btnLoadVid = document.getElementById('btn-load-vid');
        this.btnPlayVid = document.getElementById('btn-play-vid');
        this.btnPauseVid = document.getElementById('btn-pause-vid');
        this.btnCloseModal = document.getElementById('btn-close-modal');

        // Playlist
        this.btnPlaylist = document.getElementById('btn-playlist');
        this.modalPlaylist = document.getElementById('modal-playlist');
        this.btnClosePlaylist = document.getElementById('btn-close-playlist');
        this.playlistItemsContainer = document.getElementById('playlist-items-container');
        this.btnOpenYtSearch = document.getElementById('btn-open-yt-search');

        // YouTube Browser
        this.modalYtBrowser = document.getElementById('modal-yt-browser');
        this.btnCloseYtBrowser = document.getElementById('btn-close-yt-browser');
        this.btnBackToPlaylistFromBrowser = document.getElementById('btn-back-to-playlist-from-browser');
        this.ytSearchInput = document.getElementById('yt-search-input');
        this.ytResultsGrid = document.getElementById('yt-results-grid');
        this.ytBrowserLoading = document.getElementById('yt-browser-loading');
        this.catChips = document.querySelectorAll('.cat-chip');

        this.pipedInstances = ["https://pipedapi.kavin.rocks", "https://pipedapi.leptons.xyz", "https://pipedapi.nosebs.ru", "https://api.piped.yt", "https://pipedapi.adminforge.de"];
        this.currentInstance = this.pipedInstances[Math.floor(Math.random() * this.pipedInstances.length)];

        // Mic
        this.btnToggleMic = document.getElementById('btn-toggle-mic');
        this.micOnIcon = document.getElementById('mic-on-icon');
        this.micOffIcon = document.getElementById('mic-off-icon');

        // Events
        this.btnSendChat.onclick = () => this.sendChatMessage();
        this.chatInput.onkeypress = (e) => { if (e.key === 'Enter') this.sendChatMessage(); };

        if (this.role === 'owner') {
            this.btnOpenControl.classList.remove('hidden');
            this.btnOpenControl.onclick = () => this.modalYT.classList.remove('hidden');
            this.btnOpenYtSearch.classList.remove('hidden');

            this.genericVideo.onplay = () => this.ownerOnMediaEvent(1);
            this.genericVideo.onpause = () => this.ownerOnMediaEvent(2);
            this.genericVideo.onended = () => { this.ownerOnMediaEvent(0); this.playNextInPlaylist(); };

            if (this.btnBrowserGo) {
                this.btnBrowserGo.onclick = () => {
                    const input = this.browserUrlInput.value.trim();
                    if (input) {
                        const processedUrl = this.processUrl(input);
                        this.browserUrlInput.value = processedUrl;
                        if (this.browserLoadingOverlay) this.browserLoadingOverlay.classList.remove('hidden');
                        this.browserIframe.src = processedUrl;
                        this.mediaState = { type: 'web', url: processedUrl, state: 1, updatedAt: serverTimestamp() };
                        this.ownerUpdateFirebase();
                    }
                };
            }
        }

        this.btnLoadVid.onclick = () => this.ownerLoadVideo();
        this.btnPlayVid.onclick = () => this.ownerChangeState(1);
        this.btnPauseVid.onclick = () => this.ownerChangeState(2);
        this.btnCloseModal.onclick = () => this.modalYT.classList.add('hidden');

        this.btnPlaylist.onclick = () => { this.modalPlaylist.classList.remove('hidden'); this.renderPlaylist(); };
        this.btnClosePlaylist.onclick = () => this.modalPlaylist.classList.add('hidden');
        this.btnOpenYtSearch.onclick = () => { this.modalPlaylist.classList.add('hidden'); this.modalYtBrowser.classList.remove('hidden'); this.fetchTrendingVideos(); };

        if (this.btnCloseYtBrowser) {
            this.btnCloseYtBrowser.onclick = () => this.modalYtBrowser.classList.add('hidden');
            this.btnBackToPlaylistFromBrowser.onclick = () => { this.modalYtBrowser.classList.add('hidden'); this.modalPlaylist.classList.remove('hidden'); };
            this.ytSearchInput.onkeypress = (e) => { if (e.key === 'Enter') this.searchYouTube(this.ytSearchInput.value); };
        }

        this.btnToggleMic.onclick = () => this.toggleMic();
        document.getElementById('btn-fullscreen').onclick = () => this.toggleFullscreen();

        const nameEl = document.querySelector('.user-display-name');
        if (nameEl) nameEl.textContent = this.username;
        const idEl = document.querySelector('.user-display-id');
        if (idEl) idEl.textContent = `ID: ${this.roomId}`;
        const avatarEl = document.querySelector('.profile-square');
        if (avatarEl) avatarEl.src = this.userAvatar;
    }

    logVoiceActivity(msg) {
        if (!this.voiceLogEl) return;
        const entry = document.createElement('div');
        entry.className = 'voice-log-entry';
        entry.textContent = `🎤 ${msg}`;
        this.voiceLogEl.prepend(entry);
        setTimeout(() => entry.remove(), 5000);
    }

    // ================== CORE / AUTH ==================

    async initAuth() {
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.myId = user.uid;
                this.joinRoom();
            } else {
                signInAnonymously(this.auth);
            }
        });
    }

    async calculateServerOffset() {
        const offsetRef = ref(this.db, ".info/serverTimeOffset");
        onValue(offsetRef, (snap) => { this.serverOffset = snap.val() || 0; });
    }

    processUrl(input) {
        let url = input.trim();
        if (!url) return '';
        if (url.includes('google.com/search') && url.includes('igu=1')) return url;
        const isLikelyUrl = url.startsWith('http') || (url.includes('.') && !url.includes(' '));
        if (isLikelyUrl) {
            if (url.startsWith('http://')) url = url.replace('http://', 'https://');
            else if (!url.startsWith('https://')) url = 'https://' + url;
            if (url.includes('google.com')) {
                if (url.includes('/search')) { if (!url.includes('igu=1')) url += (url.includes('?') ? '&' : '?') + 'igu=1'; }
                else url = `https://www.google.com/search?q=&igu=1`;
            }
        } else url = `https://www.google.com/search?q=${encodeURIComponent(url)}&igu=1`;
        return url;
    }

    async joinRoom() {
        if (!this.roomId) return;
        const userRef = ref(this.db, `rooms/${this.roomId}/users/${this.myId}`);
        onDisconnect(userRef).remove();
        await update(userRef, { name: this.username, avatar: this.userAvatar, isOnline: true, lastSeen: serverTimestamp() });
        this.listenToRoom();
        this.initPeer();
    }

    listenToRoom() {
        const roomRef = ref(this.db, `rooms/${this.roomId}`);
        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;
            if (data.users) this.onlineCountEl.textContent = Object.keys(data.users).length;
            if (data.messages) this.updateChatUI(data.messages);
            this.updateSeatsUI(data.seats || {});
            if (data.youtube_state) this.syncMedia(data.youtube_state);
            if (data.voice_peers) {
                Object.entries(data.voice_peers).forEach(([id, p]) => { this.updateSpeakingUI(id, p.isSpeaking || false); });
            }
            this.playlistData = data.playlist || {};
            this.renderPlaylist();
        });
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'glass-toast';
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // ================== YOUTUBE SYNC ==================

    setupYouTube() {
        if (window.YT && window.YT.Player) this.initPlayer();
        else window.onYouTubeIframeAPIReady = () => this.initPlayer();
    }

    initPlayer() {
        this.player = new YT.Player('player', {
            height: '100%', width: '100%',
            playerVars: { 'autoplay': 1, 'controls': 1, 'rel': 0, 'playsinline': 1 },
            events: { 'onReady': () => this.onPlayerReady(), 'onStateChange': (e) => this.onPlayerStateChange(e) }
        });
        if (this.role !== 'owner') this.guestRevertInterval = setInterval(() => this.guestEnforceSync(), 2000);
    }

    onPlayerReady() { if (this.mediaState.type === 'youtube' && this.mediaState.videoId) this.syncYouTube(this.mediaState); }

    onPlayerStateChange(event) {
        if (this.isSyncing || this.mediaState.type !== 'youtube') return;
        if (this.role === 'owner') { this.mediaState.state = event.data; this.ownerUpdateFirebase(); if (event.data === 0) this.playNextInPlaylist(); }
        else {
            const ts = this.mediaState.state;
            if (event.data !== ts && ts !== -1) {
                if (ts === 1 && event.data !== 1) this.player.playVideo();
                else if (ts === 2 && event.data !== 2) this.player.pauseVideo();
            }
        }
    }

    guestEnforceSync() {
        if (this.role === 'owner' || this.mediaState.state === -1) return;
        const now = Date.now() + this.serverOffset;
        let targetTime = this.mediaState.currentTime;
        if (this.mediaState.state === 1 && this.mediaState.updatedAt) targetTime += (now - this.mediaState.updatedAt) / 1000;
        let localTime = 0;
        if (this.mediaState.type === 'youtube' && this.player && this.player.getCurrentTime) localTime = this.player.getCurrentTime();
        else if (this.mediaState.type === 'video' && this.genericVideo) localTime = this.genericVideo.currentTime;
        if (Math.abs(localTime - targetTime) > 8) { if (this.mediaState.type === 'youtube') this.player.seekTo(targetTime, true); else this.genericVideo.currentTime = targetTime; }
    }

    syncMedia(state) {
        if (!state) return;
        this.mediaState = state;
        const type = state.type || 'youtube';
        this.ytPlayerContainer.classList.add('hidden');
        this.genericVideoContainer.classList.add('hidden');
        this.browserContainer.classList.add('hidden');
        this.vidPlaceholder.classList.add('hidden');
        this.mediaBrand.innerHTML = '';
        if (!state.url && !state.videoId) { this.vidPlaceholder.classList.remove('hidden'); return; }
        if (type === 'youtube') { this.ytPlayerContainer.classList.remove('hidden'); this.syncYouTube(state); }
        else if (type === 'video') { this.genericVideoContainer.classList.remove('hidden'); this.syncGenericVideo(state); }
        else if (type === 'web') { this.browserContainer.classList.remove('hidden'); if (this.role === 'owner') this.browserToolbar.classList.remove('hidden'); this.syncBrowser(state); }
    }

    syncYouTube(state) {
        if (!this.player || !this.player.loadVideoById) return;
        const now = Date.now() + this.serverOffset;
        let targetTime = state.currentTime;
        if (state.state === 1 && state.updatedAt) targetTime += (now - state.updatedAt) / 1000;
        if (state.videoId !== this._lastYtId) {
            this._lastYtId = state.videoId;
            this.player.loadVideoById({ videoId: state.videoId, startSeconds: targetTime });
            if (this.isMutedByPolicy) this.player.mute();
            this.vidTitle.textContent = "جاري التحميل...";
        }
        if (Math.abs(this.player.getCurrentTime() - targetTime) > 3) this.player.seekTo(targetTime, true);
        const cur = this.player.getPlayerState();
        if (state.state === 1 && cur !== 1) this.player.playVideo();
        if (state.state === 2 && cur !== 2) this.player.pauseVideo();
    }

    syncGenericVideo(state) {
        if (!this.genericVideo) return;
        if (this._lastVideoUrl !== state.url) { this._lastVideoUrl = state.url; this.genericVideo.src = state.url; }
        const now = Date.now() + this.serverOffset;
        let targetTime = state.currentTime;
        if (state.state === 1 && state.updatedAt) targetTime += (now - state.updatedAt) / 1000;
        if (Math.abs(this.genericVideo.currentTime - targetTime) > 3) this.genericVideo.currentTime = targetTime;
        if (state.state === 1 && this.genericVideo.paused) this.genericVideo.play().catch(() => {});
        if (state.state === 2 && !this.genericVideo.paused) this.genericVideo.pause();
    }

    syncBrowser(state) {
        if (!this.browserIframe) return;
        if (this.browserIframe.getAttribute('src') !== state.url) { this.browserIframe.src = state.url; this.vidTitle.textContent = "تصفح ويب"; }
    }

    handleUserUnmute() {
        this.isMutedByPolicy = false;
        if (this.unmuteOverlay) { this.unmuteOverlay.remove(); this.unmuteOverlay = null; }
        if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume();
        this.initializeAudioPool();
        if (this.player && this.player.unMute) this.player.unMute();
        if (this.genericVideo) { this.genericVideo.muted = false; if (this.mediaState.state === 1) this.genericVideo.play().catch(() => {}); }
        document.querySelectorAll('audio').forEach(a => a.play().catch(() => {}));
    }

    // ================== SEARCH ==================

    async fetchTrendingVideos() {
        this.ytResultsGrid.innerHTML = '';
        this.ytBrowserLoading.classList.remove('hidden');
        try {
            const res = await fetch(`${this.currentInstance}/trending?region=SA`);
            const data = await res.json();
            this.renderYtResults(data);
        } catch (e) { console.error(e); } finally { this.ytBrowserLoading.classList.add('hidden'); }
    }

    async searchYouTube(q) {
        if (!q) return;
        this.ytResultsGrid.innerHTML = '';
        this.ytBrowserLoading.classList.remove('hidden');
        try {
            const res = await fetch(`${this.currentInstance}/search?q=${encodeURIComponent(q)}&filter=videos`);
            const data = await res.json();
            this.renderYtResults(data.items || data);
        } catch (e) { console.error(e); } finally { this.ytBrowserLoading.classList.add('hidden'); }
    }

    renderYtResults(videos) {
        this.ytResultsGrid.innerHTML = '';
        if (!Array.isArray(videos)) return;
        videos.forEach(v => {
            const vid = v.videoId || (v.url ? v.url.split('v=')[1] : null);
            if (!vid) return;
            const card = document.createElement('div');
            card.className = 'yt-card';
            card.innerHTML = `<img class="yt-card-thumb" src="${v.thumbnail || `https://img.youtube.com/vi/${vid}/mqdefault.jpg`}">
                <div class="yt-card-info"><div class="yt-card-title">${v.title}</div></div>`;
            card.onclick = () => { this.playFromPlaylist({ videoId: vid, title: v.title }); this.modalYtBrowser.classList.add('hidden'); };
            this.ytResultsGrid.appendChild(card);
        });
    }

    renderPlaylist() {
        if (!this.playlistItemsContainer) return;
        this.playlistItemsContainer.innerHTML = '';
        Object.entries(this.playlistData).sort((a,b) => a[1].timestamp - b[1].timestamp).forEach(([k, item]) => {
            const div = document.createElement('div');
            div.className = 'playlist-item';
            div.innerHTML = `<span>${item.title}</span>`;
            div.onclick = () => { if (this.role === 'owner') this.playFromPlaylist(item); };
            this.playlistItemsContainer.appendChild(div);
        });
    }

    playFromPlaylist(item) {
        this.mediaState = { type: 'youtube', url: `https://youtube.com/watch?v=${item.videoId}`, videoId: item.videoId, state: 1, currentTime: 0, updatedAt: serverTimestamp() };
        this.ownerUpdateFirebase(0);
    }

    // ================== OWNER ==================

    ownerLoadVideo() {
        const input = this.ytUrlInput.value.trim();
        if (!input) return;
        let type = 'youtube', videoId = '', url = input;
        const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
        if (match && match[2].length === 11) videoId = match[2];
        else type = 'video';
        this.mediaState = { type, url, videoId, state: 1, currentTime: 0, updatedAt: serverTimestamp() };
        this.ownerUpdateFirebase();
        this.modalYT.classList.add('hidden');
    }

    ownerUpdateFirebase(forcedTime = null) {
        if (!this.roomId || this.isSyncing) return;
        this.isSyncing = true;
        let time = forcedTime;
        if (time === null) {
            if (this.mediaState.type === 'youtube' && this.player) time = this.player.getCurrentTime();
            else if (this.mediaState.type === 'video') time = this.genericVideo.currentTime;
            else time = 0;
        }
        update(ref(this.db, `rooms/${this.roomId}/youtube_state`), { ...this.mediaState, currentTime: time, updatedAt: serverTimestamp() }).then(() => { setTimeout(() => this.isSyncing = false, 800); });
    }

    ownerChangeState(s) {
        if (this.mediaState.type === 'youtube' && this.player) { if (s === 1) this.player.playVideo(); else this.player.pauseVideo(); }
        this.mediaState.state = s;
        this.ownerUpdateFirebase();
    }

    toggleFullscreen() {
        const c = document.getElementById('main-video-container');
        if (!document.fullscreenElement) c.requestFullscreen().catch(() => {});
        else document.exitFullscreen();
    }

    // ================== PEERJS ==================

    initPeer() {
        if (this.peer || !this.myId) return;
        this.peer = new Peer(this.myId + "_" + this.sessionId, { config: this.iceConfig, debug: 1 });
        this.peer.on('open', (id) => { this.registerVoicePeer(); this.setupPeerListeners(); this.listenToVoicePeers(); });
        this.peer.on('error', (err) => console.error(err));
    }

    createSilentAudioStream() {
        const osc = this.audioContext.createOscillator();
        const dst = osc.connect(this.audioContext.createMediaStreamDestination());
        osc.start();
        const t = dst.stream.getAudioTracks()[0];
        t.enabled = false;
        return new MediaStream([t]);
    }

    async registerVoicePeer() {
        const refV = ref(this.db, `rooms/${this.roomId}/voice_peers/${this.peer.id}`);
        onDisconnect(refV).remove();
        await set(refV, { uid: this.myId, peerId: this.peer.id, name: this.username, active: true, updatedAt: serverTimestamp() });
    }

    setupPeerListeners() {
        this.peer.on('call', (call) => {
            this.logVoiceActivity(`اتصال وارد من ${call.peer.split('_')[0]}...`);
            call.answer(this.myStream || this.silentStream);
            this.handleCallStream(call);
        });
    }

    handleCallStream(call) {
        this.activeCalls[call.peer] = call;
        call.on('stream', (remoteStream) => {
            this.logVoiceActivity(`تم استلام صوت ${call.peer.split('_')[0]} ✅`);
            let audio = this.audioPool.find(el => el.getAttribute('data-peer-id') === call.peer);
            if (!audio) {
                audio = this.audioPool.find(el => !el.srcObject);
                if (audio) audio.setAttribute('data-peer-id', call.peer);
            }
            if (audio) {
                audio.srcObject = remoteStream;
                if (this.audioContext.state === 'suspended') this.audioContext.resume();
                const tryP = () => audio.play().then(() => this.logVoiceActivity(`خروج صوت ${call.peer.split('_')[0]} مكبر الصوت 🔊`)).catch(() => {});
                tryP();
                setTimeout(tryP, 1000);
            }
            this.startVolumeDetection(remoteStream, call.peer);
        });
    }

    async toggleMic() {
        if (this.audioContext.state === 'suspended') await this.audioContext.resume();
        try {
            if (!this.myStream) {
                this.myStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.isMicOn = true;
                Object.values(this.activeCalls).forEach(call => {
                    const s = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (s) s.replaceTrack(this.myStream.getAudioTracks()[0]);
                });
                this.micOnIcon.classList.remove('hidden');
                this.micOffIcon.classList.add('hidden');
                this.startVolumeDetection(this.myStream, this.myId);
            } else {
                this.isMicOn = !this.isMicOn;
                this.myStream.getAudioTracks().forEach(t => t.enabled = this.isMicOn);
                if (this.isMicOn) { this.micOnIcon.classList.remove('hidden'); this.micOffIcon.classList.add('hidden'); }
                else { this.micOnIcon.classList.add('hidden'); this.micOffIcon.classList.remove('hidden'); this.updateSpeakingUI(this.myId, false); this.updateSpeakingInFirebase(false); }
            }
        } catch (err) { this.showToast("فشل تفعيل المايك"); }
    }

    listenToVoicePeers() {
        onValue(ref(this.db, `rooms/${this.roomId}/voice_peers`), (snap) => {
            const peers = snap.val() || {};
            Object.entries(peers).forEach(([pid, d]) => {
                if (pid !== this.peer.id && !this.activeCalls[pid] && this.peer.id < pid) {
                    this.logVoiceActivity(`جاري ربط الصوت مع ${pid.split('_')[0]}...`);
                    const call = this.peer.call(pid, this.myStream || this.silentStream);
                    if (call) this.handleCallStream(call);
                }
            });
        });
    }

    startVolumeDetection(stream, uid) {
        try {
            const src = this.audioContext.createMediaStreamSource(stream);
            const ana = this.audioContext.createAnalyser();
            ana.fftSize = 256;
            src.connect(ana);
            const data = new Uint8Array(ana.frequencyBinCount);
            const check = () => {
                ana.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const isS = sum / data.length > 15;
                if (uid === this.myId) this.updateSpeakingInFirebase(isS);
                else this.updateSpeakingUI(uid, isS);
                requestAnimationFrame(check);
            };
            check();
        } catch (e) {}
    }

    updateSpeakingInFirebase(isS) {
        if (this._lastSpeakingState === isS) return;
        this._lastSpeakingState = isS;
        update(ref(this.db, `rooms/${this.roomId}/voice_peers/${this.peer.id}`), { isSpeaking: isS });
    }

    updateSpeakingUI(id, isS) {
        const uid = id.includes('_') ? id.split('_')[0] : id;
        document.querySelectorAll('.avatar-circle-frame').forEach(f => {
            if (f.dataset.uid === String(uid)) {
                if (isS) f.classList.add('speaking'); else f.classList.remove('speaking');
            }
        });
    }

    // ================== SEATS ==================

    updateSeatsUI(seats) {
        for (let i = 1; i <= 6; i++) {
            const s = (seats || {})[i] || { status: 'empty' };
            let box = document.querySelector(`.seat-box[data-index="${i}"]`);
            if (!box) { box = document.createElement('div'); box.className = 'seat-box'; box.dataset.index = i; this.seatsContainer.appendChild(box); }
            if (box.dataset.status !== s.status || box.dataset.userId !== (s.userId || '')) {
                box.dataset.status = s.status; box.dataset.userId = s.userId || '';
                if (s.status === 'occupied') box.innerHTML = `<div class="avatar-circle-frame" data-uid="${s.userId}"><img src="${s.avatar}"></div><span class="seat-label-num">${s.name}</span>`;
                else box.innerHTML = `<div class="avatar-circle-frame seat-empty" onclick="window.liveManager.joinSeat(${i})">+</div><span class="seat-label-num">${i}</span>`;
            }
        }
    }

    async joinSeat(i) {
        const sRef = ref(this.db, `rooms/${this.roomId}/seats/${i}`);
        const snap = await get(sRef);
        if (snap.exists() && snap.val().status !== 'empty') return;
        await set(sRef, { status: 'occupied', userId: this.myId, name: this.username, avatar: this.userAvatar });
        onDisconnect(sRef).set({ status: 'empty' });
    }

    // ================== CHAT ==================

    async sendChatMessage() {
        const t = this.chatInput.value.trim();
        if (!t) return;
        await push(ref(this.db, `rooms/${this.roomId}/messages`), { userId: this.myId, userName: this.username, avatar: this.userAvatar, text: t, timestamp: serverTimestamp() });
        this.chatInput.value = '';
    }

    updateChatUI(msgs) {
        this.chatLogEl.innerHTML = '';
        Object.values(msgs).sort((a,b) => a.timestamp - b.timestamp).forEach(m => {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.innerHTML = `<img class="chat-avatar" src="${m.avatar}"><div class="chat-body"><span class="chat-user-name">${m.userName}</span><div class="chat-bubble-new">${m.text}</div></div>`;
            this.chatLogEl.appendChild(div);
        });
        this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
    }
}

window.addEventListener('DOMContentLoaded', () => { window.liveManager = new LiveManager(); });
