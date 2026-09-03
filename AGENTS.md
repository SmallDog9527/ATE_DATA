# Agent Instructions

## Response Completion
After completing any requested task or command execution, end the final response with:

喵~已完成~~

## Workflow & Development Guidelines
- **任务执行流程 (Workflow)**: 每次任务必须按以下流程执行：
  1. **先查原因**: 深入排查问题根源，在此期间绝对不要修改任何代码。
  2. **提出修改计划**: 查完原因后，向用户汇报具体原因以及计划如何修改，并提供清晰的修改方案。
  3. **等待用户授权**: 仅在用户确认同意修改计划后，才可以着手修改代码。
- **英文备注规则**: 除前端项目外，所有后端代码注释、系统日志描述以及写入数据库的各种状态/错误备注（如 FTP 上传/解析失败等记录）必须全部使用英文表达，禁止出现中文。
- **临时脚本存放规则**: 如果只是临时脚本，统一放在 `backend/temp` 目录下面，并且不要上传 Gitee。
- **Gitee 提交规则**: 当用户说“推送到gitee”时，必须先将本次所有的变更内容整理更新到版本信息中，并向用户汇报展示更新后的版本号与变更明细。仅在用户再次确认同意后，才可以执行 `git commit` 和 `git push` 推送到 Gitee 远端。平时在完成代码修改后，只需在服务器本地保存并使之生效即可，绝对不要主动执行提交或推送。

## Tool Calling Rules & Parameter Constraints
- When invoking ANY tool, you MUST strictly check the tool's parameter schema and provide ALL required properties:
  - When using terminal/shell execution tools (`pwsh` / `bash`):
    - `command` (required): The exact command string to execute. NEVER omit this.
    - `description` (required): A clear, concise summary of what the command does.
  - When using code execution tools (`run_code`):
    - `code` (required): The complete body of the TypeScript/JavaScript async function. NEVER omit this.
    - `description` (required): A short description of what the code does.
  - When using file tools (`read`, `write`, `edit`):
    - `file_path` (required): The path to the file.
    - `content` (for `write`): The full UTF-8 text content.
    - `old_string` and `new_string` (for `edit`): The exact text to replace.
- NEVER submit partial or empty arguments. If a tool call fails with a validation error, do not retry with the same missing parameter; check the schema and supply all required fields.