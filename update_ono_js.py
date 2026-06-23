import re

with open('js/ono.js', 'r') as f:
    content = f.read()

# 1. Update `renderPlayedPile`
new_renderPlayedPile = """    renderPlayedPile() {
        const topCard = this.getTopCard();
        if (!topCard) {
            this.elPlayedPile.innerHTML = '';
            return;
        }

        let content = topCard.type === 'number' ? topCard.value : this.getIconForType(topCard.type);
        let bgClass = topCard.color;
        let typeClass = topCard.type;
        if (topCard.type.startsWith('wild')) {
            bgClass = this.currentColor || 'black';
        }

        // New .card-top design
        this.elPlayedPile.innerHTML = `
            <div class="card-top ${bgClass}">
              <div class="top-info">
                <span class="rank-num ${bgClass}">${content}</span>
                <span class="mini-suit ${bgClass}">${this.getSuitIcon(bgClass)}</span>
              </div>
              <span class="center-suit ${bgClass}">${this.getSuitIcon(bgClass)}</span>
            </div>
        `;
    }

    getSuitIcon(color) {
        if(color === 'red') return '♦';
        if(color === 'green') return '♥';
        if(color === 'blue') return '♣';
        if(color === 'yellow' || color === 'orange') return '♠';
        return '★';
    }"""

content = re.sub(
    r"    renderPlayedPile\(\) \{.*?(?=    getIconForType\()",
    new_renderPlayedPile + "\n\n",
    content,
    flags=re.DOTALL
)

# 2. Update `renderHand`
new_renderHand = """    renderHand() {
        const me = this.players.find(p => p.id === this.myId);
        this.elMyHand.innerHTML = '';

        if (!me || !me.hand) return;

        const count = me.hand.length;

        // Use mapping to the layout shown in CSS: card1 to card10 (or more if needed)
        // .card1{ left: 0%; transform: rotate(-16deg) translateY(18%); }
        // We can compute these styles dynamically or fallback to class approach

        const maxAngle = 34; // from -17 to 17
        const step = count > 1 ? maxAngle / (count - 1) : 0;
        const startAngle = -maxAngle / 2;

        const maxTranslateY = 18; // percent

        me.hand.forEach((card, index) => {
            const angle = count === 1 ? 0 : startAngle + (step * index);

            // Parabola shape for translateY: ax^2
            // center index = (count-1)/2
            // x = current_index - center_index
            // x_max = (count-1)/2
            // y = c * (x / x_max)^2
            let x_val = count > 1 ? (index - (count - 1) / 2) / ((count - 1) / 2) : 0;
            const translateY = Math.pow(x_val, 2) * maxTranslateY;

            const leftPercent = count > 1 ? (index / (count - 1)) * 79 : 40; // max left is ~79% from CSS

            const el = document.createElement('div');

            const isHidden = this.isSpectator || me.surrendered;

            if (isHidden) {
                el.className = `playing-card back`;
                el.style.background = "#222";
            } else {
                let colorClass = card.color;
                if(colorClass === 'yellow') colorClass = 'orange'; // CSS uses orange for yellow suit visually

                el.className = `playing-card ${colorClass} ${card.type}`;
                let content = card.type === 'number' ? card.value : this.getIconForType(card.type);

                let suit = this.getSuitIcon(colorClass);

                el.innerHTML = `
                    <div class="card-top-left ${colorClass}">
                        <span class="num">${content}</span>
                        <span class="tiny-suit">${suit}</span>
                    </div>
                    <div class="big ${colorClass}">${suit}</div>
                `;
            }

            el.style.left = `${leftPercent}%`;
            el.style.transform = `rotate(${angle}deg) translateY(${translateY}%)`;
            el.style.zIndex = index + 1;

            if (!isHidden && this.isMyTurn() && this.isValidPlay(card)) {
                el.classList.add('valid-play');
                el.onclick = () => this.playCard(index);
            } else if (!isHidden && this.isMyTurn()) {
                el.classList.add('invalid-play');
                el.onclick = () => this.showToast("لا يمكنك لعب هذه البطاقة!");
            } else if (!isHidden) {
                el.onclick = () => this.showToast("ليس دورك!");
            }

            this.elMyHand.appendChild(el);
        });

        if (!this.isSpectator && !me.surrendered && count === 2 && !me.hasSaidOno) {
            this.elBtnOno.classList.remove('hidden');
        } else {
            this.elBtnOno.classList.add('hidden');
        }
    }"""

content = re.sub(
    r"    renderHand\(\) \{.*?(?=    renderGameNodes\()",
    new_renderHand + "\n\n",
    content,
    flags=re.DOTALL
)

# 3. Update `renderGameNodes`
new_renderGameNodes = """    renderGameNodes() {
        this.elPlayerNodesContainer.innerHTML = '';

        let myIndex = this.players.findIndex(p => p.id === this.myId);
        if (myIndex === -1) myIndex = 0;

        const totalPlayers = this.players.length;

        // Define positioning classes based on total players
        // Classes: p-bottom (me), p-left-mid, p-left-top, p-top, p-right-top, p-right-mid
        const getPositionClass = (offset, total) => {
            if (offset === 0) return 'p-bottom';
            if (total === 2) {
                return offset === 1 ? 'p-top' : 'p-bottom';
            }
            if (total === 3) {
                return offset === 1 ? 'p-left-top' : 'p-right-top';
            }
            if (total === 4) {
                if (offset === 1) return 'p-left-mid';
                if (offset === 2) return 'p-top';
                if (offset === 3) return 'p-right-mid';
            }
            if (total === 5) {
                if (offset === 1) return 'p-left-mid';
                if (offset === 2) return 'p-left-top';
                if (offset === 3) return 'p-right-top';
                if (offset === 4) return 'p-right-mid';
            }
            // 6 players
            if (offset === 1) return 'p-left-mid';
            if (offset === 2) return 'p-left-top';
            if (offset === 3) return 'p-top';
            if (offset === 4) return 'p-right-top';
            if (offset === 5) return 'p-right-mid';
            return 'p-top';
        };

        for (let i = 0; i < totalPlayers; i++) {
            const idx = (myIndex + i) % totalPlayers;
            const p = this.players[idx];
            const posClass = getPositionClass(i, totalPlayers);

            const el = document.createElement('div');
            el.className = `player ${posClass}`;

            const isTurn = this.players[this.turnIndex]?.id === p.id;
            if (isTurn) el.classList.add('active-turn');

            const avatarHtml = p.surrendered ? "🏳️" : `<img src="${p.avatar}" alt="${this.escapeHtml(p.name)}">`;

            let innerHtml = `
                <div class="avatar">${avatarHtml}</div>
                <div class="badge">${p.cardsCount || 0}</div>
                <div class="name">${this.escapeHtml(p.name)}</div>
            `;

            if (isTurn && !p.isBot) {
                innerHtml += `<div class="turn-timer" id="timer-${p.id}">10</div>`;
            }

            if (p.isOnline === false || p.surrendered) {
                 el.style.opacity = '0.5';
            }

            el.innerHTML = innerHtml;
            this.elPlayerNodesContainer.appendChild(el);
        }

        if (this.isMyTurn()) {
            this.elDrawPile.style.boxShadow = '0 0 15px #38ef7d';
            // Hand validity is updated in renderHand
        } else {
            this.elDrawPile.style.boxShadow = 'none';
        }
    }"""

content = re.sub(
    r"    renderGameNodes\(\) \{.*?(?=    updateArrows\()",
    new_renderGameNodes + "\n\n",
    content,
    flags=re.DOTALL
)

# 4. Update `renderChat`
new_renderChat = """    renderChat(chatObj) {
        const messages = Object.values(chatObj).sort((a,b) => a.timestamp - b.timestamp);
        if (messages.length === this.chatMessages.length) return;
        this.chatMessages = messages;

        this.elGameChatHistory.innerHTML = '';

        messages.slice(-10).forEach(m => {
            const el = document.createElement('div');

            if (m.senderId === 'system') {
                el.className = 'chat-group system-style';
                el.innerHTML = `
                    <div class="chat-header">
                      <div class="tiny-avatar" style="background:linear-gradient(180deg,#d9d9d9,#555);"></div>
                      <span>النظام</span>
                    </div>
                    <div class="chat-bubble">${this.escapeHtml(m.text)}</div>
                `;
            } else {
                el.className = 'chat-group';
                el.innerHTML = `
                    <div class="chat-header">
                      <div class="tiny-avatar" style="background:linear-gradient(180deg,#f1d1d1,#c77);"><img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${m.senderName}" /></div>
                      <span>${this.escapeHtml(m.senderName)}</span>
                    </div>
                    <div class="chat-bubble">${this.escapeHtml(m.text)}</div>
                `;
            }

            this.elGameChatHistory.appendChild(el);
        });

        setTimeout(() => {
            this.elGameChatHistory.scrollTop = this.elGameChatHistory.scrollHeight;
        }, 100);
    }"""

content = re.sub(
    r"    renderChat\(chatObj\) \{.*?(?=    async quitGame\()",
    new_renderChat + "\n\n",
    content,
    flags=re.DOTALL
)

with open('js/ono.js', 'w') as f:
    f.write(content)
