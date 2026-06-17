<template>
  <div class="pgs-page">
    <!-- ══ 顶部 Header ══ -->
    <div class="page-header">
      <div class="header-left">
        <div class="breadcrumb">
          <span class="bc-link" @click="router.push('/program-changes')">📝 程序变更</span>
          <span class="bc-sep">›</span>
          <span class="bc-link" @click="router.push(`/program-changes/${productName}`)">{{ productName }}</span>
          <span class="bc-sep">›</span>
          <span class="bc-current">{{ currentPgs?.program_version ?? currentPgs?.filename ?? `PGS #${currentId}` }}</span>
          <span v-if="currentPgs?.pgs_version" class="ver-badge">v{{ currentPgs.pgs_version }}</span>
          <button
            class="vs-btn"
            :class="{ 'vs-active': vsMode, 'vs-disabled': vsToggleBusy }"
            :disabled="vsToggleBusy"
            @click="toggleVsMode"
            title="点击再次退出对比"
          >⚡ VS</button>
          <!-- VS 模式：对比版本选择内联在 Header -->
          <template v-if="vsMode">
            <span class="vs-sep">｜</span>
            <span class="vs-inline-label">对比：</span>
            <select
              v-if="!isDataProgram"
              class="vs-source-select-inline"
              v-model="vsTargetSource"
              @change="onVsSourceChange"
            >
              <option value="pgm">PGM</option>
              <option value="data">DATA</option>
            </select>
            <select class="vs-select-inline" v-model="vsTargetId" @change="onVsTargetChange">
              <option value="" disabled>请选择程序版本</option>
              <option v-for="p in vsProgramList" :key="`${vsTargetSource}-${p.id}`" :value="p.id">
                {{ p.program_version ?? p.filename }}
              </option>
            </select>
            <span v-if="vsLoading" class="vs-loading-tip">⏳</span>
          </template>
          <div class="pgs-tabs">
            <button class="ptab" :class="{ 'ptab-active': tab === 'param' }" @click="tab = 'param'">Param</button>
            <button class="ptab" :class="{ 'ptab-active': tab === 'summary' }" @click="tab = 'summary'">Summary</button>
            <button v-if="!isDataProgram" class="ptab" :class="{ 'ptab-active': tab === 'cpp' }" @click="switchTab('cpp')">cpp</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ 全局 Loading ══ -->
    <div v-if="loading" class="loading-mask">⏳ 加载中...</div>

    <template v-else>
      <!-- VS 对比版本选择已移至 Header 内联 -->

      <!-- ══ Param 页 - 正常模式 ══ -->
      <div v-if="tab === 'param' && !vsMode" class="pgs-body">
        <div class="info-bar">
          <span>共 <strong>{{ params.length }}</strong> 个测试项</span>
          <template v-if="hasQaData">
            <span class="qa-info-sep">|</span>
            <span class="qa-info-tag">QA</span>
            <span class="qa-info-text">
              QA 重测项 <strong>{{ params.filter(p => p.is_qa).length }}</strong> 个 &nbsp;·&nbsp;
              <span class="qa-dot init-dot"></span>初测行显示对应 QA Limit&nbsp;
              <span class="qa-dot qa-row-dot"></span>蓝色行为 QA 重测数据
            </span>
            <span class="qa-info-sep">|</span>
            <button
              class="qa-alert-filter-btn"
              :class="{ 'qa-alert-active': qaAlertFilter }"
              @click="qaAlertFilter = !qaAlertFilter"
            >
              <span class="alert-dot"></span>
              QA Limit 比 FT 更严
              <span v-if="hasNonBin4QaAlert" class="qa-bin-alert">QA不是Bin4</span>
              <span v-if="qaAlertFilter" class="filter-badge">✕ 清除筛选</span>
            </button>
          </template>
          <input v-model="paramFilter" placeholder="🔍 过滤 Param / Function..." class="filter-input" />
        </div>
        <div class="table-wrap">
          <table class="param-tbl">
            <thead>
              <tr>
                <th class="col-no">#</th>
                <th class="col-func">Function</th>
                <th class="col-sym">Param</th>
                <th class="col-num">Min</th>
                <th class="col-num">Max</th>
                <th class="col-unit">Unit</th>
                <th class="col-bin">SWBin</th>
                <th class="col-bin">HWBin</th>
                <template v-if="hasQaData">
                  <th class="col-num col-qa-hdr">QA_MIN</th>
                  <th class="col-num col-qa-hdr qa-max-col">QA_MAX</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in filteredParams"
                :key="p.row_no"
                class="param-row"
                :class="{ 'qa-row': p.is_qa }"
              >
                <td class="col-no">{{ p.row_no }}</td>
                <td class="col-func" :class="{ 'qa-func': p.is_qa }">{{ p.function }}</td>
                <td class="col-sym" :class="{ 'qa-sym': p.is_qa }">{{ p.symbol }}</td>
                <!-- 对 QA 行：min/max 是 QA 测试 Limit，比 FT 更严则红底，相同则淡紫 -->
                <td
                  class="col-num limit-cell"
                  :class="{
                    'qa-alert-cell': p.is_qa && isQaMinRedRow(p),
                    'qa-same-cell':  p.is_qa && isQaMinSameRow(p)
                  }"
                >{{ fmtLimit(p.min) }}</td>
                <td
                  class="col-num limit-cell"
                  :class="{
                    'qa-alert-cell': p.is_qa && isQaMaxRedRow(p),
                    'qa-same-cell':  p.is_qa && isQaMaxSameRow(p)
                  }"
                >{{ fmtLimit(p.max) }}</td>
                <td class="col-unit">{{ p.unit }}</td>
                <td class="col-bin">{{ p.sw_bin ?? '' }}</td>
                <td class="col-bin">{{ p.hw_bin ?? '' }}</td>
                <template v-if="hasQaData">
                  <!-- QA_MIN 列：非QA行显示参考值，比FT更严则红底，相同则淡紫 -->
                  <td
                    class="col-num qa-limit-cell"
                    :class="{
                      'qa-limit-self': p.is_qa,
                      'qa-limit-ref':  !p.is_qa && p.qa_min != null,
                      'qa-alert-cell': !p.is_qa && isQaMinRedRef(p),
                      'qa-same-cell':  !p.is_qa && isQaMinSameRef(p)
                    }"
                  >{{ fmtLimit(p.qa_min) }}</td>
                  <!-- QA_MAX 列 -->
                  <td
                    class="col-num qa-limit-cell qa-max-col"
                    :class="{
                      'qa-limit-self': p.is_qa,
                      'qa-limit-ref':  !p.is_qa && p.qa_max != null,
                      'qa-alert-cell': !p.is_qa && isQaMaxRedRef(p),
                      'qa-same-cell':  !p.is_qa && isQaMaxSameRef(p)
                    }"
                  >{{ fmtLimit(p.qa_max) }}</td>
                </template>
              </tr>
              <tr v-if="!filteredParams.length">
                <td :colspan="hasQaData ? 10 : 8" class="td-empty">无匹配数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ══ Param 页 - VS 对比模式 ══ -->
      <div v-if="tab === 'param' && vsMode" class="pgs-body">
        <div class="info-bar">
          <div class="vs-filters">
            <button class="vs-f-btn vs-f-added"   :class="{ 'vs-f-active': vsFilter.added   }" @click="setVsFilter('added')"  >■ 新增({{ vsStats.added }})</button>
            <button class="vs-f-btn vs-f-removed" :class="{ 'vs-f-active': vsFilter.removed }" @click="setVsFilter('removed')">■ 删除({{ vsStats.removed }})</button>
            <button class="vs-f-btn vs-f-loose"   :class="{ 'vs-f-active': vsFilter.loose   }" @click="setVsFilter('loose')"  >■ Limit放宽({{ vsStats.loose }})</button>
            <button class="vs-f-btn vs-f-tight"   :class="{ 'vs-f-active': vsFilter.tight   }" @click="setVsFilter('tight')"  >■ Limit收紧({{ vsStats.tight }})</button>
            <button class="vs-f-btn vs-f-diff"    :class="{ 'vs-f-active': vsFilter.diff    }" @click="setVsFilter('diff')"   >≠ 显示不同</button>
          </div>
          <input v-model="paramFilter" placeholder="🔍 过滤 Param / Function..." class="filter-input" />
        </div>

        <div v-if="vsLoading" class="loading-mask">⏳ 加载对比程序数据...</div>

        <div v-else-if="!vsTargetId" class="vs-empty-hint">
          <span>👆 请在上方选择要对比的程序版本</span>
        </div>

        <div v-else class="vs-table-container">
          <div class="table-wrap">
            <table class="vs-tbl">
              <thead>
                <!-- 程序名标题行：colspan 与列对齐 -->
                <tr class="vs-prog-row">
                  <th colspan="8" class="vs-prog-th vs-prog-th-left">
                    <span class="vs-prog-badge new-badge">当前</span>
                    <span class="vs-prog-name">{{ currentPgs?.program_version ?? currentPgs?.filename }}</span>
                  </th>
                  <th class="vs-mid-col"></th>
                  <th colspan="8" class="vs-prog-th vs-prog-th-right">
                    <span class="vs-prog-badge old-badge">对比</span>
                    <span class="vs-prog-name">{{ vsTargetPgs?.program_version ?? vsTargetPgs?.filename }}</span>
                  </th>
                </tr>
                <tr>
                  <th class="col-no">#</th>
                  <th class="col-func">Function</th>
                  <th class="col-sym">Param</th>
                  <th class="col-num">Min</th>
                  <th class="col-num">Max</th>
                  <th class="col-unit">Unit</th>
                  <th class="col-bin">SW</th>
                  <th class="col-bin">HW</th>
                  <th class="vs-mid-col"></th>
                  <th class="col-no">#</th>
                  <th class="col-func">Function</th>
                  <th class="col-sym">Param</th>
                  <th class="col-num">Min</th>
                  <th class="col-num">Max</th>
                  <th class="col-unit">Unit</th>
                  <th class="col-bin">SW</th>
                  <th class="col-bin">HW</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in filteredVsRows"
                  :key="i"
                  class="vs-row"
                  :class="[vsRowClass(row), { 'vs-qa-row': isVsQaRow(row) }]"
                >
                  <!-- 左侧（当前程序） -->
                  <template v-if="row.left">
                    <td class="col-no">{{ row.left.row_no }}</td>
                    <td class="col-func" :class="{ 'vs-deleted': row.type === 'removed' }">{{ row.left.function }}</td>
                    <td class="col-sym" :class="{ 'vs-deleted': row.type === 'removed' }">{{ row.left.symbol }}</td>
                    <td class="col-num" :class="leftMinClass(row)">{{ fmtLimit(row.left.min) }}</td>
                    <td class="col-num" :class="leftMaxClass(row)">{{ fmtLimit(row.left.max) }}</td>
                    <td class="col-unit">{{ row.left.unit }}</td>
                    <td class="col-bin" :class="{ 'bin-changed': row.right && row.left.sw_bin !== row.right.sw_bin }">{{ row.left.sw_bin ?? '' }}</td>
                    <td class="col-bin" :class="{ 'bin-changed': row.right && row.left.hw_bin !== row.right.hw_bin }">{{ row.left.hw_bin ?? '' }}</td>
                  </template>
                  <template v-else>
                    <td colspan="8" class="vs-empty-side">—</td>
                  </template>

                  <!-- 中间分隔列 -->
                  <td class="vs-mid-col"></td>

                  <!-- 右侧（对比程序） -->
                  <template v-if="row.right">
                    <td class="col-no">{{ row.right.row_no }}</td>
                    <td class="col-func" :class="{ 'vs-deleted': row.type === 'removed' }">{{ row.right.function }}</td>
                    <td class="col-sym" :class="{ 'vs-deleted': row.type === 'removed' }">{{ row.right.symbol }}</td>
                    <td class="col-num">{{ fmtLimit(row.right.min) }}</td>
                    <td class="col-num">{{ fmtLimit(row.right.max) }}</td>
                    <td class="col-unit">{{ row.right.unit }}</td>
                    <td class="col-bin">{{ row.right.sw_bin ?? '' }}</td>
                    <td class="col-bin">{{ row.right.hw_bin ?? '' }}</td>
                  </template>
                  <template v-else>
                    <td colspan="8" class="vs-empty-side">—</td>
                  </template>
                </tr>
                <tr v-if="!filteredVsRows.length">
                  <td colspan="17" class="td-empty">无匹配数据</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ══ Summary 页 ══ -->
      <div v-if="tab === 'summary'" class="pgs-body">
        <div class="info-bar">
          <template v-if="vsMode && vsTargetId">
            当前 <strong>{{ sortedSummary.length }}</strong> 个 Bin
            <span class="qa-info-sep">|</span>
            对比 <strong>{{ sortedVsSummary.length }}</strong> 个 Bin
          </template>
          <template v-else>
            共 <strong>{{ displaySummaryRows.length }}</strong> 个 Bin
            <template v-if="isDataProgram && dataSummaryStandard?.mode === 'pgm'">
              <span class="qa-info-sep">|</span>
              PGM Summary
              <strong :class="dataSummaryStandard.pass ? 'summary-pass' : 'summary-fail'">
                {{ dataSummaryStandard.pass ? 'PASS' : 'DIFF' }}
              </strong>
            </template>
            <template v-else-if="isDataProgram && dataSummaryStandard?.mode === 'expanded'">
              <span class="qa-info-sep">|</span>
              No PGM Standard
            </template>
          </template>
        </div>
        <div v-if="vsMode && vsLoading" class="loading-mask">⏳ 加载对比 Summary...</div>
        <div v-else-if="vsMode && !vsTargetId" class="vs-empty-hint">
          <span>👆 请在上方选择要对比的程序版本</span>
        </div>
        <div v-else-if="vsMode" class="table-wrap">
          <table class="vs-tbl summary-vs-tbl">
            <thead>
              <tr class="vs-prog-row">
                <th colspan="4" class="vs-prog-th vs-prog-th-left">
                  <span class="vs-prog-badge new-badge">当前</span>
                  <span class="vs-prog-name">{{ currentPgs?.program_version ?? currentPgs?.filename }}</span>
                </th>
                <th class="vs-mid-col"></th>
                <th colspan="4" class="vs-prog-th vs-prog-th-right">
                  <span class="vs-prog-badge old-badge">对比</span>
                  <span class="vs-prog-name">{{ vsTargetPgs?.program_version ?? vsTargetPgs?.filename }}</span>
                </th>
              </tr>
              <tr>
                <th class="col-bin">SWBin</th>
                <th class="col-bin">HWBin</th>
                <th>Bin Name</th>
                <th>SBL管控</th>
                <th class="vs-mid-col"></th>
                <th class="col-bin">SWBin</th>
                <th class="col-bin">HWBin</th>
                <th>Bin Name</th>
                <th>SBL管控</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in summaryVsRows" :key="i" class="vs-row">
                <template v-if="row.left">
                  <td class="col-bin">{{ row.left.sw_bin }}</td>
                  <td class="col-bin" :class="{ 'bin-changed': row.right && row.left.hw_bin !== row.right.hw_bin }">{{ row.left.hw_bin }}</td>
                  <td :class="{ 'bin-changed': isSummaryBinNameChanged(row) }">{{ row.left.bin_name }}</td>
                  <td>
                    <template v-if="row.left.sw_bin == 3">
                      <input class="sbl-input" v-model="sblInputText" placeholder="BIN5≥0.5%..." style="width: 150px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 4px;" @keyup.enter="parseSbl" />
                      <button class="btn btn-primary btn-sm" style="margin-left:4px" @click="parseSbl">解析</button>
                    </template>
                    <template v-else>
                      {{ sblLimits[row.left.hw_bin] ?? '' }}
                    </template>
                  </td>
                </template>
                <template v-else>
                  <td colspan="4" class="vs-empty-side">—</td>
                </template>
                <td class="vs-mid-col"></td>
                <template v-if="row.right">
                  <td class="col-bin">{{ row.right.sw_bin }}</td>
                  <td class="col-bin">{{ row.right.hw_bin }}</td>
                  <td :class="{ 'bin-changed': isSummaryBinNameChanged(row) }">{{ row.right.bin_name }}</td>
                  <td>{{ sblLimits[row.right.hw_bin] ?? '' }}</td>
                </template>
                <template v-else>
                  <td colspan="4" class="vs-empty-side">—</td>
                </template>
              </tr>
              <tr v-if="!summaryVsRows.length">
                <td colspan="9" class="td-empty">无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="isDataProgram && dataSummaryStandard?.mode === 'pgm'" class="table-wrap">
          <table class="vs-tbl summary-vs-tbl">
            <thead>
              <tr class="vs-prog-row">
                <th colspan="4" class="vs-prog-th vs-prog-th-left">
                  <span class="vs-prog-badge new-badge">Current</span>
                  <span class="vs-prog-name">{{ currentPgs?.program_version ?? currentPgs?.filename }}</span>
                </th>
                <th class="vs-mid-col"></th>
                <th colspan="4" class="vs-prog-th vs-prog-th-right">
                  <span class="vs-prog-badge old-badge">PGM</span>
                  <span class="vs-prog-name">{{ dataSummaryStandard.reference?.program_version ?? dataSummaryStandard.reference?.filename }}</span>
                </th>
              </tr>
              <tr>
                <th class="col-bin">SWBin</th>
                <th class="col-bin">HWBin</th>
                <th>Bin Name</th>
                <th>SBL管控</th>
                <th class="vs-mid-col"></th>
                <th class="col-bin">SWBin</th>
                <th class="col-bin">HWBin</th>
                <th>Bin Name</th>
                <th>SBL管控</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in dataStandardSummaryRows"
                :key="i"
                class="vs-row"
                :class="{ 'vs-row-added': row.status === 'added' }"
              >
                <template v-if="row.left">
                  <td class="col-bin">{{ row.left.sw_bin }}</td>
                  <td class="col-bin">{{ row.left.hw_bin }}</td>
                  <td :class="{ 'bin-changed': row.status === 'changed' || row.status === 'added' }">{{ row.left.bin_name }}</td>
                  <td>
                    <template v-if="row.left.sw_bin == 3">
                      <input class="sbl-input" v-model="sblInputText" placeholder="BIN5≥0.5%..." style="width: 150px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 4px;" @keyup.enter="parseSbl" />
                      <button class="btn btn-primary btn-sm" style="margin-left:4px" @click="parseSbl">解析</button>
                    </template>
                    <template v-else>
                      {{ sblLimits[row.left.hw_bin] ?? '' }}
                    </template>
                  </td>
                </template>
                <template v-else>
                  <td colspan="4" class="vs-empty-side">-</td>
                </template>
                <td class="vs-mid-col"></td>
                <template v-if="row.right">
                  <td class="col-bin">{{ row.right.sw_bin }}</td>
                  <td class="col-bin">{{ row.right.hw_bin }}</td>
                  <td :class="{ 'bin-changed': row.status === 'changed' }">{{ row.right.bin_name }}</td>
                  <td>{{ sblLimits[row.right.hw_bin] ?? '' }}</td>
                </template>
                <template v-else>
                  <td colspan="4" class="vs-empty-side">Added</td>
                </template>
              </tr>
              <tr v-if="!dataStandardSummaryRows.length">
                <td colspan="9" class="td-empty">No data</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="table-wrap">
          <table class="param-tbl">
            <thead>
              <tr>
                <th class="col-bin">SWBin</th>
                <th class="col-bin">HWBin</th>
                <th>Bin Name</th>
                <th>SBL管控</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in displaySummaryRows" :key="i" class="param-row">
                <td class="col-bin">{{ s.sw_bin }}</td>
                <td class="col-bin">{{ s.hw_bin }}</td>
                <td>{{ s.bin_name }}</td>
                <td>
                  <template v-if="s.sw_bin == 3">
                    <input class="sbl-input" v-model="sblInputText" placeholder="BIN5≥0.5%, BIN7≥0.5%..." style="width: 250px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 4px;" @keyup.enter="parseSbl" />
                    <button class="btn btn-primary btn-sm" style="margin-left:4px" @click="parseSbl">解析</button>
                  </template>
                  <template v-else>
                    {{ sblLimits[s.hw_bin] ?? '' }}
                  </template>
                </td>
              </tr>
              <tr v-if="!displaySummaryRows.length">
                <td colspan="4" class="td-empty">无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ══ cpp 页 ══ -->
      <div v-if="tab === 'cpp'" class="pgs-body cpp-body">
        <div class="info-bar cpp-info">
          <span>当前 <strong>{{ currentPgs?.program_version ?? currentPgs?.filename }}</strong></span>
          <template v-if="vsMode && vsTargetId">
            <span class="qa-info-sep">|</span>
            <span>对比 <strong>{{ vsTargetPgs?.program_version ?? vsTargetPgs?.filename }}</strong></span>
          </template>
          <span v-if="cppLoading" class="vs-loading-tip">⏳ 读取 source/test.cpp...</span>
          <span v-if="cppError" class="cpp-error">{{ cppError }}</span>
        </div>

        <div v-if="cppLoading" class="loading-mask">⏳ 加载 cpp...</div>
        <div class="cpp-loading-overlay" v-if="cppOverlayLoading">
          <div class="cpp-loading-dialog">
            <div class="cpp-loading-title">加载 CPP 文件</div>
            <div class="cpp-loading-subtitle">正在读取 source/test.cpp...</div>
            <div class="cpp-progress">
              <div class="cpp-progress-bar"></div>
            </div>
            <div class="cpp-loading-stage">{{ cppLoadingStage }}</div>
          </div>
        </div>
        <div
          class="cpp-layout"
          :class="{ 'cpp-layout-no-vi': vsMode && vsTargetId }"
          :style="cppLayoutStyle"
        >
          <aside class="cpp-overview">
            <div class="cpp-overview-title">test.cpp</div>
            <button
              v-for="item in cppOutline"
              :key="item.name"
              class="cpp-nav-item"
              :class="{
                'cpp-nav-mismatch': item.mismatch,
                'cpp-nav-vi-flow': item.viFlowIssue,
                'cpp-nav-vi-range': item.viRangeIssue,
                'cpp-nav-active': activeCppFunctionName === item.name
              }"
              @click="scrollToCppFunction(item.name)"
            >
              <span class="cpp-nav-index">{{ item.index }}</span>
              <span class="cpp-nav-text">{{ item.name }}</span>
              <span class="cpp-nav-mark">›</span>
            </button>
          </aside>
          <div
            class="cpp-nav-resizer"
            title="调整 Function 导航宽度"
            @pointerdown="startCppNavResize"
          ></div>

          <section class="cpp-code-panes" :class="{ 'cpp-vs-mode': vsMode && vsTargetId }">
            <div class="cpp-pane">
              <div class="cpp-pane-head">
                <span class="vs-prog-badge new-badge">当前</span>
                <span class="cpp-path">{{ cppDisplayPath }}</span>
                <button
                  v-if="cppEditMode"
                  class="cpp-download-btn"
                  :disabled="!cppModifiedContent"
                  @click="downloadModifiedCpp"
                >Download</button>
              </div>
              <div
                v-if="cppEditMode"
                ref="cppLeftPane"
                class="cpp-code-scroll cpp-edit-scroll"
              >
                <div ref="cppEditorHost" class="cpp-codemirror-host"></div>
              </div>
              <div
                v-else-if="!(vsMode && vsTargetId)"
                ref="cppLeftPane"
                class="cpp-code-scroll cpp-edit-scroll"
              >
                <div ref="cppReadonlyHost" class="cpp-codemirror-host"></div>
              </div>
              <div v-else ref="cppLeftPane" class="cpp-code-scroll" @scroll="syncCppScroll('left')">
                <div
                  v-for="row in cppDisplayRows"
                  :key="row.key"
                  class="cpp-line"
                  :class="{
                    'cpp-diff-line': isActiveCppFunction(row.funcName) && row.diff,
                    'cpp-empty-line': !row.left,
                    'cpp-hover-line': hoveredCppRowKey === row.key,
                    'cpp-jump-line': highlightedCppLineNo === row.left?.no
                  }"
                  :data-left-line="row.left?.no"
                  :data-left-func="row.funcName || undefined"
                  @mouseenter="hoveredCppRowKey = row.key"
                  @mouseleave="hoveredCppRowKey = ''"
                >
                  <span class="cpp-line-no">{{ row.left?.no ?? '' }}</span>
                  <code class="cpp-line-code">
                    <span
                      v-for="(token, i) in cppLineTokens(row.left?.text, row.funcName)"
                      :key="i"
                      :class="`cpp-token-${token.type}`"
                    >{{ token.text }}</span>
                  </code>
                </div>
                <div v-if="!cppLines.length" class="cpp-empty">未找到 source/test.cpp</div>
              </div>
            </div>

            <div v-if="vsMode && vsTargetId" class="cpp-pane">
              <div class="cpp-pane-head">
                <span class="vs-prog-badge old-badge">对比</span>
                <span class="cpp-path">{{ vsCppFile?.path ?? 'source/test.cpp' }}</span>
              </div>
              <div ref="cppRightPane" class="cpp-code-scroll" @scroll="syncCppScroll('right')">
                <div
                  v-for="row in cppDisplayRows"
                  :key="row.key"
                  class="cpp-line"
                  :class="{
                    'cpp-diff-line': isActiveCppFunction(row.funcName) && row.diff,
                    'cpp-empty-line': !row.right,
                    'cpp-hover-line': hoveredCppRowKey === row.key,
                    'cpp-jump-line': highlightedCppLineNo === row.right?.no
                  }"
                  :data-right-line="row.right?.no"
                  :data-right-func="row.funcName || undefined"
                  @mouseenter="hoveredCppRowKey = row.key"
                  @mouseleave="hoveredCppRowKey = ''"
                >
                  <span class="cpp-line-no">{{ row.right?.no ?? '' }}</span>
                  <code class="cpp-line-code">
                    <span
                      v-for="(token, i) in cppLineTokens(row.right?.text, row.funcName)"
                      :key="i"
                      :class="`cpp-token-${token.type}`"
                    >{{ token.text }}</span>
                  </code>
                </div>
                <div v-if="!vsCppLines.length" class="cpp-empty">未找到对比程序的 source/test.cpp</div>
              </div>
            </div>
          </section>

          <aside v-if="!(vsMode && vsTargetId)" class="vi-check-panel">
            <div class="vi-check-head">
              <div>
                <div class="vi-check-title">VI_CHECK</div>
                <div class="vi-check-subtitle">{{ activeCppFunctionName || 'Select Function' }}</div>
              </div>
              <div class="vi-check-actions">
                <button class="vi-check-run" @click="runViCheck">Run</button>
                <button
                  class="vi-check-action"
                  :class="{ 'vi-check-action-active': cppEditMode }"
                  :disabled="!cppFile?.content"
                  @click="toggleCppEdit"
                >Edit</button>
              </div>
            </div>
            <div
              v-if="viCheckEnabled && isFirstCppFunctionActive && viSourceMaxSummary.length"
              class="vi-max-summary"
            >
              <div class="vi-max-summary-row vi-max-summary-head">
                <span>VI_NAME</span>
                <span>最大电压</span>
                <span>最大电流</span>
              </div>
              <div
                v-for="item in viSourceMaxSummary"
                :key="item.source"
                class="vi-max-summary-row"
              >
                <span class="vi-max-source">{{ item.source }}</span>
                <button
                  class="vi-max-link"
                  :disabled="!item.maxVoltageLine"
                  @click="scrollToViMaxLine(item.maxVoltageLine)"
                >{{ formatViVoltage(item.maxVoltage) }}</button>
                <button
                  class="vi-max-link"
                  :disabled="!item.maxCurrentLine"
                  @click="scrollToViMaxLine(item.maxCurrentLine)"
                >{{ formatViCurrent(item.maxCurrent) }}</button>
              </div>
            </div>
            <div v-if="!viCheckEnabled" class="vi-check-empty">Click Run to check VI source flow.</div>
            <div
              v-else-if="isFirstCppFunctionActive && !viSourceMaxSummary.length"
              class="vi-check-empty"
            >No VI Set calls in this CPP.</div>
            <template v-else-if="!isFirstCppFunctionActive">
              <div v-if="!activeCppFunctionName" class="vi-check-empty">Select a function from the left list.</div>
              <div v-else-if="!activeViCheck" class="vi-check-empty">No VI Set calls in this function.</div>
              <div v-else class="vi-check-list">
                <div
                  v-for="source in activeViCheck.sources"
                  :key="source.source"
                  class="vi-source-card"
                  :class="`vi-source-${source.status}`"
                >
                  <div class="vi-source-name">{{ source.source }}</div>
                  <div class="vi-source-metrics">
                    <button
                      class="vi-source-metric-link"
                      :disabled="!source.maxVoltageLine"
                      @click="scrollToViMaxLine(source.maxVoltageLine)"
                    >最大电压 {{ formatViVoltage(source.maxVoltage) }}</button>
                    <button
                      class="vi-source-metric-link"
                      :disabled="!source.maxCurrentLine"
                      @click="scrollToViMaxLine(source.maxCurrentLine)"
                    >最大电流 {{ formatViCurrent(source.maxCurrent) }}</button>
                  </div>
                  <div class="vi-source-links">
                    <button class="vi-line-link" :disabled="!source.applyLine" @click="scrollToCppLine(source.applyLine)">Apply L{{ source.applyLine ?? '-' }}</button>
                    <button class="vi-line-link" :disabled="!source.zeroLine" @click="scrollToCppLine(source.zeroLine)">置零 L{{ source.zeroLine ?? '-' }}</button>
                    <button class="vi-line-link" :disabled="!source.offLine" @click="scrollToCppLine(source.offLine)">Off L{{ source.offLine ?? '-' }}</button>
                  </div>
                </div>
              </div>
            </template>
          </aside>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { cpp } from '@codemirror/lang-cpp'
import api from '@/api'

const route  = useRoute()
const router = useRouter()

const productName = computed(() => route.params.productName as string)
const currentId   = computed(() => Number(route.params.id))
const isDataProgram = computed(() => route.name === 'data-program-param')
const dataMonths = computed(() => Math.max(1, Number(route.query.months) || 1))

// ─── State ───
const loading    = ref(false)
const tab        = ref<'param' | 'summary' | 'cpp'>('param')
const params     = ref<any[]>([])
const summary    = ref<any[]>([])
const dataSummaryStandard = ref<any>(null)
const pgsList    = ref<any[]>([])
const dataProgramList = ref<any[]>([])
const paramFilter   = ref('')
const currentPgs    = ref<any>(null)
const qaAlertFilter = ref(false)  // QA 红色预警筛选
const sblInputText  = ref('')
const sblLimits     = ref<Record<string, string>>({})

function parseSbl() {
  const text = sblInputText.value
  sblLimits.value = {}
  const regex = /BIN(\d+)\s*(?:≥|>|≤|<|=)?\s*([\d.]+%?)/gi
  let match
  while ((match = regex.exec(text)) !== null) {
    sblLimits.value[match[1]] = match[2]
  }
}

const cppFile       = ref<any>(null)
const vsCppFile     = ref<any>(null)
const cppLoading    = ref(false)
const cppError      = ref('')
const cppLeftPane   = ref<HTMLElement | null>(null)
const cppRightPane  = ref<HTMLElement | null>(null)
const cppReadonlyHost = ref<HTMLElement | null>(null)
const cppEditorHost = ref<HTMLElement | null>(null)
const hoveredCppRowKey = ref('')
const highlightedCppLineNo = ref<number | null>(null)
const activeCppFunctionName = ref('')
const viCheckEnabled = ref(false)
const cppEditMode = ref(false)
const cppModifiedContent = ref('')
const cppNavWidth = ref(loadCppNavWidth())
let cppSyncScrollFrame = 0
let cppLineHighlightTimer: number | null = null
let cppReadonlyView: EditorView | null = null
let cppModifyView: EditorView | null = null
let syncingFromCodeMirror = false
let resizingCppNav = false

const setCmHighlightLine = StateEffect.define<number | null>()
const cmHighlightLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCmHighlightLine)) {
        const lineNo = effect.value
        if (!lineNo || lineNo < 1 || lineNo > tr.state.doc.lines) return Decoration.none
        const line = tr.state.doc.line(lineNo)
        return Decoration.set([
          Decoration.line({ class: 'cm-line-jump' }).range(line.from),
        ])
      }
    }
    return value.map(tr.changes)
  },
  provide: field => EditorView.decorations.from(field),
})

// ─── VS State ───
const vsMode      = ref(false)
const vsTargetSource = ref<'pgm' | 'data'>('pgm')
const vsTargetId  = ref<number | ''>('')
const vsLoading   = ref(false)
const vsToggleBusy = ref(false)
const vsParams    = ref<any[]>([])
const vsSummary   = ref<any[]>([])
const vsFilter    = reactive({ added: false, removed: false, loose: false, tight: false, diff: false })

// ─── Computed ───
const otherPgsList = computed(() =>
  pgsList.value.filter(p => {
    if (p.id === currentId.value || p.parse_status !== 'ok') return false
    if (isDataProgram.value) {
      return (p.tester ?? '') === (currentPgs.value?.tester ?? '')
    }
    return true
  })
)

const otherDataProgramList = computed(() => {
  const sourceList = isDataProgram.value ? pgsList.value : dataProgramList.value
  return sourceList.filter(p => {
    if (p.id === currentId.value || p.parse_status !== 'ok') return false
    if (isDataProgram.value) {
      return (p.tester ?? '') === (currentPgs.value?.tester ?? '')
    }
    return true
  })
})

const vsProgramList = computed(() =>
  vsTargetSource.value === 'data' ? otherDataProgramList.value : otherPgsList.value
)

const vsTargetPgs = computed(() =>
  vsProgramList.value.find(p => p.id === vsTargetId.value) ?? null
)

const cppOverlayLoading = computed(() =>
  tab.value === 'cpp' && (cppLoading.value || vsLoading.value)
)

const cppLoadingStage = computed(() => {
  if (vsLoading.value) return 'Loading compare data...'
  if (cppLoading.value) return 'Loading source/test.cpp...'
  return ''
})

const cppDisplayPath = computed(() =>
  cppEditMode.value ? 'source/Test_Modify.cpp' : (cppFile.value?.path ?? 'source/test.cpp')
)

const cppLayoutStyle = computed(() => ({
  '--cpp-nav-width': `${cppNavWidth.value}px`,
}))

const cppEditorLineNumbers = computed(() =>
  Array.from({ length: Math.max(1, cppLines.value.length) }, (_v, idx) => idx + 1)
)

const cppEditorHeight = computed(() =>
  `${cppEditorLineNumbers.value.length * 18 + 12}px`
)

const cppEditorHighlightStyle = computed(() => {
  if (!highlightedCppLineNo.value) return {}
  return { top: `${6 + (highlightedCppLineNo.value - 1) * 18}px` }
})

const cppEditorHighlightRows = computed(() =>
  cppLines.value.map(line => ({
    no: line.no,
    tokens: highlightCppLine(line.text),
  }))
)

/** VS 默认对比版本：PGM 优先选同前缀的下一版，DATA 优先选同名程序。 */
type ProgramVersionInfo = {
  prefix: string
  version: number
}

function pgsProgramName(pgs: any): string {
  const rawName = String(pgs?.program_version ?? pgs?.filename ?? '')
  return rawName.replace(/\.[^.]+$/, '')
}

function normalizedProgramName(pgs: any): string {
  return pgsProgramName(pgs).trim().toUpperCase()
}

function extractProgramVersionInfo(pgs: any): ProgramVersionInfo | null {
  const name = pgsProgramName(pgs)
  const match = name.match(/^(.*)_V(\d+)(?:$|_.*$)/i)
  const prefix = match?.[1]
  const versionText = match?.[2]
  if (!prefix || !versionText) return null
  const version = Number(versionText)
  if (!Number.isFinite(version)) return null
  return { prefix: prefix.toUpperCase(), version }
}

const defaultPgmVsId = computed<number | null>(() => {
  const currentInfo = extractProgramVersionInfo(currentPgs.value)
  if (!currentInfo) {
    return otherPgsList.value[0]?.id ?? null
  }

  let next: { id: number; version: number } | null = null
  let prev: { id: number; version: number } | null = null
  for (const pgs of otherPgsList.value) {
    const info = extractProgramVersionInfo(pgs)
    if (
      !info ||
      info.prefix !== currentInfo.prefix
    ) {
      continue
    }

    if (info.version > currentInfo.version && (!next || info.version < next.version)) {
      next = { id: pgs.id, version: info.version }
    }
    if (info.version < currentInfo.version && (!prev || info.version > prev.version)) {
      prev = { id: pgs.id, version: info.version }
    }
  }
  return next?.id ?? prev?.id ?? otherPgsList.value[0]?.id ?? null
})

const defaultDataVsId = computed<number | null>(() => {
  const currentName = normalizedProgramName(currentPgs.value)
  if (!currentName) return otherDataProgramList.value[0]?.id ?? null
  const sameName = otherDataProgramList.value.find(p => normalizedProgramName(p) === currentName)
  return sameName?.id ?? otherDataProgramList.value[0]?.id ?? null
})

const hasQaData = computed(() =>
  params.value.some(p => p.is_qa === true || p.qa_min != null || p.qa_max != null)
)

const hasNonBin4QaAlert = computed(() =>
  params.value.some(p => {
    const qaSwBin = p.is_qa ? p.sw_bin : p.qa_sw_bin
    if (qaSwBin == null || qaSwBin === '') return false
    return Number(qaSwBin) !== 4
  })
)

function swBinSortValue(row: any): number {
  const n = Number(row?.sw_bin)
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
}

function sortSummaryRows(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    const aSw = swBinSortValue(a)
    const bSw = swBinSortValue(b)
    if (aSw !== bSw) return aSw - bSw
    return String(a?.sw_bin ?? '').localeCompare(String(b?.sw_bin ?? ''))
  })
}

function withBaseSummaryBins(rows: any[]): any[] {
  const baseBins = [
    { sw_bin: 1, hw_bin: 1, bin_name: 'pass' },
    { sw_bin: 2, hw_bin: 2, bin_name: 'DPAT_PASS' },
    { sw_bin: 3, hw_bin: 3, bin_name: 'FAIL' },
  ]
  const existing = new Set(rows.map(row => String(row?.sw_bin)))
  return [
    ...baseBins.filter(row => !existing.has(String(row.sw_bin))),
    ...rows,
  ]
}

function summaryMaxSw(rows: any[]): number {
  const values = rows
    .map(row => Number(row?.sw_bin))
    .filter(value => Number.isFinite(value))
  return values.length ? Math.max(...values) : 0
}

function expandSummaryRows(rows: any[], maxSw = summaryMaxSw(rows)): any[] {
  const bySw = new Map(rows.map(row => [String(row?.sw_bin), row]))
  const expanded = []
  for (let sw = 1; sw <= maxSw; sw += 1) {
    const row = bySw.get(String(sw))
    expanded.push({
      sw_bin: sw,
      hw_bin: row?.hw_bin ?? sw,
      bin_name: row?.bin_name ?? '',
    })
  }
  return expanded
}

const sortedSummary = computed(() => sortSummaryRows(withBaseSummaryBins(summary.value)))
const sortedVsSummary = computed(() => sortSummaryRows(withBaseSummaryBins(vsSummary.value)))
const dataStandardSummaryRows = computed(() => dataSummaryStandard.value?.rows ?? [])
const dataExpandedSummaryRows = computed(() => expandSummaryRows(summary.value))
const displaySummaryRows = computed(() => {
  if (isDataProgram.value && dataSummaryStandard.value?.mode === 'pgm') {
    return dataStandardSummaryRows.value.map((row: any) => row.left).filter(Boolean)
  }
  if (isDataProgram.value && dataSummaryStandard.value?.mode === 'expanded') {
    return dataExpandedSummaryRows.value
  }
  return sortedSummary.value
})

type CppLine = { no: number; text: string }
type CppFunction = { index: number; name: string; line: number; start: number; end: number }
type CppOutlineItem = {
  index: number
  name: string
  line: number
  mismatch: boolean
  viFlowIssue: boolean
  viRangeIssue: boolean
}
type CppDisplayRow = {
  key: string
  funcName: string
  left: CppLine | null
  right: CppLine | null
  diff: boolean
}
type CppToken = { text: string; type: 'plain' | 'comment' | 'number' | 'string' | 'keyword' | 'macro' }
type ViSetCall = {
  source: string
  line: number
  mode: string
  value: number | null
  valueText: string
  voltageRange: number | null
  voltageRangeText: string
  currentRange: number | null
  currentRangeText: string
  relay: string
  raw: string
}
type ViSourceCheck = {
  source: string
  status: 'ok' | 'missing-off' | 'missing-zero' | 'range'
  messages: string[]
  calls: ViSetCall[]
  maxVoltage: number | null
  maxCurrent: number | null
  maxVoltageLine: number | null
  maxCurrentLine: number | null
  applyLine: number | null
  zeroLine: number | null
  offLine: number | null
}
type ViFunctionCheck = {
  functionName: string
  hasIssue: boolean
  hasFlowIssue: boolean
  hasRangeIssue: boolean
  sources: ViSourceCheck[]
}
type ViSourceMaxSummary = {
  source: string
  maxVoltage: number | null
  maxCurrent: number | null
  maxVoltageLine: number | null
  maxCurrentLine: number | null
}
type CppTesterParser = 'sts8200' | 'sts8300'
type CppValueEnv = Map<string, number>

type CppGlobalCache = {
  files: Map<number, any>
  displayRows: Map<string, CppDisplayRow[]>
  modifiedFiles: Map<number, string>
}

function cppGlobalCache(): CppGlobalCache {
  const w = window as any
  if (!w.__pgsCppCache) {
    w.__pgsCppCache = {
      files: new Map<number, any>(),
      displayRows: new Map<string, CppDisplayRow[]>(),
      modifiedFiles: new Map<number, string>(),
    }
  }
  if (!w.__pgsCppCache.files) {
    w.__pgsCppCache.files = new Map<number, any>()
  }
  if (!w.__pgsCppCache.displayRows) {
    w.__pgsCppCache.displayRows = new Map<string, CppDisplayRow[]>()
  }
  if (!w.__pgsCppCache.modifiedFiles) {
    w.__pgsCppCache.modifiedFiles = new Map<number, string>()
  }
  return w.__pgsCppCache as CppGlobalCache
}

const cppCache = cppGlobalCache()
const cppFileCache = cppCache.files
const cppDisplayRowsCache = cppCache.displayRows
const cppModifiedFileCache = cppCache.modifiedFiles

function loadCppNavWidth(): number {
  const raw = window.localStorage.getItem('pgs-cpp-nav-width')
  const width = Number(raw)
  if (!Number.isFinite(width)) return 220
  return Math.min(420, Math.max(170, width))
}

function startCppNavResize(event: PointerEvent) {
  resizingCppNav = true
  const startX = event.clientX
  const startWidth = cppNavWidth.value
  const pointerId = event.pointerId
  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(pointerId)

  const move = (moveEvent: PointerEvent) => {
    if (!resizingCppNav) return
    const nextWidth = Math.min(420, Math.max(170, startWidth + moveEvent.clientX - startX))
    cppNavWidth.value = nextWidth
  }

  const stop = () => {
    resizingCppNav = false
    window.localStorage.setItem('pgs-cpp-nav-width', String(Math.round(cppNavWidth.value)))
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

function cppCodeMirrorExtensions(editable: boolean) {
  return [
    basicSetup,
    cpp(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    cmHighlightLineField,
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '12px',
        backgroundColor: '#ffffff',
      },
      '.cm-scroller': {
        fontFamily: 'Consolas, "Courier New", monospace',
        lineHeight: '18px',
      },
      '.cm-content': {
        minHeight: '100%',
      },
      '.cm-gutters': {
        backgroundColor: '#f1f5f9',
        color: '#94a3b8',
        borderRight: '1px solid #e2e8f0',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#dbeafe',
        color: '#1d4ed8',
      },
    }),
    ...(editable
      ? [
          EditorView.updateListener.of(update => {
            if (!update.docChanged) return
            const nextContent = update.state.doc.toString()
            syncingFromCodeMirror = true
            cppModifiedContent.value = nextContent
            cppModifiedFileCache.set(currentId.value, nextContent)
            viCheckEnabled.value = false
            cppDisplayRowsCache.clear()
            syncingFromCodeMirror = false
          }),
        ]
      : [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ]),
  ]
}

function destroyCppCodeMirrorViews() {
  cppReadonlyView?.destroy()
  cppModifyView?.destroy()
  cppReadonlyView = null
  cppModifyView = null
}

function createCppCodeMirrorView(host: HTMLElement, content: string, editable: boolean): EditorView {
  return new EditorView({
    parent: host,
    state: EditorState.create({
      doc: content,
      extensions: cppCodeMirrorExtensions(editable),
    }),
  })
}

async function refreshCppCodeMirrorView() {
  await nextTick()
  if (tab.value !== 'cpp') return

  if (cppEditMode.value) {
    cppReadonlyView?.destroy()
    cppReadonlyView = null
    if (cppEditorHost.value) {
      if (!cppModifyView || cppModifyView.dom.parentElement !== cppEditorHost.value) {
        cppModifyView?.destroy()
        cppModifyView = createCppCodeMirrorView(cppEditorHost.value, cppModifiedContent.value, true)
      }
      updateCodeMirrorDoc(cppModifyView, cppModifiedContent.value)
      applyCodeMirrorHighlight(highlightedCppLineNo.value)
    }
    return
  }

  cppModifyView?.destroy()
  cppModifyView = null
  if (vsMode.value && vsTargetId.value) {
    cppReadonlyView?.destroy()
    cppReadonlyView = null
    return
  }

  if (cppReadonlyHost.value) {
    const content = String(cppFile.value?.content ?? '')
    if (!cppReadonlyView || cppReadonlyView.dom.parentElement !== cppReadonlyHost.value) {
      cppReadonlyView?.destroy()
      cppReadonlyView = createCppCodeMirrorView(cppReadonlyHost.value, content, false)
    }
    updateCodeMirrorDoc(cppReadonlyView, content)
    applyCodeMirrorHighlight(highlightedCppLineNo.value)
  }
}

function updateCodeMirrorDoc(view: EditorView | null, content: string) {
  if (!view || view.state.doc.toString() === content) return
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  })
}

function applyCodeMirrorHighlight(lineNo: number | null) {
  for (const view of [cppReadonlyView, cppModifyView]) {
    if (!view) continue
    view.dispatch({ effects: setCmHighlightLine.of(lineNo) })
  }
}

const cppKeywords = new Set([
  'alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const',
  'constexpr', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit',
  'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long',
  'namespace', 'new', 'nullptr', 'operator', 'private', 'protected', 'public', 'return',
  'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw',
  'true', 'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void',
  'volatile', 'while',
])

function tokenizeCppSegment(segment: string): CppToken[] {
  const tokens: CppToken[] = []
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUlLfF]*\b)|(\b[A-Za-z_]\w*\b)|(\s+|.)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(segment))) {
    const text = match[0]
    if (match[1]) {
      tokens.push({ text, type: 'string' })
    } else if (match[2]) {
      tokens.push({ text, type: 'number' })
    } else if (match[3]) {
      tokens.push({ text, type: cppKeywords.has(text) ? 'keyword' : 'plain' })
    } else {
      tokens.push({ text, type: 'plain' })
    }
  }
  return tokens
}

function highlightCppLine(text?: string): CppToken[] {
  if (!text) return [{ text: ' ', type: 'plain' }]
  const trimmed = text.trimStart()
  if (trimmed.startsWith('#')) return [{ text, type: 'macro' }]

  const commentIdx = text.indexOf('//')
  if (commentIdx >= 0) {
    return [
      ...tokenizeCppSegment(text.slice(0, commentIdx)),
      { text: text.slice(commentIdx), type: 'comment' },
    ]
  }
  return tokenizeCppSegment(text)
}

function isActiveCppFunction(functionName?: string): boolean {
  return Boolean(functionName && activeCppFunctionName.value === functionName)
}

function cppLineTokens(text: string | undefined, functionName?: string): CppToken[] {
  if (!isActiveCppFunction(functionName)) {
    return [{ text: text || ' ', type: 'plain' }]
  }
  return highlightCppLine(text)
}

function toCppLines(content: string | undefined): CppLine[] {
  if (!content) return []
  return content.split(/\r?\n/).map((text, idx) => ({ no: idx + 1, text }))
}

const cppLines = computed(() => toCppLines(cppEditMode.value ? cppModifiedContent.value : cppFile.value?.content))
const vsCppLines = computed(() => toCppLines(vsCppFile.value?.content))

function parseDutFunctionName(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('DUT_API')) return null
  const beforeParen = trimmed.split('(')[0]?.trim()
  if (!beforeParen) return null
  const parts = beforeParen.split(/\s+/)
  const tail = parts[parts.length - 1] ?? ''
  const match = tail.match(/([A-Za-z_]\w*)$/)
  return match?.[1] ?? null
}

function parseCppFunctions(lines: CppLine[]): CppFunction[] {
  const starts: Array<{ name: string; idx: number; line: number }> = []
  for (let idx = 0; idx < lines.length; idx += 1) {
    const name = parseDutFunctionName(lines[idx]!.text)
    if (name) starts.push({ name, idx, line: lines[idx]!.no })
  }
  return starts.map((fn, idx) => ({
    index: idx + 1,
    name: fn.name,
    line: fn.line,
    start: fn.idx,
    end: (starts[idx + 1]?.idx ?? lines.length) - 1,
  }))
}

const cppFunctions = computed(() => parseCppFunctions(cppLines.value))
const vsCppFunctions = computed(() => parseCppFunctions(vsCppLines.value))

function functionMap(functions: CppFunction[]): Map<string, CppFunction> {
  const map = new Map<string, CppFunction>()
  for (const fn of functions) {
    if (!map.has(fn.name)) map.set(fn.name, fn)
  }
  return map
}

function nonBlankKey(line: CppLine): string {
  return line.text.trim().replace(/\s+/g, ' ')
}

function functionLines(lines: CppLine[], fn: CppFunction): CppLine[] {
  return lines.slice(fn.start, fn.end + 1)
}

function stripCppComment(text: string): string {
  return text.split('//')[0] ?? ''
}

function normalizeCppNumericLiteral(text: string): string {
  return text
    .trim()
    .replace(/[fFuUlL]+$/g, '')
}

function parseCppNumber(text: string | undefined, env?: CppValueEnv): number | null {
  if (!text) return null
  const cleaned = normalizeCppNumericLiteral(text)
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : evaluateCppNumericExpression(cleaned, env)
}

function evaluateCppNumericExpression(text: string | undefined, env?: CppValueEnv): number | null {
  if (!text) return null
  let expr = normalizeCppNumericLiteral(text)
    .replace(/\b([0-9]+(?:\.[0-9]+)?(?:e[+-]?\d+)?)\s*(UA|U?MA|MV|V|A)\b/gi, (_m, num, unit) => {
      const base = Number(num)
      if (!Number.isFinite(base)) return 'NaN'
      const upperUnit = String(unit).toUpperCase()
      if (upperUnit === 'MV') return String(base / 1000)
      if (upperUnit === 'UA') return String(base / 1000000)
      if (upperUnit === 'MA' || upperUnit === 'UMA') return String(base / 1000)
      return String(base)
    })

  expr = expr.replace(/\b[A-Za-z_]\w*(?:::[A-Za-z_]\w*)?(?:\.[A-Za-z_]\w*)?\b/g, name => {
    const direct = env?.get(name)
    if (direct != null) return String(direct)
    const tail = name.split(/::|\./).pop() ?? name
    const tailValue = env?.get(tail)
    return tailValue != null ? String(tailValue) : 'NaN'
  })

  if (!/^[\dNaInfityeE+\-*/().\s]+$/.test(expr)) return null
  try {
    const result = Function(`"use strict"; return (${expr});`)()
    return Number.isFinite(result) ? Number(result) : null
  } catch {
    return null
  }
}

function updateCppValueEnvFromLine(env: CppValueEnv, line: CppLine): void {
  const code = stripCppComment(line.text).trim()
  if (!code) return

  const defineMatch = code.match(/^#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/)
  if (defineMatch) {
    const value = evaluateCppNumericExpression(defineMatch[2], env)
    if (value != null) env.set(defineMatch[1]!, value)
    return
  }

  const assignMatch = code.match(/^(?:static\s+)?(?:const\s+)?(?:(?:double|float|int|long|short|auto|UINT|ULONG|WORD|DWORD|BOOL)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*=\s*([^;]+);/)
  if (assignMatch && !/[=!<>]=/.test(code)) {
    const value = evaluateCppNumericExpression(assignMatch[2], env)
    if (value != null) env.set(assignMatch[1]!, value)
  }
}

function trimViNumber(value: number): string {
  if (value === 0) return '0'
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) {
    return Number(value.toPrecision(6)).toString()
  }
  return Number(value.toPrecision(6)).toString()
}

function formatViVoltage(value: number | null): string {
  if (value == null) return '-'
  return `${trimViNumber(value)}V`
}

function formatViCurrent(value: number | null): string {
  if (value == null) return '-'
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) {
    return `${trimViNumber(value * 1000)}mA`
  }
  return `${trimViNumber(value)}A`
}

function parseRangeValue(text: string | undefined): number | null {
  if (!text) return null
  const upper = text.trim().toUpperCase()
  const match = upper.match(/_([0-9]+(?:\.[0-9]+)?)(U?MA|UA|MV|V|A)\b/)
  if (!match) return null
  const base = Number(match[1])
  if (!Number.isFinite(base)) return null
  const unit = match[2]
  if (unit === 'MV') return base / 1000
  if (unit === 'UA') return base / 1000000
  if (unit === 'MA' || unit === 'UMA') return base / 1000
  return base
}

function parseSts8300RangeValue(text: string | undefined, kind: 'voltage' | 'current', env?: CppValueEnv): number | null {
  if (!text) return null
  const numeric = parseCppNumber(text, env)
  if (numeric != null) return Math.abs(numeric)
  const upper = text.trim().toUpperCase()
  const unitPattern = kind === 'voltage'
    ? /([0-9]+(?:\.[0-9]+)?)\s*(MV|V)\b/
    : /([0-9]+(?:\.[0-9]+)?)\s*(UA|U?MA|A)\b/
  const match = upper.match(unitPattern)
  if (!match) return parseRangeValue(text)
  const base = Number(match[1])
  if (!Number.isFinite(base)) return null
  const unit = match[2]
  if (unit === 'MV') return base / 1000
  if (unit === 'UA') return base / 1000000
  if (unit === 'MA' || unit === 'UMA') return base / 1000
  return base
}

function splitSetArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function detectCppTesterParser(lines: CppLine[]): CppTesterParser {
  return lines.some(line => /\b(?:DCM|ACM)\b/i.test(line.text)) ? 'sts8300' : 'sts8200'
}

const activeCppTesterParser = computed<CppTesterParser>(() => detectCppTesterParser(cppLines.value))

function buildViSetCall(
  source: string,
  line: CppLine,
  mode: string,
  valueText: string | undefined,
  voltageRangeText: string | undefined,
  currentRangeText: string | undefined,
  relayText: string | undefined,
  env?: CppValueEnv,
): ViSetCall {
  return {
    source: source.toUpperCase(),
    line: line.no,
    mode: mode.trim().toUpperCase(),
    value: parseCppNumber(valueText, env),
    valueText: valueText ?? '',
    voltageRange: parseSts8300RangeValue(voltageRangeText, 'voltage', env),
    voltageRangeText: voltageRangeText ?? '',
    currentRange: parseSts8300RangeValue(currentRangeText, 'current', env),
    currentRangeText: currentRangeText ?? '',
    relay: normalizeRelayName(relayText),
    raw: line.text.trim(),
  }
}

function normalizeRelayName(text: string | undefined): string {
  const upper = String(text ?? '').trim().toUpperCase()
  if (/\b[A-Z0-9_]*RELAY_SENSE_ON\b/.test(upper)) return 'RELAY_SENSE_ON'
  if (/\b[A-Z0-9_]*RELAY_OFF\b/.test(upper)) return 'RELAY_OFF'
  if (/\b[A-Z0-9_]*RELAY_ON\b/.test(upper)) return 'RELAY_ON'
  return upper
}

function normalizeSts8300Mode(method: string, args: string[]): string {
  const upperMethod = method.toUpperCase()
  if (
    upperMethod.includes('CURR') ||
    upperMethod.includes('CURRENT') ||
    upperMethod === 'FI' ||
    /\b(?:SET|FORCE)?I\b/.test(upperMethod)
  ) return 'FI'
  if (
    upperMethod.includes('VOLT') ||
    upperMethod.includes('VOLTAGE') ||
    upperMethod.includes('AMPL') ||
    upperMethod === 'FV' ||
    /\b(?:SET|FORCE)?V\b/.test(upperMethod)
  ) return 'FV'
  return (args[0] ?? '').trim().toUpperCase()
}

function normalizeSts8300Relay(args: string[]): string {
  const explicit = args.find(arg => /\bRELAY_(?:ON|OFF|SENSE_ON)\b/i.test(arg))
  if (explicit) return normalizeRelayName(explicit)
  const joined = args.join(',')
  if (/\b(?:ON|CONNECT|CLOSE|ENABLE)\b/i.test(joined)) return 'RELAY_ON'
  if (/\b(?:OFF|DISCONNECT|OPEN|DISABLE)\b/i.test(joined)) return 'RELAY_OFF'
  return 'RELAY_ON'
}

function isSts8300SetMethod(method: string): boolean {
  const upperMethod = method.toUpperCase()
  return upperMethod === 'SET' ||
    upperMethod === 'FV' ||
    upperMethod === 'FI' ||
    upperMethod.includes('VOLT') ||
    upperMethod.includes('CURR') ||
    upperMethod.includes('AMPL') ||
    /\b(?:SET|FORCE)?[VI]\b/.test(upperMethod) ||
    upperMethod.includes('FORCE')
}

function parseSts8200ViSetCall(line: CppLine, env?: CppValueEnv): ViSetCall | null {
  const code = stripCppComment(line.text)
  const match = code.match(/\b([A-Za-z_]\w*)\s*\.\s*Set\s*\((.*)\)\s*;/)
  if (!match) return null
  const args = splitSetArgs(match[2] ?? '')
  if (args.length < 5) return null
  return buildViSetCall(match[1] ?? '', line, args[0] ?? '', args[1], args[2], args[3], args[4], env)
}

function parseSts8300ViSetCall(line: CppLine, env?: CppValueEnv): ViSetCall | null {
  const code = stripCppComment(line.text)
  const methodCall = code.match(/\b(?:(DCM|ACM)\s*\.\s*)?([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\((.*)\)\s*;/i)
  const globalCall = code.match(/\b(DCM|ACM)\s*\.\s*([A-Za-z_]\w*)\s*\((.*)\)\s*;/i)

  if (globalCall) {
    const method = globalCall[2] ?? ''
    const args = splitSetArgs(globalCall[3] ?? '')
    const upperMethod = method.toUpperCase()
    if (!isSts8300SetMethod(method)) return null
    const mode = upperMethod === 'SET' ? (args[1] ?? args[0] ?? '') : normalizeSts8300Mode(method, args)
    const source = args[0] ?? globalCall[1] ?? ''
    const valueIdx = upperMethod === 'SET' ? 2 : 1
    return buildViSetCall(
      source.replace(/^["']|["']$/g, ''),
      line,
      mode,
      args[valueIdx],
      args[valueIdx + 1],
      args[valueIdx + 2],
      normalizeSts8300Relay(args),
      env,
    )
  }

  if (methodCall) {
    const instrument = (methodCall[1] ?? '').toUpperCase()
    const objectName = methodCall[2] ?? ''
    const method = methodCall[3] ?? ''
    const args = splitSetArgs(methodCall[4] ?? '')
    const upperMethod = method.toUpperCase()
    if (!instrument && !/\b(?:DCM|ACM)\b/i.test(objectName + upperMethod)) {
      return parseSts8200ViSetCall(line, env)
    }
    if (!isSts8300SetMethod(method)) return null

    const mode = upperMethod === 'SET' ? (args[0] ?? '') : normalizeSts8300Mode(method, args)
    const valueIdx = upperMethod === 'SET' ? 1 : 0
    return buildViSetCall(
      objectName,
      line,
      mode,
      args[valueIdx],
      args[valueIdx + 1],
      args[valueIdx + 2],
      normalizeSts8300Relay(args),
      env,
    )
  }

  return parseSts8200ViSetCall(line, env)
}

function parseViSetCall(line: CppLine, parser: CppTesterParser, env?: CppValueEnv): ViSetCall | null {
  return parser === 'sts8300'
    ? parseSts8300ViSetCall(line, env)
    : parseSts8200ViSetCall(line, env)
}

function isViRelayOn(relay: string): boolean {
  return normalizeRelayName(relay) === 'RELAY_ON' || normalizeRelayName(relay) === 'RELAY_SENSE_ON'
}

function isViRelayOff(relay: string): boolean {
  return normalizeRelayName(relay) === 'RELAY_OFF'
}

function isViZeroCall(call: ViSetCall): boolean {
  return (call.mode === 'FV' || call.mode === 'FI') &&
    isViRelayOn(call.relay) &&
    call.value != null &&
    Math.abs(call.value) <= 1e-12
}

function isViApplyCall(call: ViSetCall): boolean {
  return (call.mode === 'FV' || call.mode === 'FI') &&
    isViRelayOn(call.relay) &&
    call.value != null &&
    Math.abs(call.value) > 1e-12
}

function callExceedsRange(call: ViSetCall): string | null {
  if (call.value == null) return null
  if (call.mode === 'FV' && call.voltageRange != null && Math.abs(call.value) > call.voltageRange) {
    return `Line ${call.line}: voltage ${call.valueText} exceeds ${call.voltageRangeText}`
  }
  if (call.mode === 'FI' && call.currentRange != null && Math.abs(call.value) > call.currentRange) {
    return `Line ${call.line}: current ${call.valueText} exceeds ${call.currentRangeText}`
  }
  return null
}

function callVoltageCandidate(call: ViSetCall): number | null {
  if (call.mode === 'FV') return call.value == null ? null : Math.abs(call.value)
  return null
}

function callCurrentCandidate(call: ViSetCall): number | null {
  if (call.mode === 'FI') return call.value
  return null
}

function buildGlobalCppValueEnv(lines: CppLine[]): CppValueEnv {
  const env: CppValueEnv = new Map()
  const firstFunctionLine = cppFunctions.value[0]?.line ?? Number.MAX_SAFE_INTEGER
  for (const line of lines) {
    if (line.no >= firstFunctionLine) break
    updateCppValueEnvFromLine(env, line)
  }
  return env
}

function analyzeViFunction(fn: CppFunction): ViFunctionCheck | null {
  const parser = activeCppTesterParser.value
  const env: CppValueEnv = new Map(buildGlobalCppValueEnv(cppLines.value))
  const calls: ViSetCall[] = []
  for (const line of functionLines(cppLines.value, fn)) {
    updateCppValueEnvFromLine(env, line)
    const call = parseViSetCall(line, parser, env)
    if (call) calls.push(call)
  }
  if (!calls.length) return null

  const bySource = new Map<string, ViSetCall[]>()
  for (const call of calls) {
    if (!bySource.has(call.source)) bySource.set(call.source, [])
    bySource.get(call.source)!.push(call)
  }

  const sources: ViSourceCheck[] = []
  for (const [source, sourceCalls] of bySource) {
    const messages: string[] = []
    const rangeIssues = sourceCalls.map(callExceedsRange).filter((msg): msg is string => Boolean(msg))
    const hasRangeIssue = rangeIssues.length > 0
    messages.push(...rangeIssues)

    const onSetCalls = sourceCalls.filter(call =>
      (call.mode === 'FV' || call.mode === 'FI') &&
      isViRelayOn(call.relay) &&
      call.value != null
    )
    const applyCalls = sourceCalls.filter(isViApplyCall)
    const hasApply = applyCalls.length > 0
    const hasZero = sourceCalls.some(isViZeroCall)
    const hasOff = sourceCalls.some(call => isViRelayOff(call.relay))
    const voltageCalls = onSetCalls.filter(call => callVoltageCandidate(call) != null)
    const maxVoltageCall = voltageCalls.reduce<ViSetCall | null>((best, call) => {
      const callVoltage = callVoltageCandidate(call)
      const bestVoltage = best ? callVoltageCandidate(best) : null
      if (callVoltage != null && (bestVoltage == null || Math.abs(callVoltage) > Math.abs(bestVoltage))) return call
      return best
    }, null)
    const maxVoltage = maxVoltageCall == null ? null : callVoltageCandidate(maxVoltageCall)
    const currentCalls = onSetCalls.filter(call => callCurrentCandidate(call) != null)
    const maxCurrentCall = currentCalls.reduce<ViSetCall | null>((best, call) => {
      const callCurrent = callCurrentCandidate(call)
      const bestCurrent = best ? callCurrentCandidate(best) : null
      if (callCurrent != null && (bestCurrent == null || Math.abs(callCurrent) > Math.abs(bestCurrent))) return call
      return best
    }, null)
    const maxCurrent = maxCurrentCall == null ? null : callCurrentCandidate(maxCurrentCall)
    const primaryApplyCall = (() => {
      if (maxVoltageCall && maxCurrentCall) {
        return Math.abs(callVoltageCandidate(maxVoltageCall) ?? 0) >= Math.abs(callCurrentCandidate(maxCurrentCall) ?? 0)
          ? maxVoltageCall
          : maxCurrentCall
      }
      return maxVoltageCall ?? maxCurrentCall ?? applyCalls[0] ?? null
    })()
    const zeroAfterPrimaryApply = primaryApplyCall
      ? sourceCalls.find(call => call.line > primaryApplyCall.line && isViZeroCall(call)) ?? null
      : sourceCalls.find(isViZeroCall) ?? null
    const offAfterZero = zeroAfterPrimaryApply
      ? sourceCalls.find(call => call.line > zeroAfterPrimaryApply.line && isViRelayOff(call.relay)) ?? null
      : sourceCalls.find(call => isViRelayOff(call.relay)) ?? null
    let missingZero = false
    let missingOffAfterZero = false

    for (const applyCall of applyCalls) {
      const zeroAfterApply = sourceCalls.find(call => call.line > applyCall.line && isViZeroCall(call))
      if (!zeroAfterApply) {
        missingZero = true
        continue
      }
      const offAfterZero = sourceCalls.find(call =>
        call.line > zeroAfterApply.line && isViRelayOff(call.relay)
      )
      if (!offAfterZero) {
        missingOffAfterZero = true
      }
    }

    let status: ViSourceCheck['status'] = 'ok'
    if (hasRangeIssue) {
      status = 'range'
    } else if (missingZero) {
      status = 'missing-zero'
    } else if (missingOffAfterZero) {
      status = 'missing-off'
      messages.push('Missing RELAY_OFF after zero')
    } else if (hasZero && !hasApply) {
      status = 'ok'
      messages.push('Zero with RELAY_ON only')
    } else if (hasApply) {
      messages.push('Apply -> zero -> off flow OK')
    } else {
      status = 'ok'
      messages.push('No non-zero apply detected')
    }

    sources.push({
      source,
      status,
      messages,
      calls: sourceCalls,
      maxVoltage,
      maxCurrent,
      maxVoltageLine: maxVoltageCall?.line ?? null,
      maxCurrentLine: maxCurrentCall?.line ?? null,
      applyLine: primaryApplyCall?.line ?? null,
      zeroLine: zeroAfterPrimaryApply?.line ?? null,
      offLine: offAfterZero?.line ?? null,
    })
  }

  return {
    functionName: fn.name,
    hasIssue: sources.some(source => source.status !== 'ok'),
    hasFlowIssue: sources.some(source =>
      source.status === 'missing-zero' || source.status === 'missing-off'
    ),
    hasRangeIssue: sources.some(source => source.status === 'range'),
    sources,
  }
}

const viCheckResults = computed<Map<string, ViFunctionCheck>>(() => {
  if (!viCheckEnabled.value) return new Map()
  if (vsMode.value && Boolean(vsTargetId.value)) return new Map()
  const result = new Map<string, ViFunctionCheck>()
  for (const fn of cppFunctions.value) {
    const check = analyzeViFunction(fn)
    if (check) result.set(fn.name, check)
  }
  return result
})

const activeViCheck = computed(() =>
  viCheckResults.value.get(activeCppFunctionName.value) ?? null
)

const isFirstCppFunctionActive = computed(() =>
  Boolean(cppFunctions.value[0]?.name && activeCppFunctionName.value === cppFunctions.value[0].name)
)

const viSourceMaxSummary = computed<ViSourceMaxSummary[]>(() => {
  const summary = new Map<string, ViSourceMaxSummary>()
  for (const check of viCheckResults.value.values()) {
    for (const source of check.sources) {
      if (!summary.has(source.source)) {
        summary.set(source.source, {
          source: source.source,
          maxVoltage: source.maxVoltage,
          maxCurrent: source.maxCurrent,
          maxVoltageLine: source.maxVoltageLine,
          maxCurrentLine: source.maxCurrentLine,
        })
        continue
      }

      const existing = summary.get(source.source)!
      if (
        source.maxVoltage != null &&
        (existing.maxVoltage == null || Math.abs(source.maxVoltage) > Math.abs(existing.maxVoltage))
      ) {
        existing.maxVoltage = source.maxVoltage
        existing.maxVoltageLine = source.maxVoltageLine
      }
      if (
        source.maxCurrent != null &&
        (existing.maxCurrent == null || Math.abs(source.maxCurrent) > Math.abs(existing.maxCurrent))
      ) {
        existing.maxCurrent = source.maxCurrent
        existing.maxCurrentLine = source.maxCurrentLine
      }
    }
  }
  return [...summary.values()].sort((a, b) => a.source.localeCompare(b.source))
})

async function runViCheck() {
  viCheckEnabled.value = true
  await nextTick()
  const firstFunctionName = cppFunctions.value[0]?.name
  if (firstFunctionName) {
    await scrollToCppFunction(firstFunctionName)
  }
}

function toggleCppEdit() {
  if (cppEditMode.value) {
    cppEditMode.value = false
    viCheckEnabled.value = false
    activeCppFunctionName.value = ''
    refreshCppCodeMirrorView()
    return
  }
  const existing = cppModifiedFileCache.get(currentId.value)
  cppModifiedContent.value = existing ?? String(cppFile.value?.content ?? '')
  cppModifiedFileCache.set(currentId.value, cppModifiedContent.value)
  cppEditMode.value = true
  viCheckEnabled.value = false
  cppDisplayRowsCache.clear()
  refreshCppCodeMirrorView()
}

function onCppModifiedInput() {
  cppModifiedFileCache.set(currentId.value, cppModifiedContent.value)
  viCheckEnabled.value = false
  cppDisplayRowsCache.clear()
}

function downloadModifiedCpp() {
  if (!cppEditMode.value || !cppModifiedContent.value) return
  const blob = new Blob([cppModifiedContent.value], { type: 'text/x-c++src;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Test_Modify.cpp'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

watch(cppModifiedContent, value => {
  if (cppEditMode.value) {
    cppModifiedFileCache.set(currentId.value, value)
    if (!syncingFromCodeMirror) updateCodeMirrorDoc(cppModifyView, value)
  }
})

watch(highlightedCppLineNo, lineNo => {
  applyCodeMirrorHighlight(lineNo)
})

function alignFunctionRows(
  funcName: string,
  leftLines: CppLine[],
  rightLines: CppLine[],
  keyPrefix: string,
): CppDisplayRow[] {
  const left = leftLines.filter(line => line.text.trim() !== '')
  const right = rightLines.filter(line => line.text.trim() !== '')
  const m = left.length
  const n = right.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i]![j] = nonBlankKey(left[i]!) === nonBlankKey(right[j]!)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }

  const rows: CppDisplayRow[] = []
  let i = 0
  let j = 0
  let row = 0
  while (i < m || j < n) {
    const leftLine = i < m ? left[i]! : null
    const rightLine = j < n ? right[j]! : null
    if (leftLine && rightLine && nonBlankKey(leftLine) === nonBlankKey(rightLine)) {
      rows.push({ key: `${keyPrefix}-${row}`, funcName, left: leftLine, right: rightLine, diff: false })
      i += 1
      j += 1
    } else if (rightLine && (!leftLine || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      rows.push({ key: `${keyPrefix}-${row}`, funcName, left: null, right: rightLine, diff: true })
      j += 1
    } else {
      rows.push({ key: `${keyPrefix}-${row}`, funcName, left: leftLine, right: null, diff: true })
      i += 1
    }
    row += 1
  }
  return rows
}

function areFunctionsDifferent(leftFn: CppFunction, rightFn: CppFunction | undefined): boolean {
  if (!rightFn) return true
  const leftKeys = functionLines(cppLines.value, leftFn)
    .filter(line => line.text.trim() !== '')
    .map(nonBlankKey)
  const rightKeys = functionLines(vsCppLines.value, rightFn)
    .filter(line => line.text.trim() !== '')
    .map(nonBlankKey)
  if (leftKeys.length !== rightKeys.length) return true
  return leftKeys.some((key, idx) => key !== rightKeys[idx])
}

const cppOutline = computed<CppOutlineItem[]>(() => {
  const rightMap = functionMap(vsCppFunctions.value)
  const viResults = viCheckResults.value
  return cppFunctions.value.map(fn => ({
    index: fn.index,
    name: fn.name,
    line: fn.line,
    mismatch: vsMode.value && Boolean(vsTargetId.value) ? areFunctionsDifferent(fn, rightMap.get(fn.name)) : false,
    viFlowIssue: viResults.get(fn.name)?.hasFlowIssue ?? false,
    viRangeIssue: viResults.get(fn.name)?.hasRangeIssue ?? false,
  }))
})

function lineFunctionNameMap(lines: CppLine[], functions: CppFunction[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const fn of functions) {
    for (const line of lines.slice(fn.start, fn.end + 1)) {
      map.set(line.no, fn.name)
    }
  }
  return map
}

const cppDisplayRows = computed<CppDisplayRow[]>(() => {
  if (!(vsMode.value && vsTargetId.value)) {
    const lineFuncMap = lineFunctionNameMap(cppLines.value, cppFunctions.value)
    return cppLines.value.map(line => ({
      key: `left-${line.no}`,
      funcName: lineFuncMap.get(line.no) ?? '',
      left: line,
      right: null,
      diff: false,
    }))
  }

  const leftLineCount = cppLines.value.length
  const rightLineCount = vsCppLines.value.length
  const canCacheRows = leftLineCount > 0 && rightLineCount > 0 && !cppEditMode.value
  const cacheKey = `full-v3:${currentId.value}:${vsTargetId.value}:${leftLineCount}:${rightLineCount}`
  const cachedRows = cppDisplayRowsCache.get(cacheKey)
  if (canCacheRows && cachedRows) return cachedRows

  const rightMap = functionMap(vsCppFunctions.value)
  const rows: CppDisplayRow[] = []
  const firstFn = cppFunctions.value[0]
  const firstRightFn = vsCppFunctions.value[0]
  const preambleEnd = firstFn ? firstFn.start : cppLines.value.length
  const rightPreambleEnd = firstRightFn ? firstRightFn.start : vsCppLines.value.length
  rows.push(...alignFunctionRows(
    '',
    cppLines.value.slice(0, preambleEnd),
    vsCppLines.value.slice(0, rightPreambleEnd),
    'pre',
  ))

  for (const fn of cppFunctions.value) {
    const rightFn = rightMap.get(fn.name)
    rows.push(...alignFunctionRows(
      fn.name,
      functionLines(cppLines.value, fn),
      rightFn ? functionLines(vsCppLines.value, rightFn) : [],
      `fn-${fn.index}-${fn.name}`,
    ))
  }

  const leftNames = new Set(cppFunctions.value.map(fn => fn.name))
  for (const fn of vsCppFunctions.value) {
    if (leftNames.has(fn.name)) continue
    rows.push(...alignFunctionRows(
      fn.name,
      [],
      functionLines(vsCppLines.value, fn),
      `right-only-${fn.index}-${fn.name}`,
    ))
  }

  if (canCacheRows) {
    cppDisplayRowsCache.set(cacheKey, rows)
  }
  return rows
})

async function scrollToCppFunction(functionName: string) {
  activeCppFunctionName.value = functionName
  await nextTick()
  if (cppEditMode.value) {
    const fn = cppFunctions.value.find(item => item.name === functionName)
    if (fn) scrollCppEditorToLine(fn.line)
    return
  }
  if (vsMode.value && vsTargetId.value) {
    const leftTarget = findCppFunctionElement(cppLeftPane.value, 'left', functionName)
    const rightTarget = findCppFunctionElement(cppRightPane.value, 'right', functionName)
    scrollPaneToChild(cppLeftPane.value, leftTarget)
    scrollPaneToChild(cppRightPane.value, rightTarget)
    return
  }
  const fn = cppFunctions.value.find(item => item.name === functionName)
  if (fn) scrollCppEditorToLine(fn.line)
}

function findCppFunctionElement(
  pane: HTMLElement | null,
  side: 'left' | 'right',
  functionName: string,
): HTMLElement | null {
  if (!pane) return null
  const attr = side === 'left' ? 'leftFunc' : 'rightFunc'
  return Array.from(pane.querySelectorAll<HTMLElement>('.cpp-line'))
    .find(item => item.dataset[attr] === functionName) ?? null
}

function scrollPaneToChild(pane: HTMLElement | null, child: HTMLElement | null) {
  if (!pane || !child) return
  pane.scrollTop = child.offsetTop
}

async function scrollToCppLine(lineNo: number | null) {
  if (!lineNo) return
  highlightedCppLineNo.value = lineNo
  if (cppLineHighlightTimer != null) window.clearTimeout(cppLineHighlightTimer)
  cppLineHighlightTimer = window.setTimeout(() => {
    if (highlightedCppLineNo.value === lineNo) highlightedCppLineNo.value = null
    cppLineHighlightTimer = null
  }, 4000)
  await nextTick()
  if (cppEditMode.value || !(vsMode.value && vsTargetId.value)) {
    scrollCppEditorToLine(lineNo)
    return
  }
  const leftTarget = cppLeftPane.value?.querySelector(`[data-left-line="${lineNo}"]`)
  leftTarget?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  if (cppLeftPane.value && cppRightPane.value) {
    requestAnimationFrame(() => {
      if (!cppLeftPane.value || !cppRightPane.value) return
      cppRightPane.value.scrollTop = cppLeftPane.value.scrollTop
      cppRightPane.value.scrollLeft = cppLeftPane.value.scrollLeft
    })
  }
}

async function scrollToViMaxLine(lineNo: number | null) {
  if (!lineNo) return
  await scrollToCppLine(lineNo)
}

function scrollCppEditorToLine(lineNo: number) {
  const view = cppEditMode.value ? cppModifyView : cppReadonlyView
  if (!view || lineNo < 1 || lineNo > view.state.doc.lines) return
  const line = view.state.doc.line(lineNo)
  const effects = [
    setCmHighlightLine.of(lineNo),
    EditorView.scrollIntoView(line.from, { y: 'center' }),
  ]
  view.dispatch({
    selection: { anchor: line.from },
    effects,
  })
  if (cppEditMode.value) view.focus()
}

function offsetForLine(content: string, lineNo: number): number {
  if (lineNo <= 1) return 0
  let offset = 0
  let currentLine = 1
  while (currentLine < lineNo && offset < content.length) {
    const nextNewline = content.indexOf('\n', offset)
    if (nextNewline < 0) return content.length
    offset = nextNewline + 1
    currentLine += 1
  }
  return offset
}

function syncCppScroll(source: 'left' | 'right') {
  if (cppSyncScrollFrame) return

  cppSyncScrollFrame = requestAnimationFrame(() => {
    cppSyncScrollFrame = 0
    const left = cppLeftPane.value
    const right = cppRightPane.value
    if (!left || !right) return

    const from = source === 'left' ? left : right
    const to = source === 'left' ? right : left
    to.scrollTop = from.scrollTop
    to.scrollLeft = from.scrollLeft
  })
}

function normalizedBinName(value: any): string {
  return String(value ?? '').trim()
}

const summaryVsRows = computed(() => {
  if (!vsTargetId.value) return []

  const maxSw = Math.max(summaryMaxSw(summary.value), summaryMaxSw(vsSummary.value))
  const leftRows = isDataProgram.value ? expandSummaryRows(summary.value, maxSw) : sortedSummary.value
  const rightRows = (isDataProgram.value || vsTargetSource.value === 'data')
    ? expandSummaryRows(vsSummary.value, maxSw)
    : sortedVsSummary.value
  const leftMap = new Map<string, any>()
  const rightMap = new Map<string, any>()

  leftRows.forEach(row => leftMap.set(String(row.sw_bin), row))
  rightRows.forEach(row => rightMap.set(String(row.sw_bin), row))

  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of leftRows) {
    const key = String(row.sw_bin)
    if (!seen.has(key)) { keys.push(key); seen.add(key) }
  }
  for (const row of rightRows) {
    const key = String(row.sw_bin)
    if (!seen.has(key)) { keys.push(key); seen.add(key) }
  }

  return keys
    .sort((a, b) => {
      const aRow = leftMap.get(a) ?? rightMap.get(a)
      const bRow = leftMap.get(b) ?? rightMap.get(b)
      const aSw = swBinSortValue(aRow)
      const bSw = swBinSortValue(bRow)
      if (aSw !== bSw) return aSw - bSw
      return a.localeCompare(b)
    })
    .map(key => {
      const left = leftMap.get(key)
      const right = rightMap.get(key)
      return {
        key,
        left: left ?? null,
        right: right ?? null,
      }
    })
})

function isSummaryBinNameChanged(row: { left: any | null; right: any | null }): boolean {
  return !!row.left &&
    !!row.right &&
    normalizedBinName(row.left.bin_name) !== normalizedBinName(row.right.bin_name)
}

/**
 * QA行 row_no → 对应 FT 行（按 function 内顺序对齐：第 K 个 QA 行 ↔ 第 K 个 FT 行）
 * 可解决同一 function 有多行 FT/QA 的情况（symbol 不一定完全相同）
 */
const qaToFtMatch = computed(() => {
  const ftByFunc = new Map<string, any[]>()
  const qaByFunc = new Map<string, any[]>()

  for (const p of params.value) {
    if (!p.is_qa) {
      if (!ftByFunc.has(p.function)) ftByFunc.set(p.function, [])
      ftByFunc.get(p.function)!.push(p)
    } else {
      if (!qaByFunc.has(p.function)) qaByFunc.set(p.function, [])
      qaByFunc.get(p.function)!.push(p)
    }
  }

  const map = new Map<number, any>()  // QA row_no → 对应 FT 行
  for (const [func, qaRows] of qaByFunc) {
    const ftRows = ftByFunc.get(func) ?? []
    qaRows.forEach((qaRow: any, i: number) => {
      if (i < ftRows.length) map.set(qaRow.row_no, ftRows[i])
    })
  }
  return map
})

const filteredParams = computed(() => {
  let result = params.value
  // 文本搜索过滤
  const q = paramFilter.value.trim().toLowerCase()
  if (q) {
    result = result.filter(p =>
      (p.symbol   ?? '').toLowerCase().includes(q) ||
      (p.function ?? '').toLowerCase().includes(q)
    )
  }
  // QA 红色预警筛选（仅显示 QA 比 FT 更严的行）
  if (qaAlertFilter.value) {
    result = result.filter(p => {
      if (p.is_qa) {
        return isQaMinRedRow(p) || isQaMaxRedRow(p)
      } else {
        return isQaMinRedRef(p) || isQaMaxRedRef(p)
      }
    })
  }
  return result
})

// ─── QA 红色预警逻辑 ───

/** 非QA行：QA_MIN 列 - qa_min > min 则报警（QA 下限比 FT 更严） */
function isQaMinRedRef(p: any): boolean {
  if (p.qa_min == null || p.min == null) return false
  return Number(p.qa_min) > Number(p.min)
}

/** 非QA行：QA_MAX 列 - qa_max < max 则报警（QA 上限比 FT 更严） */
function isQaMaxRedRef(p: any): boolean {
  if (p.qa_max == null || p.max == null) return false
  return Number(p.qa_max) < Number(p.max)
}

/** QA行：自身 min 比对应位置 FT 行的 min 更严 → 红色 */
function isQaMinRedRow(p: any): boolean {
  const ft = qaToFtMatch.value.get(p.row_no)
  if (!ft || ft.min == null || p.min == null) return false
  return Number(p.min) > Number(ft.min)
}

/** QA行：自身 max 比对应位置 FT 行的 max 更严 → 红色 */
function isQaMaxRedRow(p: any): boolean {
  const ft = qaToFtMatch.value.get(p.row_no)
  if (!ft || ft.max == null || p.max == null) return false
  return Number(p.max) < Number(ft.max)
}

function isQaStrictAlert(p: any): boolean {
  return p.is_qa
    ? isQaMinRedRow(p) || isQaMaxRedRow(p)
    : isQaMinRedRef(p) || isQaMaxRedRef(p)
}

function qaSwBinForAlert(p: any): any {
  return p.is_qa ? p.sw_bin : p.qa_sw_bin
}

// ─── QA 与 FT 相同时淡紫色标识 ───

/** 非QA行：qa_min 与初测 min 相同 → 淡紫底色 */
function isQaMinSameRef(p: any): boolean {
  if (p.qa_min == null || p.min == null) return false
  return Number(p.qa_min) === Number(p.min)
}

/** 非QA行：qa_max 与初测 max 相同 → 淡紫底色 */
function isQaMaxSameRef(p: any): boolean {
  if (p.qa_max == null || p.max == null) return false
  return Number(p.qa_max) === Number(p.max)
}

/** QA行：自身 min 与对应位置 FT 行的 min 相同 → 淡紫底色 */
function isQaMinSameRow(p: any): boolean {
  const ft = qaToFtMatch.value.get(p.row_no)
  if (!ft || ft.min == null || p.min == null) return false
  return Number(p.min) === Number(ft.min)
}

/** QA行：自身 max 与对应位置 FT 行的 max 相同 → 淡紫底色 */
function isQaMaxSameRow(p: any): boolean {
  const ft = qaToFtMatch.value.get(p.row_no)
  if (!ft || ft.max == null || p.max == null) return false
  return Number(p.max) === Number(ft.max)
}

// ─── VS 对比行计算 ───

interface VsRow {
  key: string
  left: any | null   // 当前程序（新版）
  right: any | null  // 对比程序（旧版）
  type: 'same' | 'changed' | 'added' | 'removed'
}

function numericRowNo(row: any | null): number {
  const n = Number(row?.row_no)
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
}

const vsRows = computed<VsRow[]>(() => {
  if (!vsTargetId.value || !vsParams.value.length) return []

  const rightQueues = new Map<string, any[]>()
  for (const p of vsParams.value) {
    const key = `${p.function}|${p.symbol}`
    if (!rightQueues.has(key)) rightQueues.set(key, [])
    rightQueues.get(key)!.push(p)
  }

  for (const queue of rightQueues.values()) {
    queue.sort((a, b) => numericRowNo(a) - numericRowNo(b))
  }

  const makeRow = (key: string, left: any | null, right: any | null): VsRow => {
    let type: VsRow['type'] = 'same'

    if (left && !right) {
      type = 'added'
    } else if (!left && right) {
      type = 'removed'
    } else if (left && right) {
      const limChanged =
        left.min    !== right.min ||
        left.max    !== right.max
      const binChanged =
        left.sw_bin !== right.sw_bin ||
        left.hw_bin !== right.hw_bin
      if (limChanged || binChanged) type = 'changed'
    }

    return { key, left, right, type }
  }

  const rows: VsRow[] = []
  for (const left of params.value) {
    const key = `${left.function}|${left.symbol}`
    const queue = rightQueues.get(key)
    const right = queue?.shift() ?? null
    rows.push(makeRow(key, left, right))
  }

  const removedRows: VsRow[] = []
  for (const [key, queue] of rightQueues.entries()) {
    for (const right of queue) {
      removedRows.push(makeRow(key, null, right))
    }
  }
  removedRows.sort((a, b) => numericRowNo(a.right) - numericRowNo(b.right))

  return [...rows, ...removedRows]
})

function isLimitLoose(row: VsRow): boolean {
  if (!row.left || !row.right) return false
  const lMin = Number(row.left.min),  rMin = Number(row.right.min)
  const lMax = Number(row.left.max),  rMax = Number(row.right.max)
  const hasMin = row.left.min != null && row.right.min != null
  const hasMax = row.left.max != null && row.right.max != null
  return (hasMin && lMin < rMin) || (hasMax && lMax > rMax)
}

function isLimitTight(row: VsRow): boolean {
  if (!row.left || !row.right) return false
  const lMin = Number(row.left.min),  rMin = Number(row.right.min)
  const lMax = Number(row.left.max),  rMax = Number(row.right.max)
  const hasMin = row.left.min != null && row.right.min != null
  const hasMax = row.left.max != null && row.right.max != null
  return (hasMin && lMin > rMin) || (hasMax && lMax < rMax)
}

const vsStats = computed(() => {
  const stats = { added: 0, removed: 0, loose: 0, tight: 0 }
  for (const row of vsRows.value) {
    if (row.type === 'added') stats.added += 1
    if (row.type === 'removed') stats.removed += 1
    if (row.type === 'changed' && isLimitLoose(row)) stats.loose += 1
    if (row.type === 'changed' && isLimitTight(row)) stats.tight += 1
  }
  return stats
})

type VsFilterKey = keyof typeof vsFilter

function setVsFilter(key: VsFilterKey) {
  const nextActive = !vsFilter[key]
  Object.assign(vsFilter, { added: false, removed: false, loose: false, tight: false, diff: false })
  vsFilter[key] = nextActive
}

const filteredVsRows = computed<VsRow[]>(() => {
  let result = vsRows.value

  // 文本搜索
  const q = paramFilter.value.trim().toLowerCase()
  if (q) {
    result = result.filter(r => {
      const sym  = (r.left?.symbol   ?? r.right?.symbol   ?? '').toLowerCase()
      const func = (r.left?.function ?? r.right?.function ?? '').toLowerCase()
      return sym.includes(q) || func.includes(q)
    })
  }

  // VS 类型筛选：互斥单选，未选择时显示全部
  const { added, removed, loose, tight, diff } = vsFilter
  if (added || removed || loose || tight || diff) {
    result = result.filter(r => {
      if (diff && r.type !== 'same') return true
      if (added   && r.type === 'added')   return true
      if (removed && r.type === 'removed') return true
      if (loose && r.type === 'changed' && isLimitLoose(r)) return true
      if (tight && r.type === 'changed' && isLimitTight(r)) return true
      return false
    })
  }

  return result
})

function vsRowClass(row: VsRow): string {
  if (row.type === 'added')   return 'vs-row-added'
  if (row.type === 'removed') return 'vs-row-removed'
  return ''
}

function isVsQaRow(row: VsRow): boolean {
  return row.left?.is_qa === true || row.right?.is_qa === true
}

/**
 * 当前版本（left）的 Min 列样式：
 * left.min < right.min → 下限降低 → 更宽松 → 绿
 * left.min > right.min → 下限升高 → 更严格 → 橙
 */
function leftMinClass(row: VsRow): string {
  if (!row.left || !row.right) return ''
  const l = row.left.min,  r = row.right.min
  if (l == null || r == null) return ''
  const lv = Number(l), rv = Number(r)
  if (lv < rv && isLimitLoose(row)) return 'limit-loose'
  if (lv > rv && isLimitTight(row)) return 'limit-tight'
  return ''
}

/**
 * 当前版本（left）的 Max 列样式：
 * left.max > right.max → 上限升高 → 更宽松 → 绿
 * left.max < right.max → 上限降低 → 更严格 → 橙
 */
function leftMaxClass(row: VsRow): string {
  if (!row.left || !row.right) return ''
  const l = row.left.max,  r = row.right.max
  if (l == null || r == null) return ''
  const lv = Number(l), rv = Number(r)
  if (lv > rv && isLimitLoose(row)) return 'limit-loose'
  if (lv < rv && isLimitTight(row)) return 'limit-tight'
  return ''
}

// ─── 工具函数 ───
function fmtLimit(v: any): string {
  if (v == null) return ''
  const n = Number(v)
  if (isNaN(n)) return String(v)
  if (Math.abs(n) >= 10000 || (Math.abs(n) < 0.001 && n !== 0))
    return n.toExponential(3)
  return parseFloat(n.toPrecision(6)).toString()
}

// ─── API ───
async function switchTab(nextTab: 'param' | 'summary' | 'cpp') {
  if (nextTab === 'cpp' && isDataProgram.value) return
  tab.value = nextTab
  if (nextTab === 'cpp') {
    await loadCppFiles()
    await refreshCppCodeMirrorView()
  } else {
    destroyCppCodeMirrorViews()
  }
}

async function loadData() {
  loading.value = true
  try {
    const paramsUrl = isDataProgram.value
      ? `/programs/data/${currentId.value}/params`
      : `/programs/pgs/${currentId.value}/params`
    const summaryUrl = isDataProgram.value
      ? `/programs/data/${currentId.value}/summary`
      : `/programs/pgs/${currentId.value}/summary`
    const standardUrl = isDataProgram.value
      ? `/programs/data/${currentId.value}/summary_standard`
      : ''
    const listUrl = isDataProgram.value
      ? `/programs/data_list/${encodeURIComponent(productName.value)}?months=${dataMonths.value}`
      : `/programs/pgs_list/${encodeURIComponent(productName.value)}`
    const dataListUrl = `/programs/data_list/${encodeURIComponent(productName.value)}`
    const [p, s, standard, list, dataList] = await Promise.all([
      api.get(paramsUrl),
      api.get(summaryUrl),
      standardUrl ? api.get(standardUrl) : Promise.resolve(null),
      api.get(listUrl),
      isDataProgram.value ? Promise.resolve([]) : api.get(dataListUrl),
    ])
    params.value   = p    as unknown as any[]
    summary.value  = s    as unknown as any[]
    dataSummaryStandard.value = standard
    pgsList.value  = list as unknown as any[]
    dataProgramList.value = dataList as unknown as any[]
    currentPgs.value = (list as unknown as any[]).find((r: any) => r.id === currentId.value) ?? null
  } catch (e: any) {
    alert('加载失败：' + (e?.message ?? '未知错误'))
    router.back()
  } finally {
    loading.value = false
  }
}

async function loadCppFile(uploadId: number) {
  const cached = cppFileCache.get(uploadId)
  if (cached) return cached
  const file = await api.get(`/programs/pgs/${uploadId}/cpp`)
  const cachedFile = { ...(file as any), id: uploadId }
  cppFileCache.set(uploadId, cachedFile)
  return cachedFile
}

async function loadCppFiles() {
  cppLoading.value = true
  cppError.value = ''
  try {
    if (!cppFile.value) {
      cppFile.value = await loadCppFile(currentId.value)
    }
    const modifiedContent = cppModifiedFileCache.get(currentId.value)
    if (!(vsMode.value && vsTargetId.value && vsTargetSource.value === 'pgm') && modifiedContent != null) {
      cppModifiedContent.value = modifiedContent
      cppEditMode.value = true
    }
    if (vsMode.value && vsTargetId.value && vsTargetSource.value === 'pgm') {
      cppEditMode.value = false
    }
    if (vsMode.value && vsTargetId.value && vsTargetSource.value === 'pgm' && (!vsCppFile.value || vsCppFile.value.id !== vsTargetId.value)) {
      vsCppFile.value = await loadCppFile(Number(vsTargetId.value))
    }
    await refreshCppCodeMirrorView()
  } catch (e: any) {
    cppError.value = e?.response?.data?.detail ?? e?.message ?? 'cpp 加载失败'
  } finally {
    cppLoading.value = false
  }
}

async function toggleVsMode() {
  if (vsToggleBusy.value || vsLoading.value || cppLoading.value) return
  vsToggleBusy.value = true
  try {
    vsMode.value = !vsMode.value
    if (vsMode.value) {
      cppEditMode.value = false
      vsTargetSource.value = isDataProgram.value ? 'data' : 'pgm'
      const defaultId = vsTargetSource.value === 'data' ? defaultDataVsId.value : defaultPgmVsId.value
      if (!vsTargetId.value && defaultId != null) {
        vsTargetId.value = defaultId
        await loadVsParams()
      }
      if (!isDataProgram.value && tab.value === 'cpp' && vsTargetSource.value === 'pgm') {
        await loadCppFiles()
        await refreshCppCodeMirrorView()
      }
    } else {
      vsTargetSource.value = isDataProgram.value ? 'data' : 'pgm'
      vsTargetId.value = ''
      vsParams.value   = []
      vsSummary.value  = []
      vsCppFile.value  = null
      Object.assign(vsFilter, { added: false, removed: false, loose: false, tight: false, diff: false })
      if (!isDataProgram.value && tab.value === 'cpp') await refreshCppCodeMirrorView()
    }
  } finally {
    vsToggleBusy.value = false
  }
}

async function onVsSourceChange() {
  cppEditMode.value = false
  vsTargetId.value = ''
  vsParams.value = []
  vsSummary.value = []
  vsCppFile.value = null
  const defaultId = vsTargetSource.value === 'data' ? defaultDataVsId.value : defaultPgmVsId.value
  if (defaultId != null) {
    vsTargetId.value = defaultId
    await loadVsParams()
  }
  if (vsTargetSource.value === 'data' && tab.value === 'cpp') {
    await switchTab('param')
  } else if (!isDataProgram.value && tab.value === 'cpp') {
    await loadCppFiles()
    await refreshCppCodeMirrorView()
  }
}

async function onVsTargetChange() {
  cppEditMode.value = false
  await loadVsParams()
  vsCppFile.value = null
  if (!isDataProgram.value && tab.value === 'cpp' && vsTargetSource.value === 'pgm') {
    await loadCppFiles()
    await refreshCppCodeMirrorView()
  }
}

async function loadVsParams() {
  if (!vsTargetId.value) return
  vsLoading.value = true
  vsParams.value = []
  vsSummary.value = []
  try {
    const paramsUrl = vsTargetSource.value === 'data'
      ? `/programs/data/${vsTargetId.value}/params`
      : `/programs/pgs/${vsTargetId.value}/params`
    const summaryUrl = vsTargetSource.value === 'data'
      ? `/programs/data/${vsTargetId.value}/summary`
      : `/programs/pgs/${vsTargetId.value}/summary`
    const [p, s] = await Promise.all([
      api.get(paramsUrl),
      api.get(summaryUrl),
    ])
    vsParams.value = p as unknown as any[]
    vsSummary.value = s as unknown as any[]
  } catch (e: any) {
    alert('Load compare data failed: ' + (e?.message ?? ''))
  } finally {
    vsLoading.value = false
  }
}
onMounted(() => { loadData() })
onBeforeUnmount(() => { destroyCppCodeMirrorViews() })
</script>

<style scoped>
/* ── 整体页面 ── */
.pgs-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
  overflow: hidden;
}

/* ── Header ── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #e6f4ff 0%, #f0f7ff 100%);
  padding: 10px 18px;
  border-bottom: 1px solid #d0e4f7;
  flex-shrink: 0;
  gap: 12px;
}
.header-left { flex: 1; min-width: 0; }
.header-right { flex-shrink: 0; }

/* ── Breadcrumb ── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  flex-wrap: wrap;
}
.bc-link {
  color: #1890ff;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
}
.bc-link:hover { text-decoration: underline; }
.bc-sep { color: #b0c8e8; font-size: 13px; }
.bc-current {
  font-weight: 700;
  color: #1e3a5f;
  font-family: monospace;
  font-size: 13px;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ver-badge {
  font-size: 10px;
  background: #e6f7ff;
  color: #1890ff;
  border-radius: 6px;
  padding: 1px 6px;
  font-weight: 600;
  white-space: nowrap;
}

/* ── VS 按钮 ── */
.vs-btn {
  padding: 4px 12px;
  border: 1.5px solid #5b21b6;
  border-radius: 16px;
  background: white;
  color: #5b21b6;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
  letter-spacing: 0.5px;
}
.vs-btn:hover { background: #f5f3ff; box-shadow: 0 0 0 2px #ede9fe; }
.vs-btn:disabled,
.vs-btn.vs-disabled {
  cursor: wait;
  opacity: 0.62;
  box-shadow: none;
}
.vs-btn.vs-active {
  background: #5b21b6;
  color: white;
  box-shadow: 0 2px 8px rgba(91,33,182,0.3);
}

/* ── Tab ── */
.pgs-tabs {
  display: flex;
  gap: 4px;
  background: rgba(255,255,255,0.6);
  border-radius: 8px;
  padding: 3px;
  margin-left: 72px;
  flex-shrink: 0;
}
.ptab {
  padding: 5px 18px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #555;
  transition: all 0.15s;
}
.ptab:hover { background: rgba(24,144,255,0.1); color: #1890ff; }
.ptab-active { background: #1890ff !important; color: white !important; }

/* ── VS 对比栏 ── */
/* ── VS 内联选择（Header 内） ── */
.vs-sep { color: #c4b5fd; margin: 0 2px; font-size: 13px; }
.vs-inline-label { font-size: 12px; font-weight: 600; color: #5b21b6; white-space: nowrap; }
.vs-select-inline {
  padding: 3px 8px;
  border: 1.5px solid #c4b5fd;
  border-radius: 6px;
  font-size: 12px;
  color: #3730a3;
  font-family: monospace;
  background: white;
  outline: none;
  min-width: 200px;
  max-width: 420px;
}
.vs-source-select-inline {
  padding: 3px 8px;
  border: 1.5px solid #c4b5fd;
  border-radius: 6px;
  font-size: 12px;
  color: #3730a3;
  background: white;
  outline: none;
  min-width: 74px;
}
.vs-source-select-inline:focus { border-color: #7c3aed; box-shadow: 0 0 0 2px #ede9fe; }
.vs-select-inline:focus { border-color: #7c3aed; box-shadow: 0 0 0 2px #ede9fe; }
.vs-loading-tip { font-size: 12px; color: #888; }

/* ── Loading ── */
.loading-mask { text-align: center; padding: 60px; color: #888; font-size: 15px; }

/* ── Body ── */
.pgs-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* ── Info bar ── */
.info-bar {
  padding: 8px 18px;
  background: #fafbfc;
  border-bottom: 1px solid #e8e8e8;
  font-size: 13px;
  color: #555;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.qa-info-sep { color: #d1d5db; margin: 0 2px; }
.qa-info-tag {
  display: inline-block;
  background: #0284c7;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
}
.qa-info-text { font-size: 12px; color: #555; display: flex; align-items: center; gap: 4px; }
.qa-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 2px; }
.init-dot   { background: #fef3c7; border: 1px solid #fcd34d; }
.qa-row-dot { background: #dbeafe; border: 1px solid #93c5fd; }
.qa-alert-legend { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #b91c1c; }
.alert-dot { display: inline-block; width: 10px; height: 10px; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 2px; flex-shrink: 0; }
/* ── QA 预警筛选按钮 ── */
.qa-alert-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1.5px solid #fca5a5;
  border-radius: 12px;
  background: #fff1f0;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.qa-alert-filter-btn:hover {
  background: #fee2e2;
  border-color: #f87171;
}
.qa-alert-filter-btn.qa-alert-active {
  background: #b91c1c;
  color: white;
  border-color: #b91c1c;
  box-shadow: 0 2px 6px rgba(185,28,28,0.3);
}
.qa-alert-filter-btn.qa-alert-active .alert-dot {
  background: rgba(255,255,255,0.4);
  border-color: rgba(255,255,255,0.6);
}
.qa-bin-alert {
  margin-left: 2px;
  padding: 1px 5px;
  border-radius: 6px;
  background: #fff;
  color: #a8071a;
  font-size: 10px;
  font-weight: 700;
}
.filter-badge {
  font-size: 10px;
  background: rgba(255,255,255,0.25);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}
.filter-input {
  flex: 1;
  max-width: 320px;
  padding: 4px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  margin-left: auto;
}
.filter-input:focus { border-color: #1890ff; }

/* ── Table wrapper ── */
.table-wrap { flex: 1; overflow: auto; }

/* ── Param 表格 ── */
.param-tbl {
  width: auto;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}
.param-tbl th {
  background: #f0f4ff;
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: #3b5bdb;
  border-bottom: 2px solid #c7d5f8;
  position: sticky;
  top: 0;
  z-index: 1;
}
.param-row { transition: background 0.1s; }
.param-row:hover td { background: #f0f7ff; }
.param-tbl td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; color: #333; }
.col-no   { width: 45px; text-align: center; color: #aaa; }
.col-func { text-align: left; color: #5b21b6; font-weight: 500; }
.col-sym  { text-align: left; font-family: monospace; font-size: 11px; }
.col-num  { width: 90px; text-align: center; font-family: monospace; }
.col-unit { width: 65px; text-align: center; color: #0958d9; }
.col-bin  { width: 60px; text-align: center; font-family: monospace; color: #d46b08; font-weight: 600; }
.limit-cell { color: #1d4ed8; font-weight: 500; }
.td-empty { text-align: center; color: #bbb; padding: 30px !important; }

/* ── QA 行 ── */
.qa-row td { background: #eff6ff !important; border-bottom: 1px solid #bfdbfe; }
.qa-row:hover td { background: #dbeafe !important; }
.qa-func { color: #1d4ed8 !important; font-weight: 600 !important; }
.qa-sym  { color: #1e40af !important; }

/* ── QA Limit 列 ── */
.col-qa-hdr {
  background: #fef3c7 !important;
  color: #92400e !important;
  border-bottom-color: #fcd34d !important;
  border-left: 2px solid #fcd34d;
}
/* 左边界作为列分隔线，不设置背景色（让正常/更宽情况和背景同色） */
.qa-limit-cell { border-left: 2px solid #fcd34d; }
.qa-max-col    { border-right: 2px solid #fcd34d; }
.qa-row .qa-limit-cell { background: transparent; }
/* 参考值（正常更宽）：不设置特殊颜色，与背景同色 */
.qa-limit-ref { color: inherit; }
.qa-limit-self { color: inherit; }

/* ── QA 红色预警 ── */
.qa-alert-cell {
  background: #fee2e2 !important;
  color: #b91c1c !important;
  font-weight: 700;
}
/* 在 QA 蓝色行内提升特异性，覆盖 .qa-row td 的蓝色背景 */
.qa-row td.qa-alert-cell {
  background: #fee2e2 !important;
  color: #b91c1c !important;
}

/* ── QA 与 FT 相同 → 淡紫色 ── */
.qa-same-cell {
  background: #f5f3ff !important;
  color: #7c3aed !important;
  font-weight: 600;
}
/* 在 QA 蓝色行内提升特异性 */
.qa-row td.qa-same-cell {
  background: #f5f3ff !important;
  color: #7c3aed !important;
}

/* ══ VS 对比模式 ══ */
/* ── VS 程序名标题行（thead 内，与列对齐） ── */
.vs-prog-row th { border-bottom: 1px solid #e8e8e8 !important; }
.vs-prog-th {
  padding: 6px 10px !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;  /* 允许 ellipsis 在 colspan 内生效 */
}
.vs-prog-th-left  { background: #e6f7ff !important; color: #003eb3 !important; border-right: 1px solid #d0e4f7 !important; }
.vs-prog-th-right { background: #f5f5f5 !important; color: #555 !important; }
.vs-prog-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  margin-right: 4px;
}
.new-badge { background: #bae0ff; color: #003eb3; }
.old-badge { background: #e0e0e0; color: #555; }
.vs-prog-name {
  font-family: monospace;
  font-size: 12px;
  font-weight: 600;
  color: #1e3a5f;
}

.vs-table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* ── VS 表格 ── */
.vs-tbl {
  width: auto;
  border-collapse: collapse;
  font-size: 12px;
  white-space: nowrap;
}
.vs-tbl th {
  background: #f0f4ff;
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: #3b5bdb;
  border-bottom: 2px solid #c7d5f8;
  position: sticky;
  top: 0;
  z-index: 1;
}
.vs-tbl td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; color: #333; }
.vs-row { transition: background 0.1s; }
.vs-row:hover td { background: #f8f8ff; }

/* VS 中间分隔列 */
.vs-mid-col {
  width: 6px !important;
  min-width: 6px;
  padding: 0 !important;
  background: #d0d0d0 !important;
  border: none !important;
}

/* VS 空白占位 */
.vs-empty-side {
  background: #f9f9f9 !important;
  color: #ccc;
  text-align: center;
}

/* VS 行类型底色 */
.vs-row-added  > td { background: #f0fdf4 !important; }
.vs-row-removed > td { background: #f5f5f5 !important; }
.vs-row-added:hover  > td { background: #dcfce7 !important; }
.vs-row-removed:hover > td { background: #ebebeb !important; }
.vs-row.vs-qa-row > td { background: #eff6ff !important; border-bottom: 1px solid #bfdbfe; }
.vs-row.vs-qa-row:hover > td { background: #dbeafe !important; }

/* VS 删除线 */
.vs-deleted {
  text-decoration: line-through;
  color: #9ca3af !important;
}

/* VS Limit 颜色 */
.limit-loose {
  background: #f0fdf4 !important;
  color: #15803d !important;
  font-weight: 700;
}
.limit-tight {
  background: #fff7ed !important;
  color: #c2410c !important;
  font-weight: 700;
}

/* VS Bin 变化 */
.bin-changed {
  background: #fefce8 !important;
  color: #a16207 !important;
  font-weight: 700;
}
.summary-pass { color: #15803d; }
.summary-fail { color: #b91c1c; }

/* VS 筛选按钮 */
.vs-filters { display: flex; gap: 5px; flex-wrap: wrap; }
.vs-f-btn {
  padding: 3px 10px;
  border-radius: 12px;
  border: 1.5px solid;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  background: white;
}
.vs-f-btn:hover { filter: brightness(0.95); }
.vs-f-added   { border-color: #86efac; color: #15803d; }
.vs-f-removed { border-color: #d1d5db; color: #6b7280; }
.vs-f-loose   { border-color: #86efac; color: #15803d; }
.vs-f-tight   { border-color: #fdba74; color: #c2410c; }
.vs-f-diff    { border-color: #a5b4fc; color: #3730a3; }
.vs-f-active.vs-f-added   { background: #dcfce7; border-color: #22c55e; font-weight: 700; }
.vs-f-active.vs-f-removed { background: #f3f4f6; border-color: #9ca3af; font-weight: 700; }
.vs-f-active.vs-f-loose   { background: #dcfce7; border-color: #22c55e; font-weight: 700; }
.vs-f-active.vs-f-tight   { background: #fff7ed; border-color: #f97316; font-weight: 700; }
.vs-f-active.vs-f-diff    { background: #e0e7ff; border-color: #6366f1; font-weight: 700; }

/* VS 无对比选择提示 */
.vs-empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: #aaa;
}

/* ══ cpp viewer ══ */
.cpp-body {
  position: relative;
  background: #f8fafc;
}
.cpp-body > .loading-mask {
  display: none;
}
.cpp-loading-overlay {
  position: absolute;
  inset: 36px 0 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(248, 250, 252, 0.65);
  backdrop-filter: blur(1px);
}
.cpp-loading-dialog {
  width: min(360px, calc(100% - 48px));
  padding: 18px 20px 20px;
  border: 1px solid #d8e1ef;
  border-radius: 8px;
  background: transparent;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
}
.cpp-loading-title {
  font-size: 15px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 6px;
}
.cpp-loading-subtitle {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 14px;
}
.cpp-progress {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e5e7eb;
}
.cpp-progress-bar {
  width: 42%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #facc15, #38bdf8);
  animation: cpp-progress-slide 1.05s ease-in-out infinite;
}
.cpp-loading-stage {
  margin-top: 10px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
  color: #64748b;
}
@keyframes cpp-progress-slide {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(250%); }
}
.cpp-info { min-height: 36px; }
.cpp-error {
  color: #b91c1c;
  font-weight: 600;
  font-size: 12px;
}
.cpp-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(170px, var(--cpp-nav-width, 220px)) 6px minmax(0, 1fr) 310px;
  overflow: hidden;
}
.cpp-layout-no-vi {
  grid-template-columns: minmax(170px, var(--cpp-nav-width, 220px)) 6px minmax(0, 1fr);
}
.cpp-overview {
  background: #eef2f7;
  overflow: auto;
  padding: 8px;
}
.cpp-nav-resizer {
  width: 6px;
  min-width: 6px;
  cursor: col-resize;
  background: #d8dee9;
  border-left: 1px solid #cbd5e1;
  border-right: 1px solid #cbd5e1;
}
.cpp-nav-resizer:hover {
  background: #93c5fd;
}
.cpp-overview-title {
  font-family: monospace;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  margin: 2px 4px 8px;
}
.cpp-nav-item {
  width: 100%;
  border: 0;
  background: transparent;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 18px;
  gap: 6px;
  align-items: center;
  padding: 4px 5px;
  border-radius: 4px;
  cursor: pointer;
  color: #475569;
  font-family: monospace;
  font-size: 11px;
  text-align: left;
}
.cpp-nav-item:hover {
  background: #dbeafe;
  color: #1d4ed8;
}
.cpp-nav-mismatch {
  color: #b91c1c;
  font-weight: 700;
}
.cpp-nav-mismatch .cpp-nav-text {
  color: #dc2626;
}
.cpp-nav-vi-flow {
  color: #1d4ed8;
  font-weight: 700;
}
.cpp-nav-vi-flow .cpp-nav-text {
  color: #2563eb;
}
.cpp-nav-vi-range {
  color: #b91c1c;
  font-weight: 800;
}
.cpp-nav-vi-range .cpp-nav-text {
  color: #dc2626;
}
.cpp-nav-active {
  background: #fff7d6;
  box-shadow: inset 3px 0 0 #f59e0b;
}
.cpp-nav-active:hover {
  background: #ffefad;
}
.cpp-nav-index {
  color: #64748b;
  text-align: right;
}
.cpp-nav-mark {
  color: #94a3b8;
  text-align: right;
}
.cpp-nav-text {
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.25;
}
.cpp-code-panes {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1px;
  background: #cbd5e1;
}
.cpp-code-panes.cpp-vs-mode {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.vi-check-panel {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border-left: 1px solid #d8dee9;
  background: #f8fafc;
  padding: 10px;
}
.vi-check-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.vi-check-title {
  font-size: 12px;
  font-weight: 800;
  color: #111827;
}
.vi-check-subtitle {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
  color: #64748b;
}
.vi-check-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.vi-check-run {
  border: 1px solid #2563eb;
  border-radius: 5px;
  background: #2563eb;
  color: #fff;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.vi-check-run:hover {
  background: #1d4ed8;
}
.vi-check-action {
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #fff;
  color: #334155;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.vi-check-action:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #60a5fa;
  color: #1d4ed8;
}
.vi-check-action-active {
  background: #eff6ff;
  border-color: #2563eb;
  color: #1d4ed8;
}
.vi-check-action:disabled {
  opacity: 0.45;
  cursor: default;
}
.vi-max-summary {
  background: #f8fafc;
  margin-bottom: 10px;
  padding-bottom: 6px;
}
.vi-max-summary-row {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) minmax(78px, auto) minmax(78px, auto);
  gap: 6px;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  padding: 4px 0;
  font-size: 11px;
  color: #334155;
}
.vi-max-summary-head {
  color: #111827;
  font-weight: 800;
}
.vi-max-source {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, "Courier New", monospace;
  font-weight: 800;
  color: #111827;
}
.vi-max-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: #1d4ed8;
  font: inherit;
  font-family: Consolas, "Courier New", monospace;
  text-align: left;
  cursor: pointer;
}
.vi-max-link:hover:not(:disabled) {
  text-decoration: underline;
}
.vi-max-link:disabled {
  color: #94a3b8;
  cursor: default;
}
.vi-source-metric-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.vi-source-metric-link:hover:not(:disabled) {
  color: #1d4ed8;
  text-decoration: underline;
}
.vi-source-metric-link:disabled {
  color: #94a3b8;
  cursor: default;
}
.vi-check-empty {
  padding: 14px 8px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.5;
}
.vi-check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vi-source-card {
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #fff;
  padding: 8px;
}
.vi-source-range {
  border-color: #fca5a5;
  background: #fff1f2;
}
.vi-source-ok {
  border-color: #86efac;
  background: #f0fdf4;
}
.vi-source-missing-off {
  border-color: #fcd34d;
  background: #fffbeb;
}
.vi-source-missing-zero {
  border-color: #93c5fd;
  background: #eff6ff;
}
.vi-source-name {
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  font-weight: 800;
  color: #111827;
  margin-bottom: 5px;
}
.vi-source-metrics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 3px;
  margin-bottom: 6px;
  font-size: 11px;
  color: #475569;
}
.vi-source-links {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 6px;
}
.vi-line-link {
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 2px 5px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 11px;
  cursor: pointer;
}
.vi-line-link:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #93c5fd;
}
.vi-line-link:disabled {
  cursor: default;
  opacity: 0.45;
}
.vi-source-msg {
  font-size: 11px;
  line-height: 1.45;
  color: #334155;
}
.vi-source-range .vi-source-name,
.vi-source-range .vi-source-msg {
  color: #b91c1c;
}
.vi-source-missing-zero .vi-source-name {
  color: #1d4ed8;
}
.vi-source-missing-off .vi-source-name {
  color: #a16207;
}
.vi-source-ok .vi-source-name {
  color: #15803d;
}
.cpp-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.cpp-pane-head {
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.cpp-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 12px;
  color: #334155;
}
.cpp-download-btn {
  flex-shrink: 0;
  border: 1px solid #bfdbfe;
  border-radius: 5px;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.cpp-download-btn:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #60a5fa;
}
.cpp-download-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.cpp-code-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 18px;
  background: #ffffff;
}
.cpp-edit-scroll {
  position: relative;
  padding: 0;
  background: #ffffff;
}
.cpp-codemirror-host {
  height: 100%;
  min-height: 0;
}
.cpp-codemirror-host :deep(.cm-editor) {
  height: 100%;
}
.cpp-codemirror-host :deep(.cm-line) {
  padding-left: 10px;
  padding-right: 14px;
}
.cpp-codemirror-host :deep(.cm-line-jump) {
  background: #fde68a !important;
  box-shadow: inset 0 0 0 2px #2563eb;
}
.cpp-codemirror-host :deep(.cm-line-jump.cm-activeLine) {
  background: #fde68a !important;
}
.cpp-editor-jump-line {
  position: absolute;
  left: 0;
  right: 0;
  min-width: 1158px;
  height: 18px;
  background: #fde68a;
  box-shadow: inset 0 0 0 2px #2563eb;
  pointer-events: none;
  z-index: 1;
}
.cpp-editor-line-nums {
  position: sticky;
  left: 0;
  z-index: 3;
  padding-top: 6px;
  background: #f1f5f9;
  border-right: 1px solid #e2e8f0;
  user-select: none;
}
.cpp-editor-line-no {
  height: 18px;
  padding-right: 10px;
  text-align: right;
  color: #94a3b8;
  line-height: 18px;
}
.cpp-editor-line-no-active {
  color: #1d4ed8;
  font-weight: 800;
  background: #fde68a;
}
.cpp-editor-code-wrap {
  position: relative;
  z-index: 2;
  width: max(100%, 1100px);
  min-height: 0;
  background: transparent;
}
.cpp-editor-highlight {
  position: relative;
  z-index: 1;
  min-height: inherit;
  margin: 0;
  padding: 6px 10px;
  color: #1f2937;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 18px;
  white-space: pre;
  tab-size: 4;
  pointer-events: none;
}
.cpp-editor-highlight-line {
  display: block;
  height: 18px;
  min-height: 18px;
  line-height: 18px;
}
.cpp-editor {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  resize: none;
  border: 0;
  outline: none;
  padding: 6px 10px;
  background: transparent;
  color: transparent;
  caret-color: #111827;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 18px;
  white-space: pre;
  overflow: hidden;
  tab-size: 4;
}
.cpp-editor::selection {
  background: rgba(37, 99, 235, 0.2);
}
.cpp-line {
  display: grid;
  grid-template-columns: 58px max-content;
  min-width: max-content;
}
.cpp-line:hover,
.cpp-line.cpp-hover-line {
  background: #e8f2ff;
}
.cpp-line.cpp-diff-line {
  background: #fff8d6;
}
.cpp-line.cpp-diff-line:hover,
.cpp-line.cpp-diff-line.cpp-hover-line {
  background: #ffefad;
}
.cpp-line.cpp-jump-line,
.cpp-line.cpp-jump-line:hover,
.cpp-line.cpp-jump-line.cpp-hover-line {
  background: #fde68a !important;
  box-shadow: inset 0 0 0 2px #2563eb;
}
.cpp-line.cpp-empty-line .cpp-line-code {
  background: #f8fafc;
}
.cpp-line-no {
  position: sticky;
  left: 0;
  z-index: 1;
  padding-right: 10px;
  text-align: right;
  color: #94a3b8;
  background: #f1f5f9;
  border-right: 1px solid #e2e8f0;
  user-select: none;
}
.cpp-line-code {
  padding: 0 14px 0 10px;
  white-space: pre;
  color: #1f2937;
}
.cpp-token-comment { color: #008000; }
.cpp-token-number { color: #a31515; }
.cpp-token-string { color: #a31515; }
.cpp-token-keyword { color: #0000ff; }
.cpp-token-macro { color: #af00db; }
.cpp-empty {
  padding: 48px;
  color: #94a3b8;
  text-align: center;
}
</style>
