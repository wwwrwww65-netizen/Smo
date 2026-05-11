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
        this.audioContext = null; // Will initialize on first click
        this.silentStream = null; // Will initialize after context
        this.analysers = {}; // uid -> analyser node
        this.isPeerInitialized = false;
        this.audioPool = [];
        this.maxPoolSize = 6;
        this.sessionId = Math.random().toString(36).substring(2, 8); // Unique session ID
        this._isSpeakingLogActive = {}; // To prevent log flooding
        this._lastSpeakingState = false;

        this.iceConfig = {
            'iceServers': [
                { 'urls': 'stun:stun.l.google.com:19302' },
                { 'urls': 'stun:stun1.l.google.com:19302' },
                { 'urls': 'stun:stun.metered.ca:19302' },
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
            ],
            'iceCandidatePoolSize': 10
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
            audio.play().catch(() => {
                // Expected to fail if no src, but it registers the intent
            });
        }
    }

    initElements() {
        // Robust Audio Activation
        const resumeAudio = async () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.silentStream = this.createSilentAudioStream();
                console.log("%c[AUDIO-ENGINE] تم إنشاء محرك الصوت بنجاح.", "color: #00ff00;");
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log("%c[AUDIO-ENGINE] تم تنشيط محرك الصوت (Resumed).", "color: #00ff00;");
            }
            this.initializeAudioPool();
        };

        document.addEventListener('click', resumeAudio, { once: false });
        document.addEventListener('touchstart', resumeAudio, { once: false });

        // Unmute logic - connect to button/overlay
        const unmuteOverlay = document.getElementById('unmute-overlay');
        const btnUnmuteTap = document.getElementById('btn-unmute-tap');
        if (unmuteOverlay) {
            unmuteOverlay.onclick = () => this.handleUserUnmute();
        }
        if (btnUnmuteTap) {
            btnUnmuteTap.onclick = (e) => {
                e.stopPropagation();
                this.handleUserUnmute();
            };
        }

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
        this.unmuteOverlay = document.getElementById('unmute-overlay');
        this.btnUnmuteTap = document.getElementById('btn-unmute-tap');
        this.vidMiniThumb = document.getElementById('vid-mini-thumb');
        this.vidTitle = document.getElementById('vid-title');
        this.vidOwner = document.getElementById('vid-owner');
        this.vidHeaderTop = document.querySelector('.vid-header-top');
        this.vidFooterRow = document.querySelector('.vid-footer-row');
        this.mediaBrand = document.getElementById('media-brand');

        // Modals & Controls
        this.btnOpenControl = document.getElementById('btn-open-control');
        this.modalYT = document.getElementById('modal-yt-control');
        this.ytUrlInput = document.getElementById('yt-url-input');
        this.btnLoadVid = document.getElementById('btn-load-vid');
        this.btnPlayVid = document.getElementById('btn-play-vid');
        this.btnPauseVid = document.getElementById('btn-pause-vid');
        this.btnCloseModal = document.getElementById('btn-close-modal');

        // Playlist & Search
        this.btnPlaylist = document.getElementById('btn-playlist');
        this.modalPlaylist = document.getElementById('modal-playlist');
        this.btnClosePlaylist = document.getElementById('btn-close-playlist');
        this.playlistItemsContainer = document.getElementById('playlist-items-container');
        this.btnOpenYtSearch = document.getElementById('btn-open-yt-search');

        // YouTube Browser Elements (TopTop Style)
        this.modalYtBrowser = document.getElementById('modal-yt-browser');
        this.btnCloseYtBrowser = document.getElementById('btn-close-yt-browser');
        this.btnBackToPlaylistFromBrowser = document.getElementById('btn-back-to-playlist-from-browser');
        this.ytSearchInput = document.getElementById('yt-search-input');
        this.ytResultsGrid = document.getElementById('yt-results-grid');
        this.ytBrowserLoading = document.getElementById('yt-browser-loading');
        this.catChips = document.querySelectorAll('.cat-chip');

        // Voice Log Element
        this.voiceLogEl = document.getElementById('voice-activity-log');

        this.pipedInstances = [
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.leptons.xyz",
            "https://pipedapi.nosebs.ru",
            "https://pipedapi-libre.kavin.rocks",
            "https://piped-api.privacy.com.de",
            "https://pipedapi.adminforge.de",
            "https://api.piped.yt",
            "https://pipedapi.drgns.space",
            "https://pipedapi.owo.si",
            "https://pipedapi.ducks.party",
            "https://piped-api.codespace.cz",
            "https://pipedapi.reallyaweso.me",
            "https://api.piped.private.coffee",
            "https://pipedapi.darkness.services",
            "https://pipedapi.orangenet.cc"
        ];
        // Randomly pick an instance to start with to distribute load
        this.currentInstance = this.pipedInstances[Math.floor(Math.random() * this.pipedInstances.length)];

        // Media Type Selectors
        this.btnTypeAuto = document.getElementById('type-auto');
        this.btnTypeYT = document.getElementById('type-yt');
        this.btnTypeVideo = document.getElementById('type-video');
        this.btnTypeWeb = document.getElementById('type-web');
        this.selectedType = 'auto';

        if (this.btnTypeAuto) {
            const types = [this.btnTypeAuto, this.btnTypeYT, this.btnTypeVideo, this.btnTypeWeb];
            types.forEach(btn => {
                if(!btn) return;
                btn.onclick = () => {
                    types.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.selectedType = btn.id.replace('type-', '');
                };
            });
        }

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

            // Generic Video Events for Owner
            this.genericVideo.onplay = () => this.ownerOnMediaEvent(1);
            this.genericVideo.onpause = () => this.ownerOnMediaEvent(2);
            this.genericVideo.onseeked = () => this.ownerOnMediaEvent();
            this.genericVideo.onended = () => {
                this.ownerOnMediaEvent(0);
                this.playNextInPlaylist();
            };
            this.genericVideo.onerror = () => {
                if (this.genericVideo.src && !this.genericVideo.src.includes(window.location.host)) {
                    this.showToast("⚠️ تعذر تشغيل هذا الرابط، قد يكون محمي أو غير مدعوم");
                }
            };

            // Browser events for owner
            if (this.btnBrowserGo) {
                this.btnBrowserGo.onclick = () => {
                    const input = this.browserUrlInput.value.trim();
                    if (input) {
                        const processedUrl = this.processUrl(input);
                        this.browserUrlInput.value = processedUrl;

                        // Show loading
                        if (this.browserLoadingOverlay) this.browserLoadingOverlay.classList.remove('hidden');
                        this.browserIframe.src = processedUrl;

                        // Auto-sync for owner
                        this.mediaState = {
                            type: 'web',
                            url: processedUrl,
                            state: 1,
                            updatedAt: serverTimestamp()
                        };
                        this.ownerUpdateFirebase();
                    }
                };
            }
            if (this.browserUrlInput) {
                this.browserUrlInput.onkeypress = (e) => { if (e.key === 'Enter') this.btnBrowserGo.click(); };
            }
            if (this.btnBrowserSync) {
                this.btnBrowserSync.onclick = () => {
                    const currentUrl = this.browserIframe.src;
                    if (!currentUrl || currentUrl === window.location.href) return;

                    this.mediaState = {
                        type: 'web',
                        url: currentUrl,
                        state: 1,
                        updatedAt: serverTimestamp()
                    };
                    this.ownerUpdateFirebase();
                    this.showToast("تم مزامنة الموقع مع الجميع");
                };
            }
            if (this.btnBrowserBack) {
                this.btnBrowserBack.onclick = () => {
                    try {
                        this.browserIframe.contentWindow.history.back();
                    } catch(e) {
                        this.showToast("لا يمكن الرجوع للمواقع الخارجية أمنياً");
                    }
                };
            }
        }

        if (this.btnBrowserFallback) {
            this.btnBrowserFallback.onclick = () => {
                if (this.browserIframe.src) {
                    window.open(this.browserIframe.src, '_blank');
                }
            };
        }

        if (this.browserIframe) {
            this.browserIframe.onload = () => {
                if (this.browserLoadingOverlay) {
                    this.browserLoadingOverlay.classList.add('hidden');
                }
            };
        }

        this.btnLoadVid.onclick = () => this.ownerLoadVideo();
        if (this.ytUrlInput) {
            this.ytUrlInput.onkeypress = (e) => { if (e.key === 'Enter') this.ownerLoadVideo(); };
        }
        this.btnPlayVid.onclick = () => this.ownerChangeState(1);
        this.btnPauseVid.onclick = () => this.ownerChangeState(2);
        this.btnCloseModal.onclick = () => this.modalYT.classList.add('hidden');

        // Playlist Events
        this.btnPlaylist.onclick = () => {
            this.modalPlaylist.classList.remove('hidden');
            this.renderPlaylist();
        };
        this.btnClosePlaylist.onclick = () => this.modalPlaylist.classList.add('hidden');
        this.btnOpenYtSearch.onclick = () => {
            this.modalPlaylist.classList.add('hidden');
            this.modalYtBrowser.classList.remove('hidden');
            this.fetchTrendingVideos();
        };

        // YouTube Browser Events
        if (this.btnCloseYtBrowser) {
            this.btnCloseYtBrowser.onclick = () => this.modalYtBrowser.classList.add('hidden');
            this.btnBackToPlaylistFromBrowser.onclick = () => {
                this.modalYtBrowser.classList.add('hidden');
                this.modalPlaylist.classList.remove('hidden');
            };

            this.ytSearchInput.onkeypress = (e) => {
                if (e.key === 'Enter') this.searchYouTube(this.ytSearchInput.value);
            };

            this.catChips.forEach(chip => {
                chip.onclick = () => {
                    this.catChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    const cat = chip.dataset.cat;
                    if (cat === 'trending') this.fetchTrendingVideos();
                    else if (cat === 'live') this.searchYouTube("بث مباشر");
                    else this.fetchCategoryVideos(cat, chip.textContent);
                };
            });

            const searchIcon = this.ytSearchInput.parentElement.querySelector('svg');
            if (searchIcon) {
                searchIcon.style.cursor = 'pointer';
                searchIcon.onclick = () => this.searchYouTube(this.ytSearchInput.value);
            }
        }

        this.btnUnmuteTap.onclick = () => this.handleUserUnmute();
        this.btnToggleMic.onclick = () => this.toggleMic();

        document.getElementById('btn-fullscreen').onclick = () => this.toggleFullscreen();

        // Profile UI
        const nameEl = document.querySelector('.user-display-name');
        if (nameEl) nameEl.textContent = this.username;

        const idEl = document.querySelector('.user-display-id');
        if (idEl) idEl.textContent = `ID: ${this.roomId}`;

        const avatarEl = document.querySelector('.profile-square');
        if (avatarEl) avatarEl.src = this.userAvatar;
    }

    logVoiceActivity(msg, type = 'info') {
        if (!this.voiceLogEl) return;
        const entry = document.createElement('div');
        entry.className = 'voice-log-entry';
        if (type === 'success') entry.style.borderRightColor = '#2ecc71';
        if (type === 'error') entry.style.borderRightColor = '#e74c3c';
        if (type === 'warn') entry.style.borderRightColor = '#f1c40f';
        
        entry.textContent = `${type === 'error' ? '❌' : '🎤'} ${msg}`;
        this.voiceLogEl.prepend(entry);
        setTimeout(() => entry.remove(), 6000);
    }

    // ================== CORE / AUTH ==================

    async initAuth() {
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                console.log("Firebase Auth: Logged in as", user.uid);
                this.myId = user.uid;
                this.joinRoom();
            } else {
                console.log("Firebase Auth: Attempting anonymous login...");
                signInAnonymously(this.auth).catch((err) => {
                    console.error("Firebase Auth Error:", err);
                });
            }
        });
    }

    async calculateServerOffset() {
        const offsetRef = ref(this.db, ".info/serverTimeOffset");
        onValue(offsetRef, (snap) => {
            this.serverOffset = snap.val() || 0;
        });
    }

    processUrl(input) {
        let url = input.trim();
        if (!url) return '';

        // If it's already a processed Google search with igu=1, don't re-process
        if (url.includes('google.com/search') && url.includes('igu=1')) return url;

        // 1. Correct common typos in domains
        url = url.replace(/\.(con|comn|comm)$/i, '.com');
        url = url.replace(/\.(ne|netn)$/i, '.net');
        url = url.replace(/\.(or|orgn)$/i, '.org');

        // 2. Check if it's a URL or a search query
        const urlPattern = /^(https?:\/\/)?(([\da-z\.-]+)\.([a-z]{2,24})|localhost)(:\d+)?([\/\w \.?=&%#\+-]*)*\/?$/i;
        const isLikelyUrl = url.startsWith('http') || (url.includes('.') && !url.includes(' '));

        if (isLikelyUrl) {
            // Force HTTPS for GitHub Pages compatibility
            if (url.startsWith('http://')) {
                url = url.replace('http://', 'https://');
            } else if (!url.startsWith('https://')) {
                url = 'https://' + url;
            }

            // Special handling for Google to allow iframe embedding (using 'igu=1')
            if (url.includes('google.com')) {
                if (url.includes('/search')) {
                    if (!url.includes('igu=1')) {
                        url += (url.includes('?') ? '&' : '?') + 'igu=1';
                    }
                } else {
                    // Check if it's a direct google search query in the URL
                    let query = "";
                    try {
                        const tempUrl = new URL(url);
                        query = tempUrl.searchParams.get('q') || "";
                    } catch(e) {}
                    url = `https://www.google.com/search?q=${encodeURIComponent(query)}&igu=1`;
                }
            }

            // Handle YouTube links in browser mode - convert to embed if possible
            if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
                const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
                const match = url.match(ytRegExp);
                if (match && match[2].length === 11) {
                    url = `https://www.youtube.com/embed/${match[2]}?autoplay=1`;
                }
            }
        } else {
            // It's a search query, convert to Google Search
            url = `https://www.google.com/search?q=${encodeURIComponent(url)}&igu=1`;
        }

        return url;
    }

    ensureAbsoluteUrl(url) {
        return this.processUrl(url);
    }

    async joinRoom() {
        if (!this.roomId) return;
        const userRef = ref(this.db, `rooms/${this.roomId}/users/${this.myId}`);
        onDisconnect(userRef).remove();
        await update(userRef, {
            name: this.username,
            avatar: this.userAvatar,
            isOnline: true,
            lastSeen: serverTimestamp()
        });
        this.listenToRoom();

        // Initialize Peer immediately on room entry, but don't request media yet
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

            // Sync Speaking Indicators from voice_peers
            if (data.voice_peers) {
                Object.entries(data.voice_peers).forEach(([id, p]) => {
                    this.updateSpeakingUI(id, p.isSpeaking || false);
                });
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
        if (window.YT && window.YT.Player) {
            this.initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = () => this.initPlayer();
        }
    }

    initPlayer() {
        this.player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            playerVars: {
                'autoplay': 1,
                'controls': 1, // Explicitly ensure controls are on
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'playsinline': 1,
                'disablekb': 0
            },
            events: {
                'onReady': () => this.onPlayerReady(),
                'onStateChange': (e) => this.onPlayerStateChange(e)
            }
        });

        if (this.role !== 'owner') {
            this.guestRevertInterval = setInterval(() => this.guestEnforceSync(), 2000);
        }
    }

    onPlayerReady() {
        if (this.mediaState.type === 'youtube' && this.mediaState.videoId) {
            this.syncYouTube(this.mediaState);
        }
    }

    onPlayerStateChange(event) {
        if (this.isSyncing || this.mediaState.type !== 'youtube') return;

        if (this.role === 'owner') {
            this.mediaState.state = event.data;
            this.ownerUpdateFirebase();

            // Auto-play next in playlist if video ended (state 0)
            if (event.data === 0) {
                this.playNextInPlaylist();
            }
        } else {
            const targetState = this.mediaState.state;
            if (event.data !== targetState && targetState !== -1) {
                if (event.data === 3) return;
                if (targetState === 1 && event.data !== 1) this.player.playVideo();
                else if (targetState === 2 && event.data !== 2) this.player.pauseVideo();
            }
        }
    }

    guestEnforceSync() {
        if (this.role === 'owner' || this.mediaState.state === -1) return;

        const now = Date.now() + this.serverOffset;
        let targetTime = this.mediaState.currentTime;
        if (this.mediaState.state === 1 && this.mediaState.updatedAt) {
            targetTime += (now - this.mediaState.updatedAt) / 1000;
        }

        let currentLocalTime = 0;
        if (this.mediaState.type === 'youtube' && this.player && this.player.getCurrentTime) {
            currentLocalTime = this.player.getCurrentTime();
        } else if (this.mediaState.type === 'video' && this.genericVideo) {
            currentLocalTime = this.genericVideo.currentTime;
        } else {
            return;
        }

        const diff = Math.abs(currentLocalTime - targetTime);
        if (diff > 8) {
            this.showToast("مزامنة مع المالك...");
            if (this.mediaState.type === 'youtube') this.player.seekTo(targetTime, true);
            else this.genericVideo.currentTime = targetTime;
        }
    }

    syncMedia(state) {
        if (!state) return;
        const type = state.type || 'youtube';
        this.mediaState = state;

        // Hide all first
        this.ytPlayerContainer.classList.add('hidden');
        this.genericVideoContainer.classList.add('hidden');
        this.browserContainer.classList.add('hidden');
        this.vidPlaceholder.classList.add('hidden');
        this.mediaBrand.innerHTML = ''; // Clear brand area

        if (!state.url && !state.videoId) {
            this.vidPlaceholder.classList.remove('hidden');
            if (this.player && this.player.stopVideo) this.player.stopVideo();
            if (this.genericVideo) this.genericVideo.pause();
            return;
        }

        if (type === 'youtube') {
            this.ytPlayerContainer.classList.remove('hidden');
            this.mediaBrand.innerHTML = `
                <div style="display: flex; align-items: center; gap: 5px;">
                    <svg width="28" height="20" viewBox="0 0 28 20" fill="red"><path d="M27.3 3.3c-0.3-1.2-1.3-2.2-2.5-2.5C22.6 0.4 14 0.4 14 0.4s-8.6 0-10.8 0.4C2 1.1 1 2.1 0.7 3.3 0.3 5.5 0.3 10 0.3 10s0 4.5 0.4 6.7c0.3 1.2 1.3 2.2 2.5 2.5 2.2 0.4 10.8 0.4 10.8 0.4s8.6 0 10.8-0.4c1.2-0.3 2.2-1.3 2.5-2.5 0.4-2.2 0.4-6.7 0.4-6.7s0-4.5-0.4-6.7z"/><polygon fill="white" points="11.2 14.3 18.2 10 11.2 5.7"/></svg>
                    <span style="color: white; font-weight: bold; font-family: Arial; font-size: 16px;">YouTube</span>
                </div>`;
            this.syncYouTube(state);
        } else if (type === 'video') {
            this.genericVideoContainer.classList.remove('hidden');
            this.mediaBrand.innerHTML = `
                <div style="display: flex; align-items: center; gap: 5px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><polygon points="10 8 14 10 10 12 10 8"></polygon></svg>
                    <span style="color: white; font-weight: bold; font-size: 14px;">فيديو مباشر</span>
                </div>`;
            this.syncGenericVideo(state);
        } else if (type === 'web') {
            this.browserContainer.classList.remove('hidden');
            if (this.role === 'owner') this.browserToolbar.classList.remove('hidden');

            this.mediaBrand.innerHTML = `
                <div style="display: flex; align-items: center; gap: 5px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    <span style="color: white; font-weight: bold; font-size: 14px;">متصفح</span>
                </div>`;
            this.syncBrowser(state);
        }
    }

    syncYouTube(state) {
        if (!this.player || !this.player.loadVideoById) return;

        const now = Date.now() + this.serverOffset;
        let targetTime = state.currentTime;
        if (state.state === 1 && state.updatedAt) {
            targetTime += (now - state.updatedAt) / 1000;
        }

        const isNewVideo = state.videoId !== (this._lastYtId || '');
        this._lastYtId = state.videoId;

        if (isNewVideo) {
            this.player.loadVideoById({ videoId: state.videoId, startSeconds: targetTime });
            if (this.role !== 'owner' && this.isMutedByPolicy) this.player.mute();
            if (this.vidMiniThumb) {
                this.vidMiniThumb.src = `https://img.youtube.com/vi/${state.videoId}/mqdefault.jpg`;
                this.vidMiniThumb.style.display = 'block';
            }

            const checkTitle = setInterval(() => {
                if (this.player.getVideoData && this.player.getVideoData().title) {
                    const data = this.player.getVideoData();
                    this.vidTitle.textContent = data.title;
                    this.vidOwner.textContent = "بواسطة: " + (data.author || "يوتيوب");
                    clearInterval(checkTitle);
                }
            }, 1000);
            setTimeout(() => clearInterval(checkTitle), 10000);
        }

        const diff = Math.abs(this.player.getCurrentTime() - targetTime);
        if (diff > 3) this.player.seekTo(targetTime, true);

        const curState = this.player.getPlayerState();
        if (state.state === 1 && curState !== 1) this.player.playVideo();
        if (state.state === 2 && curState !== 2) this.player.pauseVideo();
    }

    syncGenericVideo(state) {
        if (!this.genericVideo) return;
        const absoluteUrl = this.ensureAbsoluteUrl(state.url);

        if (this._lastVideoUrl !== absoluteUrl) {
            this._lastVideoUrl = absoluteUrl;
            this.vidTitle.textContent = "فيديو مباشر";
            this.vidOwner.textContent = "بواسطة: رابط خارجي";
            if (this.vidMiniThumb) {
                this.vidMiniThumb.src = "";
                this.vidMiniThumb.style.display = 'none';
            }

            // Handle HLS (.m3u8)
            if (absoluteUrl.includes('.m3u8')) {
                if (Hls.isSupported()) {
                    if (this.hls) {
                        this.hls.destroy();
                    }
                    this.hls = new Hls();
                    this.hls.loadSource(absoluteUrl);
                    this.hls.attachMedia(this.genericVideo);
                } else if (this.genericVideo.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native support (Safari)
                    this.genericVideo.src = absoluteUrl;
                } else {
                    this.showToast("المتصفح لا يدعم هذا النوع من البث");
                }
            } else {
                // Regular MP4/WebM
                if (this.hls) {
                    this.hls.destroy();
                    this.hls = null;
                }
                this.genericVideo.src = absoluteUrl;
            }
        }

        const now = Date.now() + this.serverOffset;
        let targetTime = state.currentTime;
        if (state.state === 1 && state.updatedAt) {
            targetTime += (now - state.updatedAt) / 1000;
        }

        const diff = Math.abs(this.genericVideo.currentTime - targetTime);
        if (diff > 3) this.genericVideo.currentTime = targetTime;

        if (state.state === 1 && this.genericVideo.paused) this.genericVideo.play().catch(() => {});
        if (state.state === 2 && !this.genericVideo.paused) this.genericVideo.pause();
    }

    syncBrowser(state) {
        if (!this.browserIframe) return;
        const absoluteUrl = this.ensureAbsoluteUrl(state.url);

        // Use attribute check as .src might be expanded with trailing slashes by the browser
        const currentSrc = this.browserIframe.getAttribute('src');
        if (currentSrc !== absoluteUrl) {
            if (this.browserLoadingOverlay) this.browserLoadingOverlay.classList.remove('hidden');
            this.browserIframe.src = absoluteUrl;
            if (this.btnBrowserFallback) this.btnBrowserFallback.classList.remove('hidden');
            if (this.browserUrlInput) this.browserUrlInput.value = absoluteUrl;

            this.vidTitle.textContent = "تصفح ويب";
            try {
                const urlObj = new URL(absoluteUrl);
                this.vidOwner.textContent = "الموقع: " + urlObj.hostname;
            } catch(e) {
                this.vidOwner.textContent = "تصفح مباشر";
            }
        }
    }

    handleUserUnmute() {
        this.isMutedByPolicy = false;
        if (this.unmuteOverlay) {
            this.unmuteOverlay.remove();
            this.unmuteOverlay = null;
        }

        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.initializeAudioPool();

        if (this.player && this.player.unMute) {
            this.player.unMute();
            this.player.setVolume(100);
        }
        if (this.genericVideo) {
            this.genericVideo.muted = false;
            this.genericVideo.volume = 1.0;
            if (this.mediaState.state === 1) {
                this.genericVideo.play().catch(() => {});
            }
        }

        // Also try to play any remote audios (crucial for voice chat)
        document.querySelectorAll('audio').forEach(a => {
            if (a.id.startsWith('audio-')) a.play().catch(() => {});
            if (a.id.startsWith('audio-pool-')) a.play().catch(() => {});
        });

        this.showToast("تم تفعيل الصوت بنجاح");
    }

    // ================== SEARCH & PLAYLIST ==================

    async fetchTrendingVideos() {
        this.ytResultsGrid.innerHTML = '';
        this.ytBrowserLoading.classList.remove('hidden');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
            const res = await fetch(`${this.currentInstance}/trending?region=SA`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Invalid data format");
            this.renderYtResults(data);
        } catch (e) {
            console.error("Trending fetch error:", e);
            this.handlePipedError(() => this.fetchTrendingVideos());
        } finally {
            this.ytBrowserLoading.classList.add('hidden');
        }
    }

    async searchYouTube(query) {
        if (!query) return;
        this.ytResultsGrid.innerHTML = '';
        this.ytBrowserLoading.classList.remove('hidden');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
            const res = await fetch(`${this.currentInstance}/search?q=${encodeURIComponent(query)}&filter=videos`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const results = data.items || data;
            if (!Array.isArray(results)) throw new Error("Invalid data format");
            this.renderYtResults(results);
        } catch (e) {
            console.error("Search fetch error:", e);
            this.handlePipedError(() => this.searchYouTube(query));
        } finally {
            this.ytBrowserLoading.classList.add('hidden');
        }
    }

    async fetchCategoryVideos(cat, label) {
        this.ytResultsGrid.innerHTML = '';
        this.ytBrowserLoading.classList.remove('hidden');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
            const res = await fetch(`${this.currentInstance}/trending?region=SA&category=${cat.toUpperCase()}`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && Array.isArray(data) && data.length > 0) {
                this.renderYtResults(data);
            } else {
                this.searchYouTube(label);
            }
        } catch (e) {
            console.error("Category fetch error:", e);
            this.searchYouTube(label);
        } finally {
            this.ytBrowserLoading.classList.add('hidden');
        }
    }

    handlePipedError(retryFn) {
        // Find another instance that is not the current one
        const otherInstances = this.pipedInstances.filter(inst => inst !== this.currentInstance);
        if (otherInstances.length > 0) {
            this.currentInstance = otherInstances[Math.floor(Math.random() * otherInstances.length)];
            console.log("Switching to Piped instance:", this.currentInstance);
            retryFn();
        } else {
            this.showToast("عذراً، تعذر جلب الفيديوهات حالياً. حاول مرة أخرى لاحقاً.");
        }
    }

    renderYtResults(videos) {
        this.ytResultsGrid.innerHTML = '';
        if (!videos || !Array.isArray(videos) || videos.length === 0) {
            this.ytResultsGrid.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">لا توجد نتائج، جاري المحاولة مرة أخرى...</p>';
            return;
        }

        videos.forEach(v => {
            if (!v.url && !v.videoId) return;
            let videoId = v.videoId;
            if (!videoId && v.url) {
                if (v.url.includes('v=')) videoId = v.url.split('v=')[1].split('&')[0];
                else videoId = v.url.split('/').pop();
            }
            if (!videoId || videoId.length !== 11) return;

            const card = document.createElement('div');
            card.className = 'yt-card';
            card.innerHTML = `
                <div class="yt-thumb-wrapper">
                    <img class="yt-card-thumb" src="${v.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}" loading="lazy">
                    <span class="yt-duration">${v.duration ? this.formatDuration(v.duration) : ''}</span>
                </div>
                <div class="yt-card-info">
                    <img class="yt-channel-avatar" src="${v.uploaderAvatar || ''}" onerror="this.src='https://www.youtube.com/s/desktop/28b67e7e/img/avatar_proxy.png'">
                    <div class="yt-meta">
                        <div class="yt-card-title">${this.escapeHtml(v.title)}</div>
                        <div class="yt-card-sub">${v.uploaderName || 'YouTube'} • ${v.views ? this.formatViews(v.views) : ''}</div>
                    </div>
                </div>
            `;
            card.onclick = () => {
                const title = v.title || "فيديو يوتيوب";
                const thumbnail = v.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                this.addSpecificVideoToPlaylist(videoId, title, thumbnail);
                this.playFromPlaylist({ videoId, title });
                this.modalYtBrowser.classList.add('hidden');
            };
            this.ytResultsGrid.appendChild(card);
        });
    }

    formatDuration(sec) {
        if (!sec) return "";
        const hrs = Math.floor(sec / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        const secs = Math.floor(sec % 60);
        return (hrs > 0 ? hrs + ":" : "") + (mins < 10 && hrs > 0 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;
    }

    formatViews(views) {
        if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M view';
        if (views >= 1000) return (views / 1000).toFixed(1) + 'K view';
        return views + ' view';
    }

    async addSpecificVideoToPlaylist(urlOrId, customTitle = null, customThumb = null) {
        if (this.role !== 'owner') return;

        let videoId = urlOrId;
        const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = urlOrId.match(ytRegExp);
        if (match && match[2].length === 11) {
            videoId = match[2];
        }

        if (videoId.length !== 11) {
            this.showToast("رابط غير صحيح");
            return;
        }

        this.showToast("جاري إضافة الفيديو...");

        try {
            const title = customTitle || "فيديو يوتيوب";
            const thumbnail = customThumb || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

            const playlistRef = ref(this.db, `rooms/${this.roomId}/playlist`);
            await push(playlistRef, {
                videoId: videoId,
                title: title,
                thumbnail: thumbnail,
                author: "YouTube",
                addedBy: this.username,
                timestamp: serverTimestamp()
            });

            this.showToast("تمت الإضافة للقائمة ✅");

            // Optionally close and go back to playlist
            this.modalYtBrowser.classList.add('hidden');
            this.modalPlaylist.classList.remove('hidden');

        } catch (e) {
            console.error(e);
            this.showToast("فشل إضافة الفيديو");
        }
    }

    renderPlaylist() {
        if (!this.playlistItemsContainer) return;
        this.playlistItemsContainer.innerHTML = '';

        const items = Object.entries(this.playlistData || {})
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        if (items.length === 0) {
            this.playlistItemsContainer.innerHTML = '<div class="empty-playlist">القائمة فارغة، أضف بعض الفيديوهات!</div>';
            return;
        }

        items.forEach(([key, item]) => {
            const isPlaying = this.mediaState.videoId === item.videoId;
            const div = document.createElement('div');
            div.className = `playlist-item ${isPlaying ? 'playing' : ''}`;
            div.innerHTML = `
                <img class="item-thumb" src="${item.thumbnail}">
                <div class="item-info">
                    <span class="item-title">${item.title}</span>
                    <span class="item-author">${item.author}</span>
                </div>
                ${this.role === 'owner' ? `<button class="btn-item-action" onclick="event.stopPropagation(); window.liveManager.removeFromPlaylist('${key}')">🗑️</button>` : ''}
            `;
            div.onclick = () => {
                if (this.role === 'owner') {
                    this.playFromPlaylist(item);
                } else {
                    this.showToast("المالك فقط يمكنه تشغيل فيديوهات من القائمة");
                }
            };
            this.playlistItemsContainer.appendChild(div);
        });
    }

    async removeFromPlaylist(key) {
        if (this.role !== 'owner') return;
        await remove(ref(this.db, `rooms/${this.roomId}/playlist/${key}`));
        this.showToast("تم الحذف من القائمة");
    }

    playNextInPlaylist() {
        if (!this.playlistData || this.role !== 'owner') return;

        const items = Object.entries(this.playlistData)
            .sort((a, b) => a[1].timestamp - b[1].timestamp);

        if (items.length === 0) return;

        // Find current video index
        const currentIndex = items.findIndex(([_, item]) => item.videoId === this.mediaState.videoId);
        let nextItem = null;

        if (currentIndex !== -1 && currentIndex < items.length - 1) {
            nextItem = items[currentIndex + 1][1];
        } else if (items.length > 0) {
            // Loop back to first if it was the last or not found
            nextItem = items[0][1];
        }

        if (nextItem) {
            this.playFromPlaylist(nextItem);
            this.showToast(`التالي: ${nextItem.title}`);
        }
    }

    playFromPlaylist(item) {
        this.mediaState = {
            type: 'youtube',
            url: `https://www.youtube.com/watch?v=${item.videoId}`,
            videoId: item.videoId,
            state: 1,
            currentTime: 0,
            updatedAt: serverTimestamp()
        };
        this.ownerUpdateFirebase(0);
        this.modalPlaylist.classList.add('hidden');
        this.showToast("جاري التشغيل من القائمة...");
    }

    // ================== OWNER ACTIONS ==================

    ownerLoadVideo() {
        let input = this.ytUrlInput.value.trim();
        if (!input) return;

        let type = this.selectedType;
        let videoId = '';
        let url = input;

        if (type === 'auto') {
            const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(ytRegExp);
            if (match && match[2].length === 11) {
                type = 'youtube';
                videoId = match[2];
            } else if (url.toLowerCase().match(/\.(mp4|webm|ogg|m3u8|mov|m4v|avi|flv)/) || url.includes('.m3u8')) {
                type = 'video';
                url = this.processUrl(input);
            } else {
                type = 'web';
                url = this.processUrl(input);
            }
        } else if (type === 'video' || type === 'web') {
            url = this.processUrl(input);
        }

        this.mediaState = {
            type: type,
            url: url,
            videoId: videoId,
            state: 1, // playing
            currentTime: 0,
            updatedAt: serverTimestamp()
        };

        this.ownerUpdateFirebase();
        this.modalYT.classList.add('hidden');
        this.showToast("جاري التحميل...");
    }

    ownerOnMediaEvent(state = null) {
        if (this.role !== 'owner' || this.isSyncing) return;
        if (state !== null) this.mediaState.state = state;
        this.ownerUpdateFirebase();
    }

    ownerUpdateFirebase(forcedTime = null) {
        if (!this.roomId || this.isSyncing) return;
        this.isSyncing = true;

        let time = forcedTime;
        if (time === null) {
            if (this.mediaState.type === 'youtube' && this.player && this.player.getCurrentTime) {
                time = this.player.getCurrentTime();
            } else if (this.mediaState.type === 'video' && this.genericVideo) {
                time = this.genericVideo.currentTime;
            } else {
                time = 0;
            }
        }

        update(ref(this.db, `rooms/${this.roomId}/youtube_state`), {
            type: this.mediaState.type,
            url: this.mediaState.url || '',
            videoId: this.mediaState.videoId || '',
            state: this.mediaState.state,
            currentTime: time,
            updatedAt: serverTimestamp()
        }).then(() => {
            setTimeout(() => { this.isSyncing = false; }, 800);
        });
    }

    ownerChangeState(state) {
        if (this.mediaState.type === 'youtube' && this.player) {
            if (state === 1) this.player.playVideo();
            else this.player.pauseVideo();
        } else if (this.mediaState.type === 'video' && this.genericVideo) {
            if (state === 1) this.genericVideo.play().catch(() => {});
            else this.genericVideo.pause();
        }
        this.mediaState.state = state;
        this.ownerUpdateFirebase();
    }


    toggleFullscreen() {
        const container = document.getElementById('main-video-container');
        if (!container) return;
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) {
                container.requestFullscreen().catch(err => console.log(err));
            } else if (container.webkitRequestFullscreen) { /* Safari */
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) { /* IE11 */
                container.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    // ================== PEERJS VOICE CHAT ==================

    async initPeer() {
        if (this.peer || !this.myId) {
            console.log("PeerJS: Initialization skipped (already exists or no ID). ID:", this.myId);
            return;
        }

        console.log("PeerJS: Initializing with ID:", this.myId + "_" + this.sessionId);
        this.peer = new Peer(this.myId + "_" + this.sessionId, {
            config: this.iceConfig,
            debug: 1
        });

        // Global exposing as requested
        window.peer = this.peer;

        this.peer.on('open', (id) => {
            console.log('%c[PeerJS] تم فتح الاتصال بنجاح. المعرف الخاص بك:', 'color: #00ff00; font-weight: bold;', id);
            this.registerVoicePeer();
            this.setupPeerListeners();
            this.listenToVoicePeers();
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Error:', err.type, err);
            if (err.type === 'peer-unavailable') {
                // Ignore
            } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'unavailable-id') {
                console.log("PeerJS: Critical error, attempting reset...");
                setTimeout(() => {
                    if (this.peer && !this.peer.destroyed) this.peer.destroy();
                    this.peer = null;
                    this.initPeer();
                }, 5000);
            }
        });
    }

    createSilentAudioStream() {
        const oscillator = this.audioContext.createOscillator();
        const dst = oscillator.connect(this.audioContext.createMediaStreamDestination());
        oscillator.start();
        const track = dst.stream.getAudioTracks()[0];
        track.enabled = false;
        return new MediaStream([track]);
    }

    async registerVoicePeer() {
        if (!this.peer || !this.peer.id) return;
        const voiceRef = ref(this.db, `rooms/${this.roomId}/voice_peers/${this.peer.id}`);
        onDisconnect(voiceRef).remove();
        await set(voiceRef, {
            uid: this.myId,
            peerId: this.peer.id,
            name: this.username,
            active: true,
            updatedAt: serverTimestamp()
        });
    }

    setupPeerListeners() {
        this.peer.on('call', (call) => {
            console.log('%c[WebRTC] مكالمة واردة من:', 'color: #0088ff; font-weight: bold;', call.peer);
            call.answer(this.myStream || this.silentStream);
            this.handleCallStream(call);
        });
    }

    handleCallStream(call) {
        this.activeCalls[call.peer] = call;

        const onStreamReceived = (remoteStream) => {
            if (call._streamHandled) return;
            call._streamHandled = true;
            
            console.log('%c[AUDIO-ENGINE] بدأ ربط التدفق الصوتي المزدوج...', 'background: #2ecc71; color: #fff; padding: 5px;');
            
            // 1. Path A: HTML5 Audio Element (Standard)
            let audio = this.audioPool.find(el => el.getAttribute('data-peer-id') === call.peer) || this.audioPool.find(el => !el.srcObject);
            if (audio) {
                audio.setAttribute('data-peer-id', call.peer);
                audio.srcObject = remoteStream;
                audio.volume = 1.0;
                audio.muted = false;
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.warn("[HTML5-AUDIO] Autoplay blocked, waiting for user click.", e);
                        this.showToast("⚠️ اضغط على الشاشة لتفعيل الصوت");
                    });
                }
            }
            
            // 2. Setup AudioContext Boost (Parallel path for guaranteed volume)
            try {
                if (!this.audioContext) {
                    console.warn("[AUDIO-ENGINE] محرك الصوت لم يتم إنشاؤه بعد (انتظار ضغطة المستخدم).");
                } else {
                    const source = this.audioContext.createMediaStreamSource(remoteStream);
                    const gainNode = this.audioContext.createGain();
                    const compressor = this.audioContext.createDynamicsCompressor();
                    
                    gainNode.gain.value = 4.0; // 400% Boost
                    
                    source.connect(gainNode);
                    gainNode.connect(compressor);
                    compressor.connect(this.audioContext.destination);
                    console.log('%c[WEB-AUDIO] تم الربط بنجاح بمحرك الصوت بنسبة 400%', 'color: #00ff00;');
                }
            } catch(e) { console.warn("WebAudio path failed:", e); }

            this.logVoiceActivity(`استلام صوت من ${call.peer.split('_')[0]} 🔊`, 'success');
            this.startVolumeDetection(remoteStream, call.peer);
        };

        call.on('stream', (remoteStream) => onStreamReceived(remoteStream));
        if (call.peerConnection) {
            call.peerConnection.ontrack = (event) => {
                if (event.streams && event.streams[0]) onStreamReceived(event.streams[0]);
            };
        }

        call.on('error', (err) => {
            console.error("Call error:", call.peer, err);
            this.logVoiceActivity(`خطأ في اتصال ${call.peer.split('_')[0]}`, 'error');
        });

        call.on('close', () => {
            console.log('Call closed:', call.peer);
            this.activeCalls[call.peer] = null;
            delete this.activeCalls[call.peer];
            const audio = this.audioPool.find(el => el.getAttribute('data-peer-id') === call.peer);
            if (audio) { audio.srcObject = null; audio.removeAttribute('data-peer-id'); }
        });
    }

    async toggleMic() {
        console.log("Mic Toggle Clicked. Current Stream:", !!this.myStream);
        
        // Resume audio context on any toggle attempt
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume().catch(e => console.error("AudioContext resume failed:", e));
        }

        try {
            if (!this.myStream) {
                this.showToast("جاري تفعيل الميكروفون...");
                
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("المتصفح لا يدعم الوصول للميكروفون أو الاتصال غير آمن (HTTPS مطلوب)");
                }

                // First time: Get real stream
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    } 
                });
                
                this.myStream = stream;
                this.isMicOn = true;
                console.log('%c[Mic] تم الحصول على صلاحية الميكروفون بنجاح', 'color: #00ff00; font-weight: bold;');

                // Replace track in all active calls
                const newTrack = stream.getAudioTracks()[0];
                console.log('[WebRTC] جاري تحديث مسار الصوت في المكالمات النشطة...', Object.keys(this.activeCalls).length);
                Object.values(this.activeCalls).forEach(call => {
                    if (call.peerConnection) {
                        const senders = call.peerConnection.getSenders();
                        const sender = senders.find(s => s.track && s.track.kind === 'audio');
                        if (sender) {
                            sender.replaceTrack(newTrack).catch(e => console.error("ReplaceTrack failed:", e));
                        }
                    }
                });

                this.micOnIcon.classList.remove('hidden');
                this.micOffIcon.classList.add('hidden');
                this.btnToggleMic.classList.remove('muted');
                this.showToast("الميكروفون مفعل ✅");

                this.startVolumeDetection(this.myStream, this.myId);
            } else {
                this.isMicOn = !this.isMicOn;
                this.myStream.getAudioTracks().forEach(t => t.enabled = this.isMicOn);

                if (this.isMicOn) {
                    this.micOnIcon.classList.remove('hidden');
                    this.micOffIcon.classList.add('hidden');
                    this.btnToggleMic.classList.remove('muted');
                    this.showToast("الميكروفون مفعل ✅");
                } else {
                    this.micOnIcon.classList.add('hidden');
                    this.micOffIcon.classList.remove('hidden');
                    this.btnToggleMic.classList.add('muted');
                    this.showToast("تم كتم الميكروفون 🔇");
                    this.updateSpeakingUI(this.myId, false);
                    this.updateSpeakingInFirebase(false);
                }
            }
        } catch (err) {
            console.error("Mic Error:", err);
            this.showToast(`⚠️ ${err.message || "فشل الوصول للميكروفون"}`);
        }
    }

    listenToVoicePeers() {
        if (!this.roomId) return;
        this.logVoiceActivity("بدأ البحث عن متصلين...");

        const checkPeers = () => {
            if (!this.peer || !this.peer.open) return;
            get(ref(this.db, `rooms/${this.roomId}/voice_peers`)).then((snap) => {
                const peers = snap.val() || {};
                const peerIds = Object.keys(peers);
                
                Object.entries(peers).forEach(([pid, d]) => {
                    if (pid !== this.peer.id && !this.activeCalls[pid]) {
                        console.log('%c[WebRTC] محاولة ربط صوتي بـ:', 'color: #0088ff;', pid);
                        this.logVoiceActivity(`محاولة ربط بـ ${d.name || pid.split('_')[0]}...`, 'warn');
                        const stream = this.myStream || this.silentStream;
                        try {
                            const call = this.peer.call(pid, stream);
                            if (call) this.handleCallStream(call);
                        } catch(e) { console.error("Call error:", e); }
                    }
                });
            });
        };

        onValue(ref(this.db, `rooms/${this.roomId}/voice_peers`), () => checkPeers());
        setInterval(checkPeers, 6000);
    }

    startVolumeDetection(stream, uid) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Cleanup
        if (this.analysers[uid]) {
            try { this.analysers[uid].source.disconnect(); } catch(e) {}
        }

        try {
            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            this.analysers[uid] = { analyser, source };

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                if (!this.analysers[uid]) return;

                const track = stream.getAudioTracks()[0];
                if (!track || !track.enabled || track.readyState === 'ended' || !stream.active) {
                    this.updateSpeakingUI(uid, false);
                    if (uid === this.myId) this.updateSpeakingInFirebase(false);
                    if (!stream.active) return;
                } else {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                    const average = sum / bufferLength;
                    const isSpeaking = average > 12;

                    if (uid === this.myId) {
                        if (this._lastSpeakingState !== isSpeaking) {
                            if (isSpeaking) this.logVoiceActivity("أنت تتحدث الآن... 🎤", "success");
                            this.updateSpeakingInFirebase(isSpeaking);
                        }
                    } else {
                        // Remote peer activity logging
                        if (isSpeaking && !this._isSpeakingLogActive[uid]) {
                            this._isSpeakingLogActive[uid] = true;
                            this.logVoiceActivity(`رصد صوت حي من: ${uid.split('_')[0]} 🔊`, "success");
                            setTimeout(() => { this._isSpeakingLogActive[uid] = false; }, 3000);
                        }
                    }
                }
                requestAnimationFrame(checkVolume);
            };
            checkVolume();
        } catch (e) {
            console.error("Volume detection error:", uid, e);
        }
    }

    updateSpeakingInFirebase(isSpeaking) {
        if (!this.roomId || !this.peer || !this.peer.id || this._lastSpeakingState === isSpeaking) return;
        this._lastSpeakingState = isSpeaking;

        update(ref(this.db, `rooms/${this.roomId}/voice_peers/${this.peer.id}`), {
            isSpeaking: isSpeaking
        });
    }

    updateSpeakingUI(id, isSpeaking) {
        if (!id) return;
        const uid = id.includes('_') ? id.split('_')[0] : id;
        const frames = document.querySelectorAll('.avatar-circle-frame');
        let found = false;
        frames.forEach(frame => {
            if (frame.dataset.uid === String(uid)) {
                if (isSpeaking) frame.classList.add('speaking');
                else frame.classList.remove('speaking');
                found = true;
            }
        });
        // If not found in frames, it might be the user avatar at the top
        if (!found) {
            const profileFrame = document.querySelector('.profile-square'); // Or similar
            // Add pulse to profile if needed
        }
    }

    // ================== SEATS ==================

    updateSeatsUI(seats) {
        if (!this.seatsContainer) {
            this.seatsContainer = document.getElementById('seats-container');
        }
        if (!this.seatsContainer) return;

        const seatsData = seats || {};
        
        // Optimization: Instead of clearing everything, we update existing seats or rebuild only if needed
        // To keep it simple and fix the flicker, we'll check if the content actually changed
        for (let i = 1; i <= 6; i++) {
            const seat = seatsData[i] || { status: 'empty' };
            let seatBox = this.seatsContainer.querySelector(`.seat-box[data-index="${i}"]`);
            
            if (!seatBox) {
                seatBox = document.createElement('div');
                seatBox.className = 'seat-box';
                seatBox.dataset.index = i;
                this.seatsContainer.appendChild(seatBox);
            }

            const currentStatus = seatBox.dataset.status;
            const currentUserId = seatBox.dataset.userId;

            // Only update if status or user changed
            if (currentStatus !== seat.status || currentUserId !== (seat.userId || '')) {
                seatBox.dataset.status = seat.status;
                seatBox.dataset.userId = seat.userId || '';

                let content = '';
                if (seat.status === 'locked') {
                    content = `<span class="lock-seat">🔒</span><span class="seat-label-num">${i}</span>`;
                } else if (seat.status === 'occupied') {
                    const isMe = seat.userId === this.myId;
                    content = `
                        <div class="avatar-circle-frame ${isMe ? 'green-border' : ''}" data-uid="${seat.userId}">
                            <img src="${seat.avatar}" alt="${seat.name}" loading="lazy">
                        </div>
                        <span class="seat-label-num" style="color:#fff;">${seat.name}</span>
                    `;
                } else {
                    content = `
                        <div class="avatar-circle-frame seat-empty" onclick="window.liveManager.joinSeat(${i})">
                            <span style="font-size:20px;color:rgba(255,255,255,0.3);">+</span>
                        </div>
                        <button class="btn-join-small" onclick="window.liveManager.joinSeat(${i})">انضم</button>
                        <span class="seat-label-num">${i}</span>
                    `;
                }
                seatBox.innerHTML = content;
            }
        }
    }

    async joinSeat(index) {
        const seatRef = ref(this.db, `rooms/${this.roomId}/seats/${index}`);
        const snap = await get(seatRef);
        if (snap.exists() && snap.val().status !== 'empty') return;

        const seatsSnap = await get(ref(this.db, `rooms/${this.roomId}/seats`));
        const currentSeats = seatsSnap.val() || {};
        for (const [idx, s] of Object.entries(currentSeats)) {
            if (s.userId === this.myId) {
                await set(ref(this.db, `rooms/${this.roomId}/seats/${idx}`), { status: 'empty' });
            }
        }

        await update(seatRef, {
            status: 'occupied',
            userId: this.myId,
            name: this.username,
            avatar: this.userAvatar
        });
        onDisconnect(seatRef).set({ status: 'empty' });
    }

    // ================== CHAT ==================

    async sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (!text) return;
        const chatRef = ref(this.db, `rooms/${this.roomId}/messages`);
        await push(chatRef, {
            userId: this.myId,
            userName: this.username,
            avatar: this.userAvatar,
            text: text,
            timestamp: serverTimestamp()
        });
        this.chatInput.value = '';
    }

    updateChatUI(messages) {
        this.chatLogEl.innerHTML = '<p class="chat-intro">أهلاً بك في الغرفة! ✨</p>';
        const msgs = Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
        msgs.forEach(m => {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.innerHTML = `
                <img class="chat-avatar" src="${m.avatar}">
                <div class="chat-body">
                    <span class="chat-user-name">${m.userName}</span>
                    <div class="chat-bubble-new">${this.escapeHtml(m.text)}</div>
                </div>
            `;
            this.chatLogEl.appendChild(div);
        });

        // Auto-scroll logic as requested by user
        setTimeout(() => {
            this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
        }, 50);
    }

    escapeHtml(t) {
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.liveManager = new LiveManager();
});
