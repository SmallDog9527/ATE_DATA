import re

filepath = /home/ATE_DATA/ATE_SERVER/frontend/src/views/HomeView.vue
with open(filepath, r, encoding=utf-8) as f:
    content = f.read()

print(File length:, len(content))
m1 = re.search(rconst filteredLots = computed\(\(\) => \{[\s\S]*?\n\}\), content)
if m1:
    print(Found filteredLots match!)
else:
    print(filteredLots match not found)

