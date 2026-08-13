path = "/app/app/api/routes/programs.py"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx_1 = None
end_idx_1 = None
for i, line in enumerate(lines):
    if line.startswith("def _build_data_program_list("):
        start_idx_1 = i
    if start_idx_1 is not None and i > start_idx_1 and line.startswith('arouter.get("/data_list/'):
        end_idx_1 = i
        break

start_idx_2 = None
for i, line in enumerate(lines):
    if line.startswith("def update_all_program_changes_snapshot("):
        start_idx_2 = i
        break

print(f"Func 1 range: {start_idx_1} to {start_idx_1}")
print(f"Func 2 start: {start_idx_2}")
