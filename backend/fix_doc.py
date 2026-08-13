with open('/app/app/api/routes/programs.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('"n"n"Run program changes snapshot update for ang products or specified product."""', '"""Run program changes snapshot update for ang products or specified product.""")
text = text.replace('"""Run program changes snapshot update for ang products or specified product."""', '"""Run program changes snapshot update for all products or specified product.""")

with open('/app/app/api/routes/programs.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed docstring successfully.")