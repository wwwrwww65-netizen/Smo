import re

with open('js/ono.js', 'r') as f:
    content = f.read()

# Update updateArrows to toggle classes or use the new design logic
new_updateArrows = """    updateArrows() {
        // Find the arrows container
        const arrowsContainer = document.getElementById('direction-arrows');
        if (!arrowsContainer) return;

        // Let's use the actual elements from the user's HTML design
        // We just need to reverse the direction visually if direction === -1
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

with open('js/ono.js', 'w') as f:
    f.write(content)
