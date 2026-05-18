import re

with open('js/ono.js', 'r') as f:
    content = f.read()

# 1. Update `renderPlayedPile` EXACTLY matching the user's HTML template
new_renderPlayedPile = """    renderPlayedPile() {
        const topCard = this.getTopCard();
        if (!topCard) {
            this.elPlayedPile.innerHTML = '';
            return;
        }

        let content = topCard.type === 'number' ? topCard.value : this.getIconForType(topCard.type);
        let bgClass = topCard.color;
        if (topCard.type.startsWith('wild')) {
            bgClass = this.currentColor || 'black';
        }

        this.elPlayedPile.innerHTML = `
            <div class="card-top">
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
    }

    getTinySuitForType(type, suit) {
        if(type === '+2') return '✚';
        if(type === 'skip') return '⊖';
        return suit;
    }"""

content = re.sub(
    r"    renderPlayedPile\(\) \{.*?(?=    getIconForType\()",
    new_renderPlayedPile + "\n\n",
    content,
    flags=re.DOTALL
)

# 2. Update getIconForType to match the user's design
new_getIconForType = """    getIconForType(type) {
        switch(type) {
            case 'skip': return '⊖';
            case 'reverse': return '⇄';
            case '+2': return '+';
            case 'wild': return '🌈';
            case 'wild+4': return '+4';
            default: return '';
        }
    }"""

content = re.sub(
    r"    getIconForType\(type\) \{.*?(?=    renderHand\(\) \{)",
    new_getIconForType + "\n\n",
    content,
    flags=re.DOTALL
)


# 3. Update `renderHand` EXACTLY matching the user's template using the static position classes
new_renderHand = """    renderHand() {
        const me = this.players.find(p => p.id === this.myId);
        this.elMyHand.innerHTML = '';

        if (!me || !me.hand) return;

        const count = me.hand.length;

        me.hand.forEach((card, index) => {
            const el = document.createElement('div');

            // Hardcode to exact CSS classes for perfect match
            let positionClass = `card${(index % 10) + 1}`;

            const isHidden = this.isSpectator || me.surrendered;

            if (isHidden) {
                el.className = `playing-card ${positionClass} back`;
                el.style.background = "#222";
            } else {
                let colorClass = card.color;
                if(colorClass === 'yellow') colorClass = 'orange'; // CSS uses orange for yellow

                el.className = `playing-card ${positionClass} ${colorClass}`;
                let content = card.type === 'number' ? card.value : this.getIconForType(card.type);

                let mainSuit = this.getSuitIcon(colorClass);
                let tinySuit = this.getTinySuitForType(card.type, mainSuit);

                let sizeClass = (card.type === '+2' || card.type === 'skip') ? 'mid' : 'big';
                let midSuit = (card.type === '+2') ? '✚' : ((card.type === 'skip') ? '⊖' : mainSuit);

                el.innerHTML = `
                    <div class="card-top-left ${colorClass}">
                        <span class="num">${content}</span>
                        <span class="tiny-suit">${tinySuit}</span>
                    </div>
                    <div class="${sizeClass} ${colorClass}">${midSuit}</div>
                `;
            }

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

# 4. Update `renderGameNodes` EXACTLY matching the user's template
new_renderGameNodes = """    renderGameNodes() {
        this.elPlayerNodesContainer.innerHTML = '';

        let myIndex = this.players.findIndex(p => p.id === this.myId);
        if (myIndex === -1) myIndex = 0;

        const totalPlayers = this.players.length;

        const getPositionClass = (offset, total) => {
            if (offset === 0) return 'p-bottom';
            if (total === 2) { return offset === 1 ? 'p-top' : 'p-bottom'; }
            if (total === 3) { return offset === 1 ? 'p-left-top' : 'p-right-top'; }
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
            if (this.players[this.turnIndex]?.id === p.id) el.classList.add('active-turn');

            const avatarHtml = p.surrendered ? "🏳️" : `<img src="${p.avatar}" alt="${this.escapeHtml(p.name)}">`;

            let innerHtml = `
                <div class="avatar">${avatarHtml}</div>
                <div class="badge">${p.cardsCount || 0}</div>
                <div class="name">${this.escapeHtml(p.name)}</div>
            `;

            if (this.players[this.turnIndex]?.id === p.id && !p.isBot) {
                innerHtml += `<div class="turn-timer" id="timer-${p.id}">10</div>`;
            }

            if (p.isOnline === false || p.surrendered) el.style.opacity = '0.5';

            el.innerHTML = innerHtml;
            this.elPlayerNodesContainer.appendChild(el);
        }
    }"""

content = re.sub(
    r"    renderGameNodes\(\) \{.*?(?=    updateArrows\()",
    new_renderGameNodes + "\n\n",
    content,
    flags=re.DOTALL
)

# 5. Restore user's exact arrows logic
new_updateArrows = """    updateArrows() {
        const arrowsContainer = document.getElementById('direction-arrows');
        if (!arrowsContainer) return;
        if (this.direction === 1) {
            arrowsContainer.innerHTML = `
                <div class="arrows"><div class="arrow">««««</div></div>
                <div class="arrows left"><div class="arrow small">««««</div></div>
                <div class="arrows right"><div class="arrow small">««««</div></div>
                <div class="arrows bottom"><div class="arrow">»»»»</div></div>
            `;
        } else {
            arrowsContainer.innerHTML = `
                <div class="arrows"><div class="arrow">»»»»</div></div>
                <div class="arrows left"><div class="arrow small">»»»»</div></div>
                <div class="arrows right"><div class="arrow small">»»»»</div></div>
                <div class="arrows bottom"><div class="arrow">««««</div></div>
            `;
        }
    }"""

content = re.sub(
    r"    updateArrows\(\) \{.*?(?=    // ==========================================)",
    new_updateArrows + "\n\n",
    content,
    flags=re.DOTALL
)

# 6. Update chat rendering
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
        setTimeout(() => { this.elGameChatHistory.scrollTop = this.elGameChatHistory.scrollHeight; }, 100);
    }"""

content = re.sub(
    r"    renderChat\(chatObj\) \{.*?(?=    async quitGame\()",
    new_renderChat + "\n\n",
    content,
    flags=re.DOTALL
)

with open('js/ono.js', 'w') as f:
    f.write(content)
