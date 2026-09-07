# 版本更新日志

## V03_20260907

**分支：** \main\ ｜ **日期：** 2026-09-07

### 1. MP_Yield 字段重命名为 CP_Yield
- 全局替换了后端 API 路由、解析器以及前端 Vue 页面中原有的 \MP_Yield\ 字段为 \CP_Yield\，确保与实际业务术语一致。
- 对数据库历史数据进行迁移，修复由于数据类型映射问题导致的 CP 明细在页面中丢失或无法正常查询的缺陷。

### 2. 修复 UCD FT 良率解析问题
- 优化了 \ucd_ft_parser.py\ 针对良率（Yield）列的识别规则，排除包含 \Yield TYPE\ 等字样的干扰列。
- 新增良率回退计算机制（Fallback calculation）：当表单中 Yield 数据缺失或无效时，系统会自动利用 \Pass / Total\ 计算良率，修复了 UCD FT 良率为 0 的问题。
- 已自动对数据库中历史缺失良率记录进行数据修正。

### 3. 增强页面筛选框交互
- 修正 \FtYieldView.vue\ 与 \DataAnalysisView.vue\ 中 AG Grid 浮动筛选框（Floating Filter）的过滤逻辑。
- 监听 \@filter-changed\，用户在表头下方的各列筛选框（如 OSAT、Device、LOT ID 等）中输入条件时，自动触发后端全库检索（取代之前的纯本地过滤）。

## V02_20260906

**分支：** `main` ｜ **日期：** 2026-09-06

### 1. 新增 FT 良率分析模块
- 新增 `FtYieldView.vue` 和 `FtYieldSylView.vue`，独立管理 FT 良率分析与 SYL/SBL 设定。
- 后端新增 `/api/lots/ft-yield/*` 相关接口、`FtYieldSylSession` 数据模型。
- 新增 UCD 与 CMC 厂 FT 数据解析器（支持 Package、Wafer ID、Stage/温度等专属字段）。

### 2. 优化 SYL/SBL 分析与展现逻辑
- CP 与 FT 的明细页“SYL超标”按钮升级为**三态切换模式**（关闭 -> 标记但不隐藏 -> 仅显示超标），并解决状态切换失效问题。
- 在无任何筛选条件时，自动禁用 SYL 分析，防止整表低效渲染。
- 修复后端 SYL 设定时间的时区偏差问题，底层强制偏移+8小时确保与北京时间对齐。

### 3. Excel 导出功能优化
- 新增动态过滤空列机制，Excel 导出时自动隐藏所有值为 0 的无用 Bin 列，让报表更清爽。
- 修复 `StreamingResponse` 等组件缺失导致的导出崩溃问题，并统一前后端下载文件命名规则。

### 4. 完善设备与厂区映射（Profile配置）
- 个人中心（Profile）新增了 OSAT 厂房设备映射字典模块的前后端代码。

**变更统计：** 22 文件，+4736 / -27

## V01_20260818

**提交：** `edf4d04` ｜ **分支：** `main` ｜ **日期：** 2026-08-18

### 1. 优化参数分析页面：SITE 控件全局化

- SITE 控件（ALL / S1–SN）提升为全局控件，同时控制当前参数视图与 VS 对比视图，一处操作、两侧联动。
- 进入 VS 对比模式后，右侧面板不再重复显示独立的 SITE 控件，消除重复操作与两侧不同步的困扰。
- Scatter 散点图改为默认显示（打开参数页即渲染，无需手动勾选）。

### 2. 修复 Excel 导出功能

- 下载文件名改用后端返回的规范名（含 `.zip`），避免前端固定 `.xlsx` 导致文件类型不符。
- 引入 matplotlib 绘图线程锁，解决多任务并发导出时绘图错乱/崩溃问题。
- 导出接口新增 `site_mode` 参数，支持按站点模式导出。

**变更统计：** 3 文件，+448 / -117

| 文件 | 增 | 删 |
|------|----|----|
| `frontend/src/views/ParamView.vue` | +320 | -75 |
| `backend/app/api/routes/analysis.py` | +123 | -42 |
| `frontend/src/views/AnalysisView.vue` | +4 | -1 |
