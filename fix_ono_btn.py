import re

with open('js/ono.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace the block that hides the ONO button
old_btn_code = """        if (!this.isSpectator && !me.surrendered && count === 2 && !me.hasSaidOno) {
            this.elBtnOno.classList.remove('hidden');
        } else {
            this.elBtnOno.classList.add('hidden');
        }"""

new_btn_code = """        if (!this.isSpectator && !me.surrendered) {
            this.elBtnOno.classList.remove('hidden');
        } else {
            this.elBtnOno.classList.add('hidden');
        }"""

js = js.replace(old_btn_code, new_btn_code)

with open('js/ono.js', 'w', encoding='utf-8') as f:
    f.write(js)
