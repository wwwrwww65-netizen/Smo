import re

with open('ono.html', 'r') as f:
    content = f.read()

# Add !important to center-stack related classes and card-top to prevent bleed from ono.css
content = content.replace('.center-stack{', '.center-stack{border: none !important; ')
content = content.replace('.halo{', '.halo{border: none !important; ')
content = content.replace('.card-top{', '.card-top{background: #fff !important; ')

with open('ono.html', 'w') as f:
    f.write(content)
