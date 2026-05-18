import re

with open('js/ono.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace the hand math block
old_hand_code = """
            if (displayCount > 1) {
                const fraction = index / (displayCount - 1);
                // Angle goes from -totalAngle/2 to +totalAngle/2
                rotate = -totalAngle / 2 + fraction * totalAngle;
                // left position goes from 0% to ~80%
                left = (index / (displayCount - 1)) * 80;
                // Parabola shape for translateY
                const centeredIndex = index - (displayCount - 1) / 2;
                translateY = Math.abs(centeredIndex) * 2;
            } else {
                left = 40;
            }"""

# New hand math: cluster them in the middle like a fan
# We'll use a fixed overlap width for each card, centered around 40% (since card width is 22%, center is ~39%)
# We can offset left by a small amount per card
new_hand_code = """
            if (displayCount > 1) {
                const fraction = index / (displayCount - 1);
                rotate = -totalAngle / 2 + fraction * totalAngle;

                // fan width depends on number of cards. Max fan width = 60%.
                const maxFanWidth = Math.min(60, displayCount * 8);
                const startLeft = 39 - (maxFanWidth / 2);
                left = startLeft + (fraction * maxFanWidth);

                const centeredIndex = index - (displayCount - 1) / 2;
                translateY = Math.abs(centeredIndex) * 2;
            } else {
                left = 39;
            }"""

js = js.replace(old_hand_code, new_hand_code)

with open('js/ono.js', 'w', encoding='utf-8') as f:
    f.write(js)
