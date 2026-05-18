import re

with open('ono.html', 'r') as f:
    html = f.read()

# Make section-game the phone div directly, or remove #section-game wrap
# so .phone is exactly body child. Let's make .phone the section-game.
html = html.replace('<section id="section-game" class="hidden">', '')
html = html.replace('</section>', '', 1) # remove the first closing section
html = html.replace('<div class="phone">', '<div class="phone hidden" id="section-game">')

# Re-apply exact arrows HTML because JS might have manipulated it
exact_arrows = """
      <div id="direction-arrows">
        <div class="arrows"><div class="arrow">««««</div></div>
        <div class="arrows left"><div class="arrow small">««««</div></div>
        <div class="arrows right"><div class="arrow small">««««</div></div>
        <div class="arrows bottom"><div class="arrow">»»»»</div></div>
      </div>
"""

html = re.sub(r'<div id="direction-arrows">.*?</div>\s*</div>', exact_arrows, html, flags=re.DOTALL)

with open('ono.html', 'w') as f:
    f.write(html)
