import re

with open('ono.html', 'r') as f:
    html = f.read()

# Remove the two external stylesheets completely
html = re.sub(r'<link rel="stylesheet" href="css/style\.css">\s*', '', html)
html = re.sub(r'<link rel="stylesheet" href="css/ono\.css">\s*', '', html)

# In order to keep modals working, let's inject ONLY the modal CSS and lobby CSS
# but wrapped securely so it doesn't bleed. Actually, it's easier to just read the needed parts from style.css/ono.css
# But let's just write minimal functional CSS for the modals here so it doesn't affect `body`, `html`, `.card`, etc.

minimal_modal_css = """
  <style id="minimal-modals">
    .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal.hidden { display: none; }
    .modal-content { background: #1a202c; padding: 20px; border-radius: 12px; color: #fff; width: 80%; max-width: 400px; text-align: center; font-family: 'Almarai', sans-serif;}
    .modal-header { font-size: 1.2rem; font-weight: bold; margin-bottom: 15px; }
    .color-options { display: flex; gap: 10px; justify-content: center; }
    .color-option { width: 50px; height: 50px; border-radius: 50%; cursor: pointer; border: 2px solid #fff; }
    .color-red { background: #e74c3c; } .color-blue { background: #3498db; } .color-green { background: #2ecc71; } .color-yellow { background: #f1c40f; }
    .btn-primary { background: #3498db; border: none; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin: 5px; }
    .btn-secondary { background: #7f8c8d; border: none; color: white; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin: 5px; }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2ecc71; color: white; padding: 10px 20px; border-radius: 8px; z-index: 1001; }
    .toast.hidden { display: none; }
    /* Minimal lobby */
    #section-lobby { position: absolute; inset: 0; background: #0b2c86; z-index: 999; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; font-family: 'Almarai', sans-serif;}
    #section-lobby.hidden { display: none; }
    .player-slots-container { margin: 20px 0; }
    .player-slots { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 300px; }
    .player-slot { width: 60px; height: 80px; border: 1px dashed rgba(255,255,255,0.3); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.8rem; }
    .player-slot img { width: 40px; height: 40px; border-radius: 50%; }
    .btn-start { background: #2ecc71; border: none; padding: 15px 30px; font-size: 1.2rem; font-weight: bold; border-radius: 12px; color: #fff; cursor: pointer; margin-bottom: 10px; }
    .btn-start.disabled { opacity: 0.5; pointer-events: none; }
    .btn-match, .btn-invite { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 8px; color: #fff; cursor: pointer; }
    .room-id-display { margin: 10px 0; font-size: 1.2rem; }
    .system-banner { color: #f1c40f; margin-bottom: 20px; }
  </style>
"""

# Inject minimal modal css
html = html.replace('<!-- Original stylesheets needed for modals and lobby -->', minimal_modal_css)

with open('ono.html', 'w') as f:
    f.write(html)
