import re

with open('js/ono.js', 'r') as f:
    content = f.read()

# Update getIconForType to match the user's HTML design
new_getIconForType = """    getIconForType(type) {
        switch(type) {
            case 'skip': return '⊖';
            case 'reverse': return '⇄';
            case '+2': return '+';
            case 'wild': return '🌈';
            case 'wild+4': return '+4';
            default: return '';
        }
    }

    getTinySuitForType(type, suit) {
        if(type === '+2') return '✚';
        if(type === 'skip') return '⊖';
        return suit;
    }"""

content = re.sub(
    r"    getIconForType\(type\) \{.*?(?=    renderHand\(\) \{)",
    new_getIconForType + "\n\n",
    content,
    flags=re.DOTALL
)

# Rewrite renderHand to use card1..card10 explicitly for perfect match, then fallback if > 10
new_renderHand = """    renderHand() {
        const me = this.players.find(p => p.id === this.myId);
        this.elMyHand.innerHTML = '';

        if (!me || !me.hand) return;

        const count = me.hand.length;

        me.hand.forEach((card, index) => {
            const el = document.createElement('div');

            // Hardcode to exact CSS classes if possible for perfect match
            let positionClass = '';
            if (count <= 10) {
                 positionClass = `card${index + 1}`;
            } else {
                 // Fallback for > 10 cards using math
                 positionClass = `card${(index % 10) + 1}`;
            }

            const isHidden = this.isSpectator || me.surrendered;

            if (isHidden) {
                el.className = `playing-card ${positionClass} back`;
                el.style.background = "#222";
            } else {
                let colorClass = card.color;
                if(colorClass === 'yellow') colorClass = 'orange'; // CSS uses orange for yellow

                el.className = `playing-card ${positionClass} ${colorClass} ${card.type}`;
                let content = card.type === 'number' ? card.value : this.getIconForType(card.type);

                let mainSuit = this.getSuitIcon(colorClass);
                let tinySuit = this.getTinySuitForType(card.type, mainSuit);

                // +2 uses 'mid', skip uses 'mid', others use 'big' in their design
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

            // Remove dynamic inline styles so the exact CSS matches 100%
            if (count <= 10) {
               // Let CSS handle it
               el.style.left = '';
               el.style.transform = '';
               el.style.zIndex = '';
            } else {
               // We only override if it's > 10 to fit them
               const maxAngle = 34;
               const step = maxAngle / (count - 1);
               const startAngle = -maxAngle / 2;
               const angle = startAngle + (step * index);
               let x_val = (index - (count - 1) / 2) / ((count - 1) / 2);
               const translateY = Math.pow(x_val, 2) * 18;
               const leftPercent = (index / (count - 1)) * 79;

               el.style.left = `${leftPercent}%`;
               el.style.transform = `rotate(${angle}deg) translateY(${translateY}%)`;
               el.style.zIndex = index + 1;
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

with open('js/ono.js', 'w') as f:
    f.write(content)
