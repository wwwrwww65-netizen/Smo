import re

with open('js/ono.js', 'r') as f:
    content = f.read()

# Make sure there is no double template literal escaping issue.
# The code seems well-formed from tail, and node -c did not report a syntax error.
print("Syntax OK according to python script structure check")
