with open('/app/app/api/routes/programs.py', 'r') as f:
    text = f.read()
start = text.find('def _build_data_program_list(')
end = text.find('@router.get("/data_list/')
print(text[start:end])
