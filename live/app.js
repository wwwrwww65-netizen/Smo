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
        this.audioContext = null;
        this.analysers = {}; // uid -> analyser node
        this.isPeerInitialized = false;

        this.initElements();
        this.initAuth();
        this.setupYouTube();
        this.calculateServerOffset();
    }

    initElements() {
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
        document.querySelector('.user-display-name').textContent = this.username;
        document.querySelector('.user-display-id').textContent = `ID: ${this.roomId}`;
        document.querySelector('.profile-square').src = this.userAvatar;
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

        // Initialize Peer immediately on room entry
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
            this.vidMiniThumb.src = `https://img.youtube.com/vi/${state.videoId}/mqdefault.jpg`;

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
        if (this.genericVideo.src !== absoluteUrl) {
            this.genericVideo.src = absoluteUrl;
            this.vidTitle.textContent = "فيديو مباشر";
            this.vidOwner.textContent = "بواسطة: رابط خارجي";
            this.vidMiniThumb.src = ""; // Clear mini thumb
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

        if (this.player && this.player.unMute) {
            this.player.unMute();
            this.player.setVolume(100);
        }
        if (this.genericVideo) {
            this.genericVideo.muted = false;
            this.genericVideo.volume = 1.0;
        }
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
            } else if (url.match(/\.(mp4|webm|ogg|m3u8|mov)(\?.*)?$/i)) {
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
        if (this.isPeerInitialized) return;
        this.isPeerInitialized = true;

        // Create a silent track initially so we can connect before mic access
        this.myStream = this.createSilentAudioStream();

        this.peer = new Peer(this.myId);

        this.peer.on('open', (id) => {
            console.log('Peer connected with ID:', id);
            this.registerVoicePeer();
            this.setupPeerListeners();
            this.listenToVoicePeers();
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
            this.isPeerInitialized = false; // Allow retry
        });
    }

    createSilentAudioStream() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const oscillator = this.audioContext.createOscillator();
        const dst = oscillator.connect(this.audioContext.createMediaStreamDestination());
        oscillator.start();
        const track = dst.stream.getAudioTracks()[0];
        track.enabled = false; // Truly silent
        return new MediaStream([track]);
    }

    async registerVoicePeer() {
        const voiceRef = ref(this.db, `rooms/${this.roomId}/voice_peers/${this.myId}`);
        onDisconnect(voiceRef).remove();
        await set(voiceRef, {
            peerId: this.myId,
            name: this.username,
            active: true
        });
    }

    setupPeerListeners() {
        this.peer.on('call', (call) => {
            console.log('Incoming call from:', call.peer);
            call.answer(this.myStream);
            this.handleCallStream(call);
        });
    }

    handleCallStream(call) {
        call.on('stream', (remoteStream) => {
            console.log('Receiving stream from:', call.peer);

            // Hidden audio element for playback
            let audio = document.getElementById(`audio-${call.peer}`);
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = `audio-${call.peer}`;
                audio.autoplay = true;
                audio.style.display = 'none';
                document.body.appendChild(audio);
            }
            audio.srcObject = remoteStream;
            audio.play().catch(e => console.error("Audio playback blocked:", e));

            this.activeCalls[call.peer] = call;
            this.startVolumeDetection(remoteStream, call.peer);
        });

        call.on('close', () => {
            console.log('Call closed with:', call.peer);
            const audio = document.getElementById(`audio-${call.peer}`);
            if (audio) audio.remove();
            delete this.activeCalls[call.peer];
            if (this.analysers[call.peer]) delete this.analysers[call.peer];
        });

        call.on('error', (err) => {
            console.error('Call error:', err);
            call.close();
        });
    }

    async toggleMic() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        try {
            if (!this.realMicTrack) {
                // First time: Request Permission and get real stream
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.realMicTrack = stream.getAudioTracks()[0];

                // Replace silent track with real mic track in all active calls
                this.replaceTrackInActiveCalls(this.realMicTrack);

                // Update local stream reference
                const currentTrack = this.myStream.getAudioTracks()[0];
                this.myStream.removeTrack(currentTrack);
                this.myStream.addTrack(this.realMicTrack);

                this.isMicOn = true;
                this.micOnIcon.classList.remove('hidden');
                this.micOffIcon.classList.add('hidden');
                this.btnToggleMic.classList.remove('muted');
                this.showToast("الميكروفون قيد التشغيل");

                // Start detecting my volume
                this.startVolumeDetection(this.myStream, this.myId);
            } else {
                // Toggle mute (disable track)
                this.isMicOn = !this.isMicOn;
                this.realMicTrack.enabled = this.isMicOn;

                if (this.isMicOn) {
                    this.micOnIcon.classList.remove('hidden');
                    this.micOffIcon.classList.add('hidden');
                    this.btnToggleMic.classList.remove('muted');
                    this.showToast("الميكروفون قيد التشغيل");
                } else {
                    this.micOnIcon.classList.add('hidden');
                    this.micOffIcon.classList.remove('hidden');
                    this.btnToggleMic.classList.add('muted');
                    this.showToast("تم كتم الميكروفون");
                    this.updateSpeakingUI(this.myId, false);
                }
            }
        } catch (err) {
            console.error(err);
            this.showToast("خطأ في الوصول للميكروفون");
        }
    }

    replaceTrackInActiveCalls(newTrack) {
        Object.values(this.activeCalls).forEach(call => {
            const peerConnection = call.peerConnection;
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                const sender = senders.find(s => s.track && s.track.kind === 'audio');
                if (sender) {
                    sender.replaceTrack(newTrack);
                }
            }
        });
    }

    async callExistingPeers(peers) {
        Object.keys(peers).forEach(pid => {
            // Rule: Only call peers with "smaller" ID string to avoid duplicate calls
            if (pid !== this.myId && !this.activeCalls[pid] && this.myId < pid) {
                console.log('Calling peer:', pid);
                const call = this.peer.call(pid, this.myStream);
                if (call) {
                    this.activeCalls[pid] = call;
                    this.handleCallStream(call);
                }
            }
        });
    }

    listenToVoicePeers() {
        const voicePeersRef = ref(this.db, `rooms/${this.roomId}/voice_peers`);
        onValue(voicePeersRef, (snap) => {
            if (!this.peer) return;
            const peers = snap.val() || {};
            this.callExistingPeers(peers);
        });
    }

    startVolumeDetection(stream, uid) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Always resume audioContext if it's suspended (browser policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        try {
            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            this.analysers[uid] = { analyser, source }; // Keep source to prevent GC

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                if (!this.analysers[uid]) return;

                // Check if track is actually enabled and active
                const track = stream.getAudioTracks()[0];
                if (!track || !track.enabled || track.readyState === 'ended') {
                    this.updateSpeakingUI(uid, false);
                } else {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                    const average = sum / bufferLength;
                    this.updateSpeakingUI(uid, average > 15);
                }

                requestAnimationFrame(checkVolume);
            };
            checkVolume();
        } catch (e) {
            console.error("Volume detection error for", uid, e);
        }
    }

    updateSpeakingUI(uid, isSpeaking) {
        const frames = document.querySelectorAll('.avatar-circle-frame');
        frames.forEach(frame => {
            if (frame.dataset.uid === String(uid)) {
                if (isSpeaking) frame.classList.add('speaking');
                else frame.classList.remove('speaking');
            }
        });
    }

    // ================== SEATS ==================

    updateSeatsUI(seats) {
        this.seatsContainer.innerHTML = '';
        for (let i = 1; i <= 6; i++) {
            const seat = seats[i] || { status: 'empty' };
            const seatBox = document.createElement('div');
            seatBox.className = 'seat-box';

            let content = '';
            if (seat.status === 'locked') {
                content = `<span class="lock-seat">🔒</span><span class="seat-label-num">${i}</span>`;
            } else if (seat.status === 'occupied') {
                const isMe = seat.userId === this.myId;
                content = `
                    <div class="avatar-circle-frame ${isMe ? 'green-border' : ''}" data-uid="${seat.userId}">
                        <img src="${seat.avatar}" alt="${seat.name}">
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
            this.seatsContainer.appendChild(seatBox);
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
        this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
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
