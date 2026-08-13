with open('/app/app/api/routes/programs.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('            continue\n            continue', '            continue')

with open('/app/app/api/routes/programs.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Cleaned double continue.")
