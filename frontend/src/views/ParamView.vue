<template>
  <div class="param-view">
    <!-- LOT基本信息栏 -->
    <div class="lot-info-bar" v-if="lotInfo">
      <div class="info-grid">
        <div class="info-item"><span class="label">名称</span><span class="value">{{ lotInfo.filename }}</span></div>
        <div class="info-item"><span class="label">程序</span><span class="value">{{ lotInfo.program }}</span></div>
        <div class="info-item"><span class="label">测试机</span><span class="value">{{ lotInfo.test_machine }}</span></div>
        <div class="info-item"><span class="label">工位数</span><span class="value">{{ lotInfo.station_count }}</span></div>
        <div class="info-item"><span class="label">测试项数</span><span class="value">{{ paramList.length }}</span></div>
        <div class="info-item"><span class="label">测试数量</span><span class="value">{{ lotInfo.die_count }}</span></div>
        <div class="info-item"><span class="label">测试PASS</span><span class="value">{{ lotInfo.pass_count }}</span></div>
        <div class="info-item">
          <span class="label">良率</span>
          <span class="value" :style="yieldColor(lotInfo.yield_rate)">
            {{ lotInfo.yield_rate ? (lotInfo.yield_rate * 100).toFixed(2) + '%' : '-' }}
          </span>
        </div>
        <div class="info-item"><span class="label">测试阶段</span><span class="value">{{ lotInfo.data_type }}</span></div>
        <div class="info-item"><span class="label">测试日期</span><span class="value">{{ formatDate(lotInfo.test_date) }}</span></div>
      </div>
    </div>

    <!-- Tab栏 -->
    <div class="tab-bar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        {{ tab.title }}
        <span class="tab-close" @click.stop="closeTab(tab.id)">×</span>
      </div>
    </div>

    <!-- Tab内容 -->
    <div class="tab-content" v-if="currentTab">
      <!-- 图表显示控制栏 (固定在顶部，控制本页 + VS另一半) -->
      <div class="viz-bar">
        <div class="option-item">
          <label>Chart</label>
          <label v-if="!currentTab?.options.trim_step_mode"><input type="checkbox" :checked="currentTab?.options.show_histogram" @change="updateOption('show_histogram', ($event.target as HTMLInputElement).checked)" /> Histogram</label>
          <label><input type="checkbox" :checked="currentTab?.options.show_scatter" @change="updateOption('show_scatter', ($event.target as HTMLInputElement).checked)" /> Scatter</label>
          <label v-if="lotInfo?.data_type === 'CP' && !currentTab?.options.trim_step_mode"><input type="checkbox" :checked="currentTab?.options.show_map" @change="updateOption('show_map', ($event.target as HTMLInputElement).checked)" /> Map Chart</label>
          <button v-if="!currentTab?.options.trim_step_mode" class="btn-vs" :class="{ active: vsMode }" @click="toggleVsMode">VS</button>
          <button class="btn-trim-step" :class="{ active: currentTab?.options.trim_step_mode }" @click="toggleTrimStepMode" title="切换Trim参数合并与Step步进折线模式">Trim_step_mode</button>
        </div>
        <!-- Site 选择 chips：默认仅全S高亮(不含ALL)；点ALL⇄仅ALL聚合；点Sn→多选累加，隐藏ALL聚合 -->
        <div class="site-chips" v-if="currentTab.data">
          <span class="chip chip-all" :class="{ active: isAllChipActive(currentTab) }" @click="onChipClick(currentTab, 0)">ALL</span>
          <span
            v-for="(s, idx) in availableSiteChips(currentTab)"
            :key="s.site"
            class="chip"
            :class="{ active: isSiteChipActive(currentTab, s.site) }"
            :style="chipStyle(s.site)"
            @click="onChipClick(currentTab, s.site)"
          >S{{ s.site }}</span>
        </div>
        <!-- VS 侧的 Site 选择已由顶部全局 chips 统一控制，不再单独显示 -->
      </div>
      <!-- 内容区 -->
      <div class="content-row">
        <div class="charts-area" :style="{ width: (currentTab?.options.scatter_zoom_2x && currentTab?.options.show_scatter ? '1640px' : '840px') }">
          <!-- 顶部Options (移入此处以对齐) -->
          <div class="options-bar">
            <div class="options-left">
              <div class="nav-group">
                <button @click="prevParam">◀ PREV</button>
                <select v-model="currentParamName" @change="onParamSelectChange">
                  <template v-if="currentTab?.options.trim_step_mode">
                    <option v-for="g in trimGroupList" :key="g.base_param" :value="g.base_param">
                      {{ g.item_number }}:{{ g.base_param }} ({{ g.step_count }} Steps)
                    </option>
                  </template>
                  <template v-else>
                    <option v-for="item in paramList" :key="item.item_name" :value="item.item_name">
                      {{ item.item_number }}:{{ item.item_name }}
                    </option>
                  </template>
                </select>
                <button @click="nextParam">NEXT ▶</button>
              </div>

              <div class="option-item">
                <label>Filter</label>
                <select :value="currentTab?.options.filter_type" @change="updateFilterType(($event.target as HTMLSelectElement).value)">
                  <option value="all">All Data</option>
                  <option value="robust">Robust Data</option>
                  <option value="filter_by_limit">Filter By Limit</option>
                  <option value="filter_by_sigma">Filter by Sigma</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div class="option-item" v-if="currentTab?.options.filter_type === 'filter_by_sigma'">
                <label>Sigma</label>
                <input v-model.number="sigmaInputValue" type="number" step="0.5" min="1" max="6" style="width:60px" />
                <button @click="applySigma">Apply</button>
              </div>

              <div class="option-item" v-if="currentTab?.options.filter_type === 'custom'">
                <label>Min</label>
                <input v-model.number="customMinInput" type="number" step="any" style="width:90px" />
                <label>Max</label>
                <input v-model.number="customMaxInput" type="number" step="any" style="width:90px" />
                <label>LL</label>
                <input v-model.number="customLLInput" type="number" step="any" style="width:90px" />
                <label>UL</label>
                <input v-model.number="customULInput" type="number" step="any" style="width:90px" />
                <button @click="applyCustomRange">Apply</button>
              </div>

              <div class="option-item">
                <label>DataRange</label>
                <label><input type="radio" :checked="currentTab?.options.data_range === 'final'" @change="updateOption('data_range', 'final')" /> Final</label>
                <label><input type="radio" :checked="currentTab?.options.data_range === 'original'" @change="updateOption('data_range', 'original')" /> Original</label>
                <label><input type="radio" :checked="currentTab?.options.data_range === 'all'" @change="updateOption('data_range', 'all')" /> All</label>
              </div>

            </div>
          </div>
          <!-- 统计汇总行 (普通模式) -->
          <div class="stats-table" v-if="currentTab.data && !currentTab.options.trim_step_mode">
            <table>
              <thead>
                <tr>
                  <th>SITE</th>
                  <th>Passes</th>
                  <th>Failures</th>
                  <th>Exec Qty</th>
                  <th>Yield</th>
                  <th>Limit_L</th>
                  <th>Limit_H</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Delta</th>
                  <th>Mean</th>
                  <th>Stdev</th>
                  <th>CPK</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in displayedSites(currentTab)" :key="s.site">
                  <td><span class="site-cell-label">{{ s.site === 0 ? 'ALL' : `Site${s.site}` }}</span></td>
                  <td>{{ s.stats.exec_qty - s.stats.fail_count }}</td>
                  <td>{{ s.stats.fail_count }}</td>
                  <td>{{ s.stats.exec_qty }}</td>
                  <td>{{ s.stats.yield_rate ? (s.stats.yield_rate * 100).toFixed(2) + '%' : '-' }}</td>
                  <td>{{ currentTab.data.lower_limit?.toFixed(4) ?? '-' }}</td>
                  <td>{{ currentTab.data.upper_limit?.toFixed(4) ?? '-' }}</td>
                  <td>{{ s.stats.min_val?.toFixed(4) ?? '-' }}</td>
                  <td>{{ s.stats.max_val?.toFixed(4) ?? '-' }}</td>
                  <td>{{ s.stats.max_val != null && s.stats.min_val != null ? (s.stats.max_val - s.stats.min_val).toFixed(4) : '-' }}</td>
                  <td>{{ s.stats.mean?.toFixed(4) ?? '-' }}</td>
                  <td>{{ s.stats.stdev?.toFixed(4) ?? '-' }}</td>
                  <td :style="cpkColor(s.stats.cpk)">{{ s.stats.cpk?.toFixed(4) ?? '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 统计汇总行 (Trim Step 模式) -->
          <div class="stats-table stats-table-trim" v-if="currentTab.data && currentTab.options.trim_step_mode && currentTab.data.trim_data">
            <table>
              <thead>
                <tr>
                  <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:110px;width:120px">Step</th>
                  <th style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:90px">ALL Mean</th>
                  <th
                    v-for="s in displayedTrimSites(currentTab)"
                    :key="'th_s'+s"
                    style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:85px"
                  >Mean_S{{ s }}</th>
                  <!-- Single site expanded Die columns -->
                  <th
                    v-for="(c, cIdx) in singleSiteDieCurves(currentTab)"
                    :key="'th_die_'+c.die_id"
                    style="position:sticky;top:0;background:#fafafa;z-index:2;min-width:75px"
                    :title="'Die #' + (cIdx + 1) + (c.x_coord != null ? ' (X:' + c.x_coord + ', Y:' + c.y_coord + ')' : '')"
                  >#{{ cIdx + 1 }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="step in currentTab.data.trim_data.steps" :key="step.step_index">
                  <td style="min-width:110px;width:120px;font-weight:600"><span class="site-cell-label">Step {{ step.step_index }}</span></td>
                  <td style="font-weight:600">{{ getTrimStepAllMean(currentTab, step)?.toFixed(4) ?? '-' }}</td>
                  <td
                    v-for="s in displayedTrimSites(currentTab)"
                    :key="'td_s'+s"
                    :style="trimSiteCellStyle(currentTab, step, s, displayedTrimSites(currentTab))"
                  >
                    {{ getTrimStepSiteMean(currentTab, step, s)?.toFixed(4) ?? '-' }}
                  </td>
                  <!-- Single site expanded Die cells -->
                  <td
                    v-for="c in singleSiteDieCurves(currentTab)"
                    :key="'td_die_'+c.die_id"
                    :style="{ color: '#555', background: getTrimDieStepValue(currentTab, c, step.step_index).isTrimmed ? '#fafafa' : '#fff' }"
                  >
                    {{ getTrimDieStepValue(currentTab, c, step.step_index).display }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 直方图 (普通模式显示，Trim Step模式隐藏) -->
          <div v-if="currentTab.options.show_histogram && !currentTab.options.trim_step_mode && currentTab.data" class="chart-container" style="flex-direction:column;align-items:center">
            <div :ref="el => setChartRef(currentTab?.id, 'hist', el)" style="width:600px;height:400px"></div>
            <div class="chart-legend">
              <span
                v-for="s in chartSites(currentTab)"
                :key="'hl'+s.site"
                class="chart-legend-item"
                :style="{ '--lg-color': siteColor(s.site) }"
              >{{ legendLabel(s.site) }}</span>
            </div>
          </div>

          <!-- Scatter图 -->
          <div v-if="currentTab.options.show_scatter && currentTab.data" class="chart-container" style="flex-direction:column;align-items:center">
            <div class="scatter-axis-mode-box">
              <template v-if="!currentTab?.options.trim_step_mode">
                <span class="label">Y轴:</span>
                <button
                  :class="['axis-mode-btn', { active: currentTab?.options.scatter_y_mode === 'auto' }]"
                  @click="setScatterYMode('auto')"
                  title="按当前数据最大值/最小值自动缩放"
                >Auto (Max/Min)</button>
                <button
                  :class="['axis-mode-btn', { active: currentTab?.options.scatter_y_mode === 'limit' }]"
                  @click="setScatterYMode('limit')"
                  title="显示 Low/High Limit 并按 Limit 调整 Y 轴"
                >Limit</button>
                <button
                  :class="['axis-mode-btn', { active: currentTab?.options.scatter_y_mode === 'sigma' }]"
                  @click="setScatterYMode('sigma')"
                  title="按均值 ± N 倍标准差调整 Y 轴"
                >N σ</button>
                <input
                  v-model.number="scatterSigmaNInput"
                  type="number"
                  min="1"
                  max="20"
                  step="0.5"
                  class="sigma-input"
                  :disabled="currentTab?.options.scatter_y_mode !== 'sigma'"
                  @change="applyScatterSigmaN"
                />
                <button
                  :class="['axis-mode-btn', { active: currentTab?.options.scatter_x_mode === 'each' }]"
                  style="margin-left: 12px;"
                  @click="toggleScatterXMode"
                  title="按Site顺序连续排列X轴点（例如1-100为Site1，101-200为Site2...），再点一次返回默认"
                >Each</button>
              </template>
              <template v-else>
                <button
                  :class="['axis-mode-btn', { active: currentTab?.options.trim_shift }]"
                  @click="toggleTrimShift"
                  title="将各Site的Step 0基准向全局Step 0均值对齐(消除Site通道固有偏差)"
                >Shift</button>
                <button
                  :class="['axis-mode-btn', { active: currentTab?.options.trim_robust }]"
                  style="margin-left: 8px;"
                  @click="toggleTrimRobust"
                  title="每个Site去除最高10%和最低10%的极值后计算Mean均值"
                >Robust</button>
                <button
                  :class="['axis-mode-btn', { active: currentTab?.options.trim_invert }]"
                  style="margin-left: 8px;"
                  @click="toggleTrimInvert"
                  title="将所有Step按测量值从小到大排序重排，并在图中绘制y=ax+b拟合趋势虚线"
                >Invert</button>
              </template>

              <button
                :class="['axis-mode-btn', { active: currentTab?.options.scatter_zoom_2x }]"
                style="margin-left: auto;"
                @click="toggleScatterZoom"
                :title="currentTab?.options.scatter_zoom_2x ? '点击恢复原尺寸 (1X)' : '点击放大为2倍尺寸 (2X)'"
              >{{ currentTab?.options.scatter_zoom_2x ? '🔍 恢复 (1X)' : '🔍 放大 (2X)' }}</button>
            </div>
            <div
              :ref="el => setChartRef(currentTab?.id, 'scatter', el)"
              :style="{ width: (currentTab?.options.scatter_zoom_2x ? '1600px' : '800px'), height: (currentTab?.options.scatter_zoom_2x ? '800px' : '400px') }"
            ></div>
            <div class="chart-legend">
              <span
                v-for="s in chartSites(currentTab)"
                :key="'sl'+s.site"
                class="chart-legend-item"
                :style="{ '--lg-color': siteColor(s.site) }"
              >{{ legendLabel(s.site) }}</span>
            </div>

            <!-- Trim 5x2 目标步进计算预测框 -->
            <div class="trim-calc-box" v-if="currentTab?.options.trim_step_mode && currentTab?.data?.trim_data">
              <div class="trim-calc-header">
                <span class="trim-calc-title">Trim 步进目标校准计算 (Trim Step Predictor)</span>
                <span class="trim-calc-target-info" v-if="currentTab.data.trim_data.target_param_name">
                  [ 关联目标参数: {{ currentTab.data.trim_data.target_param_name }} ]
                </span>
              </div>
              <table class="trim-calc-table">
                <thead>
                  <tr>
                    <th>Pre 值 (输入)</th>
                    <th>Pre_code (输入)</th>
                    <th>Target (目标值)</th>
                    <th>Post 值 (计算)</th>
                    <th>Post_code (最优Step)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <input
                        v-model.number="trimCalc.preVal"
                        type="number"
                        step="any"
                        class="trim-calc-input"
                        placeholder="Pre数值"
                        @input="onTrimCalcInputChange"
                      />
                    </td>
                    <td>
                      <input
                        v-model.number="trimCalc.preCode"
                        type="number"
                        min="0"
                        :max="currentTab.data.trim_data.step_count - 1"
                        class="trim-calc-input"
                        style="width: 80px;"
                        @input="onTrimCalcInputChange"
                      />
                    </td>
                    <td>
                      <input
                        v-model.number="trimCalc.targetVal"
                        type="number"
                        step="any"
                        class="trim-calc-input"
                        placeholder="Target数值"
                        @input="onTrimCalcInputChange"
                      />
                    </td>
                    <td>
                      <span class="trim-calc-result-val">
                        {{ trimCalcResult.postVal != null ? trimCalcResult.postVal.toFixed(4) : '-' }}
                      </span>
                      <span class="trim-calc-diff" v-if="trimCalcResult.diff != null">
                        (Δ: {{ trimCalcResult.diff >= 0 ? '+' : '' }}{{ trimCalcResult.diff.toFixed(4) }})
                      </span>
                    </td>
                    <td>
                      <span class="trim-calc-result-code">
                        {{ trimCalcResult.postCode != null ? 'Step ' + trimCalcResult.postCode : '-' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Wafer Map -->
          <div v-if="currentTab.options.show_map && currentTab.data && lotInfo?.data_type === 'CP'" class="chart-container" style="flex-direction:column;align-items:center">
            <div class="map-title-box" style="text-align:center;margin-bottom:8px">
              <div style="font-size:13px;font-weight:bold;color:#333">{{ currentTab.item_number }}.{{ currentTab.data.param_name }}</div>
            </div>
            <div style="position:relative">
              <canvas
                :ref="el => setChartRef(currentTab?.id, 'wafer', el)"
                width="820"
                height="600"
                style="width:820px;height:600px;display:block"
              ></canvas>
              <div ref="waferTooltipEl" class="wafer-tooltip" style="display:none"></div>
              <div ref="leftLinkedTooltipEl" class="wafer-tooltip wafer-linked-tooltip" style="display:none"></div>
            </div>
          </div>
        </div>

        <!-- VS Right Panel -->
        <template v-if="vsMode && vsTab">
          <div class="vs-separator"><span>VS</span></div>
          <div class="vs-right-panel" :style="{ width: (vsTab?.options.scatter_zoom_2x && currentTab?.options.show_scatter ? '1640px' : '840px') }">
            <!-- VS mini options bar -->
            <div class="vs-opts-bar">
              <div class="nav-group">
                <button @click="vsPrevParam">◀ PREV</button>
                <select v-model="vsParamName" @change="onVsParamChange">
                  <option v-for="item in paramList" :key="item.item_name" :value="item.item_name">
                    {{ item.item_number }}:{{ item.item_name }}
                  </option>
                </select>
                <button @click="vsNextParam">NEXT ▶</button>
              </div>
              <div class="option-item">
                <label>Filter</label>
                <select :value="vsTab.options.filter_type" @change="updateVsFilterType(($event.target as HTMLSelectElement).value)">
                  <option value="all">All Data</option>
                  <option value="robust">Robust Data</option>
                  <option value="filter_by_limit">Filter By Limit</option>
                  <option value="filter_by_sigma">Filter by Sigma</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div class="option-item" v-if="vsTab.options.filter_type === 'filter_by_sigma'">
                <label>Sigma</label>
                <input v-model.number="vsSigmaInput" type="number" step="0.5" min="1" max="6" style="width:60px" />
                <button @click="applyVsSigma">Apply</button>
              </div>

              <div class="option-item" v-if="vsTab.options.filter_type === 'custom'">
                <label>Min</label>
                <input v-model.number="vsCustomMinInput" type="number" step="any" style="width:90px" />
                <label>Max</label>
                <input v-model.number="vsCustomMaxInput" type="number" step="any" style="width:90px" />
                <label>LL</label>
                <input v-model.number="vsCustomLLInput" type="number" step="any" style="width:90px" />
                <label>UL</label>
                <input v-model.number="vsCustomULInput" type="number" step="any" style="width:90px" />
                <button @click="applyVsCustomRange">Apply</button>
              </div>
              <div class="option-item">
                <label>DataRange</label>
                <label><input type="radio" :checked="vsTab.options.data_range === 'final'" @change="updateVsOption('data_range','final')" /> Final</label>
                <label><input type="radio" :checked="vsTab.options.data_range === 'original'" @change="updateVsOption('data_range','original')" /> Original</label>
                <label><input type="radio" :checked="vsTab.options.data_range === 'all'" @change="updateVsOption('data_range','all')" /> All</label>
              </div>
            </div>
            <!-- VS stats table -->
            <div class="stats-table" v-if="vsTab.data">
              <table>
                <thead>
                  <tr>
                    <th>SITE</th><th>Passes</th><th>Failures</th><th>Exec Qty</th><th>Yield</th>
                    <th>Limit_L</th><th>Limit_H</th><th>Min</th><th>Max</th><th>Delta</th><th>Mean</th><th>Stdev</th><th>CPK</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in displayedSites(vsTab)" :key="s.site">
                    <td><span class="site-cell-label">{{ s.site === 0 ? 'ALL' : `Site${s.site}` }}</span></td>
                    <td>{{ s.stats.exec_qty - s.stats.fail_count }}</td>
                    <td>{{ s.stats.fail_count }}</td>
                    <td>{{ s.stats.exec_qty }}</td>
                    <td>{{ s.stats.yield_rate ? (s.stats.yield_rate * 100).toFixed(2) + '%' : '-' }}</td>
                    <td>{{ vsTab.data.lower_limit?.toFixed(4) ?? '-' }}</td>
                    <td>{{ vsTab.data.upper_limit?.toFixed(4) ?? '-' }}</td>
                    <td>{{ s.stats.min_val?.toFixed(4) ?? '-' }}</td>
                    <td>{{ s.stats.max_val?.toFixed(4) ?? '-' }}</td>
                    <td>{{ s.stats.max_val != null && s.stats.min_val != null ? (s.stats.max_val - s.stats.min_val).toFixed(4) : '-' }}</td>
                    <td>{{ s.stats.mean?.toFixed(4) ?? '-' }}</td>
                    <td>{{ s.stats.stdev?.toFixed(4) ?? '-' }}</td>
                    <td :style="cpkColor(s.stats.cpk)">{{ s.stats.cpk?.toFixed(4) ?? '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- VS Histogram -->
            <div v-if="currentTab.options.show_histogram && vsTab.data" class="chart-container" style="flex-direction:column;align-items:center">
              <div :ref="el => setChartRef(VS_TAB_ID, 'hist', el)" style="width:600px;height:400px"></div>
              <div class="chart-legend">
                <span
                  v-for="s in chartSites(vsTab)"
                  :key="'vhl'+s.site"
                  class="chart-legend-item"
                  :style="{ '--lg-color': siteColor(s.site) }"
                >{{ legendLabel(s.site) }}</span>
              </div>
            </div>
            <!-- VS Scatter -->
            <div v-if="currentTab.options.show_scatter && vsTab.data" class="chart-container" style="flex-direction:column;align-items:center">
              <div class="scatter-axis-mode-box">
                <span class="label">Y轴:</span>
                <button
                  :class="['axis-mode-btn', { active: vsTab?.options.scatter_y_mode === 'auto' }]"
                  @click="setVsScatterYMode('auto')"
                  title="按当前数据最大值/最小值自动缩放"
                >Auto (Max/Min)</button>
                <button
                  :class="['axis-mode-btn', { active: vsTab?.options.scatter_y_mode === 'limit' }]"
                  @click="setVsScatterYMode('limit')"
                  title="显示 Low/High Limit 并按 Limit 调整 Y 轴"
                >Limit</button>
                <button
                  :class="['axis-mode-btn', { active: vsTab?.options.scatter_y_mode === 'sigma' }]"
                  @click="setVsScatterYMode('sigma')"
                  title="按均值 ± N 倍标准差调整 Y 轴"
                >N σ</button>
                <input
                  v-model.number="vsScatterSigmaNInput"
                  type="number"
                  min="1"
                  max="20"
                  step="0.5"
                  class="sigma-input"
                  :disabled="vsTab?.options.scatter_y_mode !== 'sigma'"
                  @change="applyVsScatterSigmaN"
                />
                <button
                  :class="['axis-mode-btn', { active: vsTab?.options.scatter_x_mode === 'each' }]"
                  style="margin-left: 12px;"
                  @click="toggleVsScatterXMode"
                  title="按Site顺序连续排列X轴点（例如1-100为Site1，101-200为Site2...），再点一次返回默认"
                >Each</button>
                <button
                  :class="['axis-mode-btn', { active: vsTab?.options.scatter_zoom_2x }]"
                  style="margin-left: auto;"
                  @click="toggleVsScatterZoom"
                  :title="vsTab?.options.scatter_zoom_2x ? '点击恢复原尺寸 (1X)' : '点击放大为2倍尺寸 (2X)'"
                >{{ vsTab?.options.scatter_zoom_2x ? '🔍 恢复 (1X)' : '🔍 放大 (2X)' }}</button>
              </div>
              <div
                :ref="el => setChartRef(VS_TAB_ID, 'scatter', el)"
                :style="{ width: (vsTab?.options.scatter_zoom_2x ? '1600px' : '800px'), height: (vsTab?.options.scatter_zoom_2x ? '800px' : '400px') }"
              ></div>
              <div class="chart-legend">
                <span
                  v-for="s in chartSites(vsTab)"
                  :key="'vsl'+s.site"
                  class="chart-legend-item"
                  :style="{ '--lg-color': siteColor(s.site) }"
                >{{ legendLabel(s.site) }}</span>
              </div>
            </div>
            <!-- VS Wafer Map -->
            <div v-if="currentTab.options.show_map && vsTab.data && lotInfo?.data_type === 'CP'" class="chart-container" style="flex-direction:column;align-items:center">
              <div class="map-title-box" style="text-align:center;margin-bottom:8px">
                <div style="font-size:13px;font-weight:bold;color:#333">{{ vsTab.item_number }}.{{ vsTab.data.param_name }}</div>
              </div>
              <div style="position:relative">
                <canvas
                  :ref="el => setChartRef(VS_TAB_ID, 'wafer', el)"
                  width="820" height="600"
                  style="width:820px;height:600px;display:block"
                ></canvas>
                <div ref="vsWaferTooltipEl" class="wafer-tooltip" style="display:none"></div>
                <div ref="vsLinkedTooltipEl" class="wafer-tooltip wafer-linked-tooltip" style="display:none"></div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts'
import api from '@/api'
import { fmtDateTz } from '@/utils/dateUtils'

const route = useRoute()
const lotId = ref(Number(route.params.id))
const initialParam = ref(decodeURIComponent(route.params.param as string))

const lotInfo = ref<any>(null)
const paramList = ref<any[]>([])
const currentParamName = ref(initialParam.value)
const activeTab = ref('')
const tabCounter = ref(0)

// VS mode
const VS_TAB_ID = '__vs__'
const vsMode = ref(false)
const vsTab = ref<Tab | null>(null)
const vsParamName = ref('')
const vsSigmaInput = ref(3)
const vsCustomMinInput = ref<number | null>(null)
const vsCustomMaxInput = ref<number | null>(null)
const vsCustomLLInput = ref<number | null>(null)
const vsCustomULInput = ref<number | null>(null)
const vsHiddenSites = ref<Set<number>>(new Set())

// Tooltip DOM refs
const waferTooltipEl = ref<HTMLDivElement | null>(null)
const leftLinkedTooltipEl = ref<HTMLDivElement | null>(null)
const vsWaferTooltipEl = ref<HTMLDivElement | null>(null)
const vsLinkedTooltipEl = ref<HTMLDivElement | null>(null)

// 隐藏的Site集合（响应式，用于图例点击切换，仅重绘wafer canvas）
const hiddenSites = ref<Set<number>>(new Set())

// Wafer map state per tab (for hit-testing on hover)
const waferMapState: Record<string, {
  dies: { px: number; py: number; width: number; height: number; dieX: number; dieY: number; val: number; site: number, lvl: number }[]
  canvasEl: HTMLCanvasElement | null
  legendBlocks?: { lvl: number, x: number, y: number, w: number, h: number }[]
  activeLevel?: number | null
}> = {}

interface Tab {
  id: string
  title: string
  item_number: number | string
  param_name: string
  options: any
  data: any
}

interface TrimGroup {
  base_param: string
  item_number: number | string
  step_count: number
  steps: { item_number: number | string; item_name: string; step: number }[]
}

const tabs = ref<Tab[]>([])
const currentTab = computed(() => tabs.value.find(t => t.id === activeTab.value))

const draftOptions = ref({
  filter_type: 'all',
  data_range: 'final',
  sigma: 3,
  custom_min: null as number | null,
  custom_max: null as number | null,
  custom_ll: null as number | null,
  custom_ul: null as number | null,
  show_histogram: true,
  show_scatter: true,
  show_map: true,
  trim_step_mode: false,    // Trim Step mode toggle
  trim_shift: false,        // Trim Shift mode: align Site Step 0 to All-Site Step 0 Mean
  trim_robust: false,       // Trim Robust mode: 10% trimmed mean for each site
  trim_invert: false,       // Trim Invert mode: sort steps ascending by mean and draw y=ax+b trend line
  scatter_y_mode: 'auto',   // scatter Y-axis range mode: 'auto' | 'limit' | 'sigma'
  scatter_sigma_n: 6,        // N value for sigma mode (default 6, matches IdleCheck)
  scatter_x_mode: 'normal' as 'normal' | 'each', // scatter X-axis mode: 'normal' (chronological) | 'each' (grouped by site)
  scatter_zoom_2x: false,    // scatter 2x zoom mode
  site_display_mode: 'site',
  site_view: 'all',       // 'all'(默认: 所有Site，不含ALL聚合) | 'all_only'(仅ALL聚合) | 'site'(多选Site)
  active_sites: [] as number[],  // site_view==='site' 时生效（可多选）
})

// Trim groups computed from paramList
const trimGroupList = computed<TrimGroup[]>(() => {
  const groups: Map<string, TrimGroup> = new Map()
  
  for (const item of paramList.value) {
    const name = item.item_name
    const lower = name.toLowerCase()
    
    // Ignore non-pre/non-trim items
    if (lower.includes('_bit') || lower.includes('prebit') || lower.includes('postbit') || 
        lower.includes('_post') || lower.includes('_target') || lower.includes('_after') || 
        lower.includes('_repost') || lower.includes('compare')) {
      continue
    }
    
    const m = name.match(/^(.*?)(?:_pre|pre)(\d*)$/i)
    if (m) {
      const prefix = m[1]
      const stepStr = m[2]
      const step = stepStr ? parseInt(stepStr, 10) : 0
      const isUnderscore = name.includes('_pre') || name.includes('_PRE') || name.includes('_Pre')
      const preWord = name.includes('_PRE') ? '_PRE' : (name.includes('_Pre') ? '_Pre' : (isUnderscore ? '_pre' : (name.includes('PRE') ? 'PRE' : 'pre')))
      const baseParam = prefix + preWord
      
      if (!groups.has(baseParam)) {
        groups.set(baseParam, {
          base_param: baseParam,
          item_number: item.item_number,
          step_count: 0,
          steps: []
        })
      }
      const g = groups.get(baseParam)!
      g.steps.push({
        item_number: item.item_number,
        item_name: item.item_name,
        step
      })
      g.step_count = g.steps.length
    }
  }
  
  return Array.from(groups.values()).filter(g => g.step_count >= 3)
})

// Available site chips helper for both normal and Trim Step modes
function availableSiteChips(tab: Tab | null | undefined) {
  if (!tab?.data) return []
  if (tab.options?.trim_step_mode && tab.data.trim_data) {
    const rawSites = tab.data.trim_data.sites || []
    return rawSites.map((s: any) => typeof s === 'object' ? s : { site: s })
  }
  if (tab.data.sites) {
    return tab.data.sites.filter((s: any) => s.site > 0)
  }
  return []
}

// Displayed site columns in Trim Step stats table
function displayedTrimSites(tab: Tab | null | undefined): number[] {
  if (!tab?.data?.trim_data?.sites) return []
  const v = tab.options?.site_view ?? 'all'
  if (v === 'site') {
    const active = tab.options?.active_sites ?? []
    return tab.data.trim_data.sites.filter((s: number) => active.includes(s))
  }
  return tab.data.trim_data.sites
}

// Single site die curves helper for Trim Step stats table expansion
function singleSiteDieCurves(tab: Tab | null | undefined): any[] {
  if (!tab?.data?.trim_data?.curves) return []
  const displayed = displayedTrimSites(tab)
  if (displayed.length !== 1) return []
  const siteNum = displayed[0]
  return tab.data.trim_data.curves.filter((c: any) => c.site === siteNum)
}

// Individual die step value calculation for single site table view
function getTrimDieStepValue(tab: Tab | null | undefined, curve: any, stepIdx: number): { display: string; isTrimmed: boolean } {
  if (!curve?.points) return { display: '-', isTrimmed: false }
  const pt = curve.points[stepIdx] || curve.points.find((p: any) => p[0] === stepIdx)
  const rawVal = (pt && pt[1] !== null && pt[1] !== undefined && typeof pt[1] === 'number') ? pt[1] : null
  if (rawVal === null || isNaN(rawVal)) {
    return { display: '-', isTrimmed: false }
  }

  const isShift = !!tab?.options?.trim_shift
  const isRobust = !!tab?.options?.trim_robust

  // 1. Calculate Shifted value
  let val = rawVal
  if (isShift) {
    const step0 = tab?.data?.trim_data?.steps?.[0]
    let all0 = step0?.stats_all?.mean
    if (isRobust) {
      const sites = tab?.data?.trim_data?.sites || []
      const site0RobustMeans = sites
        .map((s: number) => calcTrimStepRobustMean(tab, 0, s))
        .filter((v: number | null): v is number => v !== null && !isNaN(v))
      if (site0RobustMeans.length > 0) {
        all0 = site0RobustMeans.reduce((a: number, b: number) => a + b, 0) / site0RobustMeans.length
      }
    }
    const diePt0 = curve.points.find((p: any) => p[0] === 0)
    const dieRaw0 = (diePt0 && diePt0[1] !== null && typeof diePt0[1] === 'number') ? diePt0[1] : null
    if (all0 != null && dieRaw0 != null) {
      val = rawVal + (all0 - dieRaw0)
    }
  }

  // 2. Check Robust (is this die trimmed/removed at this step?)
  if (isRobust) {
    const siteCurves = tab?.data?.trim_data?.curves?.filter((c: any) => c.site === curve.site) || []
    const allSiteVals: { dieId: any; raw: number }[] = []
    siteCurves.forEach((sc: any) => {
      const p = sc.points?.[stepIdx] || sc.points?.find((ptItem: any) => ptItem[0] === stepIdx)
      if (p && p[1] !== null && p[1] !== undefined && typeof p[1] === 'number' && !isNaN(p[1])) {
        allSiteVals.push({ dieId: sc.die_id, raw: p[1] })
      }
    })

    if (allSiteVals.length >= 5) {
      allSiteVals.sort((a, b) => a.raw - b.raw)
      let cut = Math.floor(allSiteVals.length * 0.10)
      if (allSiteVals.length >= 8 && allSiteVals.length <= 15) {
        cut = Math.max(1, cut)
      } else if (allSiteVals.length > 15) {
        cut = Math.max(1, cut)
      }

      const lowTrimmed = allSiteVals.slice(0, cut)
      const highTrimmed = allSiteVals.slice(allSiteVals.length - cut)
      const isOutlier = lowTrimmed.some(item => item.dieId === curve.die_id) || highTrimmed.some(item => item.dieId === curve.die_id)
      if (isOutlier) {
        return { display: '', isTrimmed: true }
      }
    }
  }

  return { display: val.toFixed(4), isTrimmed: false }
}

// Compute 10% trimmed robust mean for a site at a given step
function calcTrimStepRobustMean(tab: Tab | null | undefined, stepIdx: number, siteNum: number): number | null {
  if (!tab?.data?.trim_data?.curves) return null
  const curves = tab.data.trim_data.curves
  const siteCurves = curves.filter((c: any) => c.site === siteNum)
  if (siteCurves.length === 0) return null

  const vals: number[] = []
  siteCurves.forEach((c: any) => {
    const pt = c.points?.[stepIdx]
    if (pt && pt[1] !== null && pt[1] !== undefined && typeof pt[1] === 'number' && !isNaN(pt[1])) {
      vals.push(pt[1])
    }
  })

  if (vals.length === 0) return null
  if (vals.length < 5) {
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  vals.sort((a, b) => a - b)
  let cut = Math.floor(vals.length * 0.10)
  if (vals.length >= 8 && vals.length <= 15) {
    cut = Math.max(1, cut)
  } else if (vals.length > 15) {
    cut = Math.max(1, cut)
  }

  const trimmed = vals.slice(cut, vals.length - cut)
  if (trimmed.length === 0) return vals[0]
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length
}

// Compute site mean with optional Robust (10% trimmed) and Shift offset
function getTrimStepSiteMean(tab: Tab | null | undefined, step: any, siteNum: number): number | null {
  const isRobust = tab?.options?.trim_robust
  const rawMean = isRobust 
    ? (calcTrimStepRobustMean(tab, step.step_index, siteNum) ?? step?.stats_by_site?.[siteNum]?.mean)
    : step?.stats_by_site?.[siteNum]?.mean

  if (rawMean === null || rawMean === undefined || typeof rawMean !== 'number' || isNaN(rawMean)) {
    return null
  }

  if (tab?.options?.trim_shift && tab?.data?.trim_data?.steps) {
    const step0 = tab.data.trim_data.steps[0]
    let allMean0: number | null = null
    let siteMean0: number | null = null

    if (isRobust) {
      const sites = tab.data.trim_data.sites || []
      const site0RobustMeans = sites
        .map((s: number) => calcTrimStepRobustMean(tab, 0, s))
        .filter((v: number | null): v is number => v !== null && !isNaN(v))
      if (site0RobustMeans.length > 0) {
        allMean0 = site0RobustMeans.reduce((a: number, b: number) => a + b, 0) / site0RobustMeans.length
      }
      siteMean0 = calcTrimStepRobustMean(tab, 0, siteNum) ?? step0?.stats_by_site?.[siteNum]?.mean
    } else {
      allMean0 = step0?.stats_all?.mean
      siteMean0 = step0?.stats_by_site?.[siteNum]?.mean
    }

    if (allMean0 != null && siteMean0 != null) {
      const delta = allMean0 - siteMean0
      return rawMean + delta
    }
  }

  return rawMean
}

// Compute ALL Mean with optional Robust and Shift offset
function getTrimStepAllMean(tab: Tab | null | undefined, step: any): number | null {
  const sites = displayedTrimSites(tab)
  if (sites.length === 0) return step?.stats_all?.mean ?? null

  const isRobust = tab?.options?.trim_robust
  const isShift = tab?.options?.trim_shift

  if (isRobust || isShift) {
    const siteVals = sites
      .map(s => getTrimStepSiteMean(tab, step, s))
      .filter((v): v is number => v !== null && !isNaN(v))
    if (siteVals.length > 0) {
      return siteVals.reduce((a, b) => a + b, 0) / siteVals.length
    }
  }
  return step?.stats_all?.mean ?? null
}

// Highlighting min/max site in Trim Step table
function trimSiteCellStyle(tab: Tab | null | undefined, step: any, siteNum: number, allSites: number[]) {
  const val = getTrimStepSiteMean(tab, step, siteNum)
  if (val === null || val === undefined || typeof val !== 'number' || isNaN(val) || allSites.length < 2) {
    return {}
  }
  const siteMeans = allSites
    .map(s => getTrimStepSiteMean(tab, step, s))
    .filter((v): v is number => v !== null && v !== undefined && typeof v === 'number' && !isNaN(v))
  if (siteMeans.length < 2) return {}
  const maxVal = Math.max(...siteMeans)
  const minVal = Math.min(...siteMeans)
  if (maxVal === minVal) return {}
  if (Math.abs(val - maxVal) < 1e-9) return { color: 'red', fontWeight: 'bold' }
  if (Math.abs(val - minVal) < 1e-9) return { color: 'green', fontWeight: 'bold' }
  return {}
}

async function toggleTrimStepMode() {
  if (!currentTab.value) return
  const willBeTrim = !currentTab.value.options.trim_step_mode
  currentTab.value.options.trim_step_mode = willBeTrim
  
  if (willBeTrim) {
    currentTab.value.options.show_histogram = false
    const curName = currentParamName.value
    let group = trimGroupList.value.find(g => g.base_param === curName || g.steps.some(s => s.item_name === curName))
    if (!group && trimGroupList.value.length > 0) {
      group = trimGroupList.value[0]
    }
    if (group) {
      currentParamName.value = group.base_param
      currentTab.value.param_name = group.base_param
      currentTab.value.item_number = group.item_number
      currentTab.value.title = `${group.item_number}:${group.base_param} [Trim]`
    }
  } else {
    currentTab.value.options.show_histogram = true
    const paramItem = paramList.value.find(p => p.item_name === currentParamName.value)
    if (paramItem) {
      currentTab.value.title = `${paramItem.item_number}:${paramItem.item_name}`
    }
  }
  await loadTabData(currentTab.value.id)
}

function onParamSelectChange() {
  if (currentTab.value?.options?.trim_step_mode) {
    const group = trimGroupList.value.find(g => g.base_param === currentParamName.value)
    if (group && currentTab.value) {
      currentTab.value.param_name = group.base_param
      currentTab.value.item_number = group.item_number
      currentTab.value.title = `${group.item_number}:${group.base_param} [Trim]`
      loadTabData(currentTab.value.id)
      return
    }
  }
  addTab()
}

function toggleTrimShift() {
  if (!currentTab.value) return
  currentTab.value.options.trim_shift = !currentTab.value.options.trim_shift
  renderScatter(currentTab.value.id)
}

function toggleTrimRobust() {
  if (!currentTab.value) return
  currentTab.value.options.trim_robust = !currentTab.value.options.trim_robust
  renderScatter(currentTab.value.id)
}

function toggleTrimInvert() {
  if (!currentTab.value) return
  currentTab.value.options.trim_invert = !currentTab.value.options.trim_invert
  renderScatter(currentTab.value.id)
}

// ── Trim 5x2 步进目标校准计算器 ──────────────────────────────
const trimCalc = ref({
  preVal: null as number | null,
  preCode: 0,
  targetVal: null as number | null,
})

const trimCalcResult = computed(() => {
  if (!currentTab.value?.options?.trim_step_mode || !currentTab.value?.data?.trim_data) {
    return { postVal: null, postCode: null, diff: null }
  }
  const steps = currentTab.value.data.trim_data.steps || []
  if (steps.length === 0) return { postVal: null, postCode: null, diff: null }

  const target = trimCalc.value.targetVal
  if (target === null || target === undefined || isNaN(target)) {
    return { postVal: null, postCode: null, diff: null }
  }

  const preCode = Math.max(0, Math.min(steps.length - 1, trimCalc.value.preCode || 0))
  const preStep = steps[preCode] || steps[0]
  const baseMean = getTrimStepAllMean(currentTab.value, preStep) ?? preStep?.stats_all?.mean ?? 0

  const userPre = (trimCalc.value.preVal !== null && trimCalc.value.preVal !== undefined && !isNaN(trimCalc.value.preVal))
    ? trimCalc.value.preVal 
    : baseMean

  let bestStep = 0
  let bestEst = userPre
  let minDiff = Infinity

  steps.forEach((s: any) => {
    const sMean = getTrimStepAllMean(currentTab.value, s) ?? s.stats_all?.mean ?? baseMean
    const est = userPre + (sMean - baseMean)
    const diff = Math.abs(est - target)
    if (diff < minDiff) {
      minDiff = diff
      bestStep = s.step_index
      bestEst = est
    }
  })

  return {
    postVal: bestEst,
    postCode: bestStep,
    diff: bestEst - target
  }
})

function onTrimCalcInputChange() {
  if (currentTab.value?.options?.trim_step_mode) {
    renderScatter(currentTab.value.id)
  }
}

const sigmaInputValue = ref(draftOptions.value.sigma)
const customMinInput = ref<number | null>(null)
const customMaxInput = ref<number | null>(null)
const customLLInput = ref<number | null>(null)
const customULInput = ref<number | null>(null)

// Scatter Y-axis range mode controls (Auto / Limit / N sigma)
const scatterSigmaNInput = ref<number>(6)

function setScatterYMode(mode: 'auto' | 'limit' | 'sigma') {
  if (!currentTab.value) return
  currentTab.value.options.scatter_y_mode = mode
  renderScatter(currentTab.value.id)
}

function applyScatterSigmaN() {
  if (!currentTab.value) return
  currentTab.value.options.scatter_sigma_n = scatterSigmaNInput.value
  renderScatter(currentTab.value.id)
}

function toggleScatterXMode() {
  if (!currentTab.value) return
  currentTab.value.options.scatter_x_mode = currentTab.value.options.scatter_x_mode === 'each' ? 'normal' : 'each'
  renderScatter(currentTab.value.id)
}

function toggleScatterZoom() {
  if (!currentTab.value) return
  currentTab.value.options.scatter_zoom_2x = !currentTab.value.options.scatter_zoom_2x
  nextTick(() => {
    chartInstances[`${currentTab.value!.id}_scatter`]?.resize()
  })
}

// VS 侧 Scatter Y轴：独立控制
const vsScatterSigmaNInput = ref<number>(6)

function setVsScatterYMode(mode: 'auto' | 'limit' | 'sigma') {
  if (!vsTab.value) return
  vsTab.value.options.scatter_y_mode = mode
  renderScatter(VS_TAB_ID)
}

function applyVsScatterSigmaN() {
  if (!vsTab.value) return
  vsTab.value.options.scatter_sigma_n = vsScatterSigmaNInput.value
  renderScatter(VS_TAB_ID)
}

function toggleVsScatterXMode() {
  if (!vsTab.value) return
  vsTab.value.options.scatter_x_mode = vsTab.value.options.scatter_x_mode === 'each' ? 'normal' : 'each'
  renderScatter(VS_TAB_ID)
}

function toggleVsScatterZoom() {
  if (!vsTab.value) return
  vsTab.value.options.scatter_zoom_2x = !vsTab.value.options.scatter_zoom_2x
  nextTick(() => {
    chartInstances[`${VS_TAB_ID}_scatter`]?.resize()
  })
}

watch(currentTab, (newTab) => {
  if (newTab) {
    sigmaInputValue.value = newTab.options.sigma
    customMinInput.value = newTab.options.custom_min
    customMaxInput.value = newTab.options.custom_max
    customLLInput.value = newTab.options.custom_ll
    customULInput.value = newTab.options.custom_ul
    scatterSigmaNInput.value = newTab.options.scatter_sigma_n ?? 6
    currentParamName.value = newTab.param_name
  }
}, { immediate: true })

watch(vsTab, (newTab) => {
  if (newTab) {
    vsSigmaInput.value = newTab.options.sigma
    vsCustomMinInput.value = newTab.options.custom_min
    vsCustomMaxInput.value = newTab.options.custom_max
    vsCustomLLInput.value = newTab.options.custom_ll
    vsCustomULInput.value = newTab.options.custom_ul
    vsScatterSigmaNInput.value = newTab.options.scatter_sigma_n ?? 6
    vsParamName.value = newTab.param_name
  }
}, { immediate: true })

// 切换tab时重置hiddenSites
watch(activeTab, () => {
  hiddenSites.value = new Set()
})

async function updateOption(key: string, value: any) {
  if (!currentTab.value) return
  currentTab.value.options[key] = value
  await loadTabData(currentTab.value.id)
}

async function updateFilterType(value: string) {
  if (!currentTab.value) return
  currentTab.value.options.filter_type = value
  if (value !== 'filter_by_sigma') {
    sigmaInputValue.value = draftOptions.value.sigma
  }
  if (value === 'custom' && currentTab.value.data) {
    const allSite = currentTab.value.data.sites.find((s: any) => s.site === 0)
    if (allSite?.stats) {
      customMinInput.value = allSite.stats.min_val
      customMaxInput.value = allSite.stats.max_val
      currentTab.value.options.custom_min = allSite.stats.min_val
      currentTab.value.options.custom_max = allSite.stats.max_val
    }
    customLLInput.value = currentTab.value.data.lower_limit
    customULInput.value = currentTab.value.data.upper_limit
    currentTab.value.options.custom_ll = currentTab.value.data.lower_limit
    currentTab.value.options.custom_ul = currentTab.value.data.upper_limit
  }
  await loadTabData(currentTab.value.id)
}

function applySigma() {
  if (!currentTab.value) return
  currentTab.value.options.sigma = sigmaInputValue.value
  loadTabData(currentTab.value.id)
}

function applyCustomRange() {
  if (!currentTab.value) return
  currentTab.value.options.custom_min = customMinInput.value
  currentTab.value.options.custom_max = customMaxInput.value
  currentTab.value.options.custom_ll = customLLInput.value
  currentTab.value.options.custom_ul = customULInput.value
  loadTabData(currentTab.value.id)
}

function toggleSite(siteNum: number) {
  const s = new Set(hiddenSites.value)
  if (s.has(siteNum)) s.delete(siteNum)
  else s.add(siteNum)
  hiddenSites.value = s
  if (currentTab.value) {
    const key = `${currentTab.value.id}_wafer`
    const canvas = chartInstances[key]
    if (canvas) renderWaferMap(currentTab.value.id, canvas)
  }
}

function toggleVsSite(siteNum: number) {
  const s = new Set(vsHiddenSites.value)
  if (s.has(siteNum)) s.delete(siteNum)
  else s.add(siteNum)
  vsHiddenSites.value = s
  const canvas = chartInstances[`${VS_TAB_ID}_wafer`]
  if (canvas) renderWaferMap(VS_TAB_ID, canvas)
}

function isSiteSelected(tab: Tab | null | undefined, siteNum: number): boolean {
  if (!tab?.data?.sites) return true
  if (!tab.options?.selected_sites) return true
  return tab.options.selected_sites.includes(siteNum)
}

function toggleSiteSelection(tabId: string, siteNum: number) {
  const tab = getTabById(tabId)
  if (!tab?.data?.sites) return
  if (!tab.options.selected_sites) {
    tab.options.selected_sites = tab.data.sites.map((s: any) => s.site)
  }

  const allSiteNums: number[] = tab.data.sites.map((s: any) => s.site)
  const indivSiteNums: number[] = tab.data.sites.filter((s: any) => s.site > 0).map((s: any) => s.site)

  if (siteNum === 0) {
    if (tab.options.selected_sites.includes(0)) {
      tab.options.selected_sites = []
    } else {
      tab.options.selected_sites = [...allSiteNums]
    }
  } else {
    const idx = tab.options.selected_sites.indexOf(siteNum)
    if (idx >= 0) {
      tab.options.selected_sites.splice(idx, 1)
      const zeroIdx = tab.options.selected_sites.indexOf(0)
      if (zeroIdx >= 0) tab.options.selected_sites.splice(zeroIdx, 1)
    } else {
      tab.options.selected_sites.push(siteNum)
      const allIndivChecked = indivSiteNums.every((s: number) => tab.options.selected_sites.includes(s))
      if (allIndivChecked && !tab.options.selected_sites.includes(0)) {
        tab.options.selected_sites.push(0)
      }
    }
  }

  nextTick(() => {
    if (tabId === VS_TAB_ID) {
      renderVsCharts()
    } else {
      renderCharts(tabId)
    }
  })
}

// 统计表格展示的Site：与图表显示一致（默认仅所有Site；all_only 仅ALL；site 模式仅选中的Site）
function displayedSites(tab: Tab | null | undefined) {
  return chartSites(tab)
}

// 图例标签：site0(ALL聚合) → 用 lotid_waferid；其它 → SiteN
function lotWaferLabel() {
  const li = lotInfo.value
  if (li && li.lot_id && li.wafer_id != null) return `${li.lot_id}_${li.wafer_id}`
  return 'ALL'
}
function siteLabel(site: number) {
  return site === 0 ? lotWaferLabel() : `Site${site}`
}

// 图例标签（与顶部 chip 风格一致）：site0 -> lotid_waferid(如 DPK145_02)，siteN -> S{N}
function legendLabel(site: number) {
  return site === 0 ? lotWaferLabel() : `S${site}`
}

// 选中ALL聚合 chip：仅 all_only(仅ALL聚合) 时高亮；默认/all 状态不显示ALL故不高亮
function isAllChipActive(tab: Tab | null | undefined) {
  if (!tab) return false
  return (tab.options?.site_view ?? 'all') === 'all_only'
}
// 选中单个 Site chip：默认'all'全显时全部高亮；site_view==='site' 时仅选中的高亮
function isSiteChipActive(tab: Tab | null | undefined, siteNum: number) {
  if (!tab) return false
  const v = tab.options?.site_view ?? 'all'
  if (v === 'all') return true
  if (v === 'site') return (tab.options?.active_sites ?? []).includes(siteNum)
  return false // all_only
}
function chipStyle(siteNum: number) {
  // S1..Sx 的颜色：用 site 编号映射 SITE_COLORS
  const c = SITE_COLORS[(siteNum - 1) % SITE_COLORS.length]
  return { '--chip-bg': c } as any
}

// chip 点击逻辑（多选累加 + ALL两态切换）：
//  默认(all, 仅所有Site高亮，不含ALL聚合) → 点ALL → all_only(仅ALL聚合)；点Sn → site(仅选Sn，隐藏ALL聚合)
//  all_only 状态 → 点ALL → 回到 all(所有Site)；点Sn → site(仅选Sn)
//  site(多选) 状态 → 点Sn → 切换该Site选中/取消；点别的Sn → 累加进选中集合
//                   全部取消 → 回到 all；点ALL → 显示所有Site
function onChipClick(tab: Tab | null | undefined, siteNum: number) {
  if (!tab?.options) return
  const v = tab.options.site_view ?? 'all'
  if (siteNum === 0) {
    // ALL chip 两态切换：默认/子集点ALL→仅ALL聚合；all_only 再点→回到所有Site
    if (v === 'all_only') {
      tab.options.site_view = 'all'
    } else if (v === 'site') {
      tab.options.site_view = 'all' // 子集状态点ALL → 显示所有Site
    } else {
      tab.options.site_view = 'all_only' // 默认状态点ALL → 仅ALL聚合
    }
  } else if (v !== 'site') {
    // 从 all / all_only 进入选择模式：只选当前 Site，隐藏ALL聚合
    tab.options.site_view = 'site'
    tab.options.active_sites = [siteNum]
  } else {
    // 多选：切换该 Site 的选中状态
    const set = new Set<number>(tab.options.active_sites ?? [])
    if (set.has(siteNum)) {
      set.delete(siteNum)
    } else {
      set.add(siteNum)
    }
    if (set.size === 0) {
      // 全部取消 → 回到 all（所有Site，不含ALL聚合）
      tab.options.site_view = 'all'
      tab.options.active_sites = []
    } else {
      tab.options.active_sites = [...set].sort((a, b) => a - b)
    }
  }
  const tid = tab.id
  // 全局控制：点击左侧(当前tab) Site chips 时，把选择同步到 VS 右侧面板，
  // 使两侧图表统一受顶部 chips 控制（VS 侧不再有独立 chips）。
  const isLeftTab = tab.id !== VS_TAB_ID
  if (isLeftTab && vsMode.value && vsTab.value) {
    vsTab.value.options.site_view = tab.options.site_view
    vsTab.value.options.active_sites = tab.options.active_sites ? [...tab.options.active_sites] : []
  }
  nextTick(() => {
    renderHistogram(tid); renderScatter(tid)
    const cv = chartInstances[`${tid}_wafer`]
    if (cv) renderWaferMap(tid, cv)
    if (isLeftTab && vsMode.value && vsTab.value) {
      renderHistogram(VS_TAB_ID); renderScatter(VS_TAB_ID)
      const vcv = chartInstances[`${VS_TAB_ID}_wafer`]
      if (vcv) renderWaferMap(VS_TAB_ID, vcv)
    }
  })
}

function chartSites(tab: Tab | null | undefined) {
  if (!tab?.data) return []
  if (tab.options?.trim_step_mode && tab.data.trim_data) {
    const rawSites = tab.data.trim_data.sites || []
    const v = tab.options?.site_view ?? 'all'
    if (v === 'site') {
      const active = tab.options?.active_sites ?? []
      return rawSites.filter((s: number) => active.includes(s)).map((s: number) => ({ site: s }))
    }
    return rawSites.map((s: number) => ({ site: s }))
  }
  if (!tab.data.sites) return []
  const v = tab.options?.site_view ?? 'all'
  if (v === 'all_only') {
    // 仅 ALL 聚合(site=0)
    return tab.data.sites.filter((s: any) => s.site === 0)
  }
  if (v === 'site') {
    const active = tab.options?.active_sites ?? []
    return tab.data.sites.filter((s: any) => s.site > 0 && active.includes(s.site))
  }
  // 默认 all：仅显示所有单个 site(>0)，不显示ALL聚合
  return tab.data.sites.filter((s: any) => s.site > 0)
}

function toggleSiteDisplay(tabId: string) {
  const tab = getTabById(tabId)
  if (!tab) return
  tab.options.site_display_mode = tab.options.site_display_mode === 'all' ? 'site' : 'all'
  nextTick(() => {
    renderHistogram(tabId)
    renderScatter(tabId)
  })
}

// helper: get tab by id (supports VS pseudo-tab)
function getTabById(tabId: string): Tab | null {
  if (tabId === VS_TAB_ID) return vsTab.value
  return tabs.value.find(t => t.id === tabId) ?? null
}

// VS mode toggle
function toggleVsMode() {
  if (vsMode.value) {
    vsMode.value = false
    vsTab.value = null
    // cleanup VS chart instances
    Object.keys(chartInstances).filter(k => k.startsWith(VS_TAB_ID)).forEach(k => {
      if (chartInstances[k]?.dispose) chartInstances[k].dispose()
      delete chartInstances[k]
    })
    if (waferMapState[VS_TAB_ID]) {
      if (waferMapState[VS_TAB_ID].canvasEl) {
        waferMapState[VS_TAB_ID].canvasEl!.onmousemove = null
        waferMapState[VS_TAB_ID].canvasEl!.onmouseleave = null
        waferMapState[VS_TAB_ID].canvasEl!.onclick = null
      }
      delete waferMapState[VS_TAB_ID]
    }
  } else {
    vsMode.value = true
    const src = currentTab.value
    vsParamName.value = src?.param_name ?? ''
    vsSigmaInput.value = src?.options?.sigma ?? 3
    vsHiddenSites.value = new Set()
    vsTab.value = {
      id: VS_TAB_ID,
      title: 'VS',
      item_number: src?.item_number ?? '',
      param_name: src?.param_name ?? '',
      options: src ? JSON.parse(JSON.stringify(src.options)) : { ...draftOptions.value },
      data: null,
    }
    loadVsData()
  }
}

async function loadVsData() {
  if (!vsTab.value) return
  const data = await fetchParamData(vsTab.value.param_name, vsTab.value.options)
  vsTab.value.data = data
  if (data && data.sites && (!vsTab.value.options.selected_sites || vsTab.value.options.selected_sites.length === 0)) {
    vsTab.value.options.selected_sites = data.sites.map((s: any) => s.site)
  }
  await nextTick()
  renderVsCharts()
}

function renderVsCharts() {
  renderHistogram(VS_TAB_ID)
  renderScatter(VS_TAB_ID)
  const canvas = chartInstances[`${VS_TAB_ID}_wafer`]
  if (canvas) renderWaferMap(VS_TAB_ID, canvas)
}

async function updateVsOption(key: string, value: any) {
  if (!vsTab.value) return
  vsTab.value.options[key] = value
  await loadVsData()
}

async function updateVsFilterType(value: string) {
  if (!vsTab.value) return
  vsTab.value.options.filter_type = value
  if (value !== 'filter_by_sigma') vsSigmaInput.value = 3
  
  if (value === 'custom' && vsTab.value.data) {
    const allSite = vsTab.value.data.sites.find((s: any) => s.site === 0)
    if (allSite?.stats) {
      vsCustomMinInput.value = allSite.stats.min_val
      vsCustomMaxInput.value = allSite.stats.max_val
      vsTab.value.options.custom_min = allSite.stats.min_val
      vsTab.value.options.custom_max = allSite.stats.max_val
    }
    vsCustomLLInput.value = vsTab.value.data.lower_limit
    vsCustomULInput.value = vsTab.value.data.upper_limit
    vsTab.value.options.custom_ll = vsTab.value.data.lower_limit
    vsTab.value.options.custom_ul = vsTab.value.data.upper_limit
  }
  
  await loadVsData()
}

function applyVsCustomRange() {
  if (!vsTab.value) return
  vsTab.value.options.custom_min = vsCustomMinInput.value
  vsTab.value.options.custom_max = vsCustomMaxInput.value
  vsTab.value.options.custom_ll = vsCustomLLInput.value
  vsTab.value.options.custom_ul = vsCustomULInput.value
  loadVsData()
}

function applyVsSigma() {
  if (!vsTab.value) return
  vsTab.value.options.sigma = vsSigmaInput.value
  loadVsData()
}

function onVsParamChange() {
  if (!vsTab.value) return
  vsTab.value.param_name = vsParamName.value
  const paramItem = paramList.value.find((p: any) => p.item_name === vsParamName.value)
  vsTab.value.item_number = paramItem?.item_number ?? ''
  loadVsData()
}

function vsPrevParam() {
  const idx = paramList.value.findIndex((p: any) => p.item_name === vsParamName.value)
  if (idx > 0) { vsParamName.value = paramList.value[idx - 1].item_name; onVsParamChange() }
}

function vsNextParam() {
  const idx = paramList.value.findIndex((p: any) => p.item_name === vsParamName.value)
  if (idx < paramList.value.length - 1) { vsParamName.value = paramList.value[idx + 1].item_name; onVsParamChange() }
}

// Show a linked tooltip on the OTHER map when a die is clicked
function showLinkedDieTip(targetTabId: string, dieX: number, dieY: number) {
  const state = waferMapState[targetTabId]
  const tooltipEl = targetTabId === VS_TAB_ID ? vsLinkedTooltipEl.value : leftLinkedTooltipEl.value
  if (!tooltipEl || !state?.canvasEl) return

  const die = state.dies.find(d => d.dieX === dieX && d.dieY === dieY)
  if (die) {
    const rect = state.canvasEl.getBoundingClientRect()
    const scaleX = rect.width / state.canvasEl.width
    const scaleY = rect.height / state.canvasEl.height
    const tipX = (die.px + die.width / 2) * scaleX + 8
    const tipY = (die.py + die.height / 2) * scaleY + 8
    tooltipEl.innerHTML = `<div>X: ${die.dieX}, Y: ${die.dieY}</div><div>Val: ${die.val.toFixed(6)}</div><div>Site: ${die.site}</div>`
    tooltipEl.style.display = 'block'
    tooltipEl.style.left = tipX + 'px'
    tooltipEl.style.top = tipY + 'px'
  } else {
    tooltipEl.innerHTML = `<div>X: ${dieX}, Y: ${dieY}</div><div>No data</div>`
    tooltipEl.style.display = 'block'
    // position at center roughly
    tooltipEl.style.left = '20px'
    tooltipEl.style.top = '20px'
  }
}

// 图表实例存储
const chartInstances: Record<string, any> = {}

function setChartRef(tabId: string | undefined, type: string, el: any) {
  if (!tabId) return
  const key = `${tabId}_${type}`

  if (el) {
    if (type === 'wafer') {
      if (waferMapState[tabId]?.canvasEl) {
        waferMapState[tabId].canvasEl!.onmousemove = null
        waferMapState[tabId].canvasEl!.onmouseleave = null
        waferMapState[tabId].canvasEl!.onclick = null
      }
      chartInstances[key] = el
      if (!waferMapState[tabId]) {
        waferMapState[tabId] = { dies: [], canvasEl: el, legendBlocks: [], activeLevel: null }
      } else {
        waferMapState[tabId].canvasEl = el
      }
      el.onmousemove = (evt: MouseEvent) => onWaferMouseMove(tabId, evt)
      el.onclick = (evt: MouseEvent) => onWaferClick(tabId, evt)
      el.onmouseleave = () => {
        const tipEl = tabId === VS_TAB_ID ? vsWaferTooltipEl.value : waferTooltipEl.value
        if (tipEl) tipEl.style.display = 'none'
      }
      nextTick(() => renderWaferMap(tabId, el))
    } else {
      if (chartInstances[key]?.dispose) {
        chartInstances[key].dispose()
      }
      chartInstances[key] = echarts.init(el)
      nextTick(() => {
        if (type === 'hist') renderHistogram(tabId)
        if (type === 'scatter') renderScatter(tabId)
      })
    }
  } else {
    if (type === 'wafer') {
      if (waferMapState[tabId]?.canvasEl) {
        waferMapState[tabId].canvasEl!.onmousemove = null
        waferMapState[tabId].canvasEl!.onmouseleave = null
        waferMapState[tabId].canvasEl!.onclick = null
      }
      delete waferMapState[tabId]
    } else if (chartInstances[key]?.dispose) {
      chartInstances[key].dispose()
      delete chartInstances[key]
    }
  }
}

function onWaferClick(tabId: string, evt: MouseEvent) {
  const state = waferMapState[tabId]
  if (!state?.canvasEl || !state.legendBlocks) return
  const rect = state.canvasEl.getBoundingClientRect()
  const scaleX = state.canvasEl.width / rect.width
  const scaleY = state.canvasEl.height / rect.height
  const mx = (evt.clientX - rect.left) * scaleX
  const my = (evt.clientY - rect.top) * scaleY

  // Check legend block click first
  for (const b of state.legendBlocks) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      if (state.activeLevel === b.lvl) {
        state.activeLevel = null
      } else {
        state.activeLevel = b.lvl
      }
      renderWaferMap(tabId, state.canvasEl)
      renderScatter(tabId)
      return
    }
  }

  // VS linkage: click a die to show linked tooltip on the other map
  if (vsMode.value) {
    let clickedDie: typeof state.dies[0] | null = null
    for (const d of state.dies) {
      if (mx >= d.px && mx <= d.px + d.width && my >= d.py && my <= d.py + d.height) {
        clickedDie = d
        break
      }
    }
    if (clickedDie) {
      const otherTabId = tabId === VS_TAB_ID ? (currentTab.value?.id ?? '') : VS_TAB_ID
      // hide previous linked tooltip on same side
      const myLinkedTip = tabId === VS_TAB_ID ? leftLinkedTooltipEl.value : vsLinkedTooltipEl.value
      if (myLinkedTip) myLinkedTip.style.display = 'none'
      showLinkedDieTip(otherTabId, clickedDie.dieX, clickedDie.dieY)
    }
  }
}

function onWaferMouseMove(tabId: string, evt: MouseEvent) {
  const state = waferMapState[tabId]
  const tooltipEl = tabId === VS_TAB_ID ? vsWaferTooltipEl.value : waferTooltipEl.value
  if (!state?.canvasEl || !tooltipEl) return

  const rect = state.canvasEl.getBoundingClientRect()
  const scaleX = state.canvasEl.width / rect.width
  const scaleY = state.canvasEl.height / rect.height
  const mx = (evt.clientX - rect.left) * scaleX
  const my = (evt.clientY - rect.top) * scaleY

  let found: typeof state.dies[0] | null = null
  for (const d of state.dies) {
    if (mx >= d.px && mx <= d.px + d.width && my >= d.py && my <= d.py + d.height) {
      found = d
      break
    }
  }

  if (found) {
    tooltipEl.innerHTML = `<div>X: ${found.dieX}, Y: ${found.dieY}</div><div>Val: ${found.val.toFixed(6)}</div><div>Site: ${found.site}</div>`
    tooltipEl.style.display = 'block'
    tooltipEl.style.left = (evt.offsetX + 14) + 'px'
    tooltipEl.style.top = (evt.offsetY + 14) + 'px'
  } else {
    tooltipEl.style.display = 'none'
  }
}

async function fetchParamList() {
  paramList.value = await api.get(`/analysis/lot/${lotId.value}/items`, { params: { site: 0 } })
}

async function fetchLotInfo() {
  lotInfo.value = await api.get(`/analysis/lot/${lotId.value}/info`)
}

async function fetchParamData(paramName: string, options: any): Promise<any> {
  return (await api.get(`/analysis/lot/${lotId.value}/param_data`, {
    params: {
      param_name: paramName,
      filter_type: options.filter_type,
      sigma: options.sigma,
      data_range: options.data_range,
      custom_min: options.filter_type === 'custom' ? options.custom_min : undefined,
      custom_max: options.filter_type === 'custom' ? options.custom_max : undefined,
      custom_ll: options.filter_type === 'custom' ? options.custom_ll : undefined,
      custom_ul: options.filter_type === 'custom' ? options.custom_ul : undefined,
    }
  })) as any
}

async function fetchTrimStepData(baseParam: string, options: any): Promise<any> {
  const group = trimGroupList.value.find(g => g.base_param === baseParam || g.steps.some(s => s.item_name === baseParam))
  const stepNames = group ? group.steps.map(s => s.item_name).join(',') : undefined
  const actualBase = group ? group.base_param : baseParam

  return (await api.get(`/analysis/lot/${lotId.value}/trim_step_data`, {
    params: {
      base_param: actualBase,
      param_names: stepNames,
      filter_type: options.filter_type,
      sigma: options.sigma,
      data_range: options.data_range,
      custom_min: options.filter_type === 'custom' ? options.custom_min : undefined,
      custom_max: options.filter_type === 'custom' ? options.custom_max : undefined,
      custom_ll: options.filter_type === 'custom' ? options.custom_ll : undefined,
      custom_ul: options.filter_type === 'custom' ? options.custom_ul : undefined,
    }
  })) as any
}

function addTab() {
  const paramName = currentParamName.value
  tabCounter.value++
  const tabId = `tab_${tabCounter.value}`
  
  let itemNumber: string | number = ''
  let title = ''
  
  let optionsToUse
  if (currentTab.value) {
    optionsToUse = JSON.parse(JSON.stringify(currentTab.value.options))
    if (currentTab.value.param_name !== paramName) {
      optionsToUse.custom_min = null
      optionsToUse.custom_max = null
      optionsToUse.custom_ll = null
      optionsToUse.custom_ul = null
    }
  } else {
    optionsToUse = { ...draftOptions.value }
  }

  if (optionsToUse.trim_step_mode) {
    const group = trimGroupList.value.find(g => g.base_param === paramName || g.steps.some(s => s.item_name === paramName))
    itemNumber = group?.item_number ?? ''
    title = `${itemNumber}:${paramName} [Trim] #${tabCounter.value}`
  } else {
    const paramItem = paramList.value.find(p => p.item_name === paramName)
    itemNumber = paramItem?.item_number ?? ''
    title = `${itemNumber}:${paramName} #${tabCounter.value}`
  }

  const newTab: Tab = {
    id: tabId,
    title,
    item_number: String(itemNumber),
    param_name: paramName,
    options: optionsToUse,
    data: null,
  }

  if (tabs.value.length >= 10) tabs.value.shift()
  tabs.value.push(newTab)
  activeTab.value = tabId
  loadTabData(tabId)
}

async function loadTabData(tabId: string) {
  const tab = getTabById(tabId)
  if (!tab) return

  if (tab.options.trim_step_mode) {
    const trimData = await fetchTrimStepData(tab.param_name, tab.options)
    tab.data = {
      ...trimData,
      trim_data: trimData,
      param_name: trimData.base_param,
      unit: trimData.unit,
      sites: (trimData.sites || []).map((s: number) => ({ site: s })),
      lower_limit: trimData.steps?.[0]?.lower_limit,
      upper_limit: trimData.steps?.[0]?.upper_limit,
    }

    // Initialize Trim Calculator values
    const baseClean = tab.param_name.replace(/_pre\d*$/i, '').replace(/pre\d*$/i, '')
    const targetItem = paramList.value.find(p => p.item_name.toLowerCase().includes('target') && p.item_name.toLowerCase().includes(baseClean.toLowerCase()))
    const defaultTarget = trimData.target_value ?? targetItem?.lower_limit ?? targetItem?.upper_limit ?? null
    trimCalc.value.targetVal = defaultTarget
    trimCalc.value.preCode = 0
    const step0 = trimData.steps?.[0]
    trimCalc.value.preVal = step0?.stats_all?.mean != null ? parseFloat(step0.stats_all.mean.toFixed(4)) : null
  } else {
    const data = await fetchParamData(tab.param_name, tab.options)
    tab.data = data

    if (data && data.sites && (!tab.options.selected_sites || tab.options.selected_sites.length === 0)) {
      tab.options.selected_sites = data.sites.map((s: any) => s.site)
    }

    if (tab.options.filter_type === 'custom' &&
        tab.options.custom_min == null && tab.options.custom_max == null) {
      const allSite = data.sites.find((s: any) => s.site === 0)
      if (allSite?.stats) {
        tab.options.custom_min = allSite.stats.min_val
        tab.options.custom_max = allSite.stats.max_val
        customMinInput.value = allSite.stats.min_val
        customMaxInput.value = allSite.stats.max_val
      }
      tab.options.custom_ll = data.lower_limit
      tab.options.custom_ul = data.upper_limit
      customLLInput.value = data.lower_limit
      customULInput.value = data.upper_limit
    }
  }

  await nextTick()
  renderCharts(tabId)
}

function closeTab(tabId: string) {
  const idx = tabs.value.findIndex(t => t.id === tabId)
  tabs.value.splice(idx, 1)
  if (activeTab.value === tabId) {
    activeTab.value = tabs.value[tabs.value.length - 1]?.id ?? ''
  }
  Object.keys(chartInstances).filter(k => k.startsWith(tabId)).forEach(k => {
    if (chartInstances[k]?.dispose) chartInstances[k].dispose()
    delete chartInstances[k]
  })
  if (waferMapState[tabId]) {
    if (waferMapState[tabId].canvasEl) {
      waferMapState[tabId].canvasEl!.onmousemove = null
      waferMapState[tabId].canvasEl!.onmouseleave = null
      waferMapState[tabId].canvasEl!.onclick = null
    }
    delete waferMapState[tabId]
  }
}

function prevParam() {
  if (currentTab.value?.options?.trim_step_mode) {
    const list = trimGroupList.value
    const cur = currentParamName.value
    const idx = list.findIndex(g => g.base_param === cur || g.steps.some(s => s.item_name === cur))
    if (idx > 0 && list[idx - 1]) {
      const prevGroup = list[idx - 1]
      currentParamName.value = prevGroup.base_param
      if (currentTab.value) {
        currentTab.value.param_name = prevGroup.base_param
        currentTab.value.item_number = prevGroup.item_number
        currentTab.value.title = `${prevGroup.item_number}:${prevGroup.base_param} [Trim]`
        loadTabData(currentTab.value.id)
      } else {
        addTab()
      }
    }
  } else {
    const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value)
    if (idx > 0) { currentParamName.value = paramList.value[idx - 1].item_name; addTab() }
  }
}

function nextParam() {
  if (currentTab.value?.options?.trim_step_mode) {
    const list = trimGroupList.value
    const cur = currentParamName.value
    const idx = list.findIndex(g => g.base_param === cur || g.steps.some(s => s.item_name === cur))
    if (idx >= 0 && idx < list.length - 1 && list[idx + 1]) {
      const nextGroup = list[idx + 1]
      currentParamName.value = nextGroup.base_param
      if (currentTab.value) {
        currentTab.value.param_name = nextGroup.base_param
        currentTab.value.item_number = nextGroup.item_number
        currentTab.value.title = `${nextGroup.item_number}:${nextGroup.base_param} [Trim]`
        loadTabData(currentTab.value.id)
      } else {
        addTab()
      }
    }
  } else {
    const idx = paramList.value.findIndex(p => p.item_name === currentParamName.value)
    if (idx < paramList.value.length - 1) { currentParamName.value = paramList.value[idx + 1].item_name; addTab() }
  }
}

// ── 常量 ──────────────────────────────────────────────
const SITE_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#e599f7', '#74c0fc', '#a9e34b', '#ffa94d']
// site 颜色：site0(ALL聚合)→深灰；Sn→SITE_COLORS[(n-1)%len]，与 chips 一致
const ALL_SITE_COLOR = '#2563eb'
function siteColor(siteNum: number) {
  return siteNum === 0 ? ALL_SITE_COLOR : SITE_COLORS[(siteNum - 1) % SITE_COLORS.length]
}
const NUM_COLOR_LEVELS = 20

function renderCharts(tabId: string) {
  renderHistogram(tabId)
  renderScatter(tabId)
  const key = `${tabId}_wafer`
  if (chartInstances[key]) renderWaferMap(tabId, chartInstances[key])
}

// 全局数据范围（来自global_edges，用于scatter Y轴和wafer颜色比例尺）
function getGlobalRange(tab: any): { min: number; max: number } {
  const edges: number[] = tab.data.global_edges ?? []
  if (edges.length >= 2) return { min: edges[0], max: edges[edges.length - 1] }
  const allSite = tab.data.sites.find((s: any) => s.site === 0)
  return { min: allSite?.stats?.min_val ?? 0, max: allSite?.stats?.max_val ?? 1 }
}

// ── 直方图 X 轴范围计算 ────────────────────────────────
// 规则（按优先级）：
//   D: 固定值（LL==UL 且 数据无变化）→ 以中心值±50%展示
//   A: 双边Limit且数据在限内     → LL在10%处，UL在90%处
//   B: 双边Limit但数据超限       → LL在20%处，UL在80%处，两侧动态扩展到数据极值
//   E: 单边Limit               → 数据范围+padding，确保该Limit可见
//   C: 无Limit / LL==UL但数据有变化 → 数据min/max+padding
function calcHistXRange(
  dataMin: number, dataMax: number,
  ll: number | null, ul: number | null,
  edgesMin?: number, edgesMax?: number
): { xMin: number; xMax: number; ticks: number[] } {
  const hasLL = ll !== null && ll !== undefined
  const hasUL = ul !== null && ul !== undefined
  const hasBothLimits = hasLL && hasUL

  // Case D: 固定值 — 仅当 LL==UL 且 数据也无变化时
  if (dataMin === dataMax && (!hasBothLimits || ll === ul)) {
    const center = dataMin
    const half = Math.abs(center) * 0.5 || 0.5
    const xMin = center - half
    const xMax = center + half
    const ticks = buildTicks(xMin, xMax, 11)
    return { xMin, xMax, ticks }
  }

  // 当 LL==UL 时，Limit无意义，按数据范围走 Case C
  if (hasBothLimits && ll === ul) {
    const rangeMin = edgesMin ?? dataMin
    const rangeMax = edgesMax ?? dataMax
    const padding = (rangeMax - rangeMin) * 0.05 || Math.abs(rangeMax) * 0.01 || 0.1
    const xMin = rangeMin - padding
    const xMax = rangeMax + padding
    const ticks = buildTicks(xMin, xMax, 11)
    return { xMin, xMax, ticks }
  }

  if (hasBothLimits) {
    // 使用 edges 范围（后端已做 clamp）来判断是否超限
    const effMin = edgesMin ?? dataMin
    const effMax = edgesMax ?? dataMax
    const dataExceedsLimit = effMin < ll! || effMax > ul!

    if (!dataExceedsLimit) {
      // Case A: 数据全在限内，LL在1/10处，UL在9/10处
      const range = (ul! - ll!) / 0.8
      const xMin = ll! - range * 0.1
      const xMax = ul! + range * 0.1
      const ticks = buildTicks(xMin, xMax, 11)
      return { xMin, xMax, ticks }
    } else {
      // Case B: 数据超限
      // X轴中心 = LL/UL中点, LL放在20%位置, UL放在80%位置
      // LL~UL占据中间60%的区间，两侧各20%动态扩展到数据极值
      const limitRange = ul! - ll!
      // LL~UL对应x轴的 [0.2, 0.8]，即60%宽度 = limitRange
      // 总宽度 = limitRange / 0.6
      const totalRange = limitRange / 0.6
      const center = (ll! + ul!) / 2
      let xMin = center - totalRange / 2  // LL在20%处
      let xMax = center + totalRange / 2  // UL在80%处

      // 如果数据超出了默认20%区间，动态扩展到数据极值
      if (effMin < xMin) {
        // 数据最小值比默认下界还小，扩展左侧
        // 保持UL在80%处不变，LL从20%位置向左压缩
        // 新的xMin = effMin，但需要保证LL和UL的相对位置合理
        xMin = effMin - (effMin === ll! ? limitRange * 0.05 : (ll! - effMin) * 0.1)
      }
      if (effMax > xMax) {
        // 数据最大值比默认上界还大，扩展右侧
        xMax = effMax + (effMax === ul! ? limitRange * 0.05 : (effMax - ul!) * 0.1)
      }

      const ticks = buildTicks(xMin, xMax, 11)
      return { xMin, xMax, ticks }
    }
  }

  if (hasLL || hasUL) {
    // Case E: 单边Limit，确保Limit在可见范围内
    const effMin = edgesMin ?? dataMin
    const effMax = edgesMax ?? dataMax
    const rangeMin = hasLL ? Math.min(effMin, ll!) : effMin
    const rangeMax = hasUL ? Math.max(effMax, ul!) : effMax
    const padding = (rangeMax - rangeMin) * 0.05 || Math.abs(rangeMax) * 0.01 || 0.1
    const xMin = rangeMin - padding
    const xMax = rangeMax + padding
    const ticks = buildTicks(xMin, xMax, 11)
    return { xMin, xMax, ticks }
  }

  // Case C: 无Limit，纯数据范围
  const effMin = edgesMin ?? dataMin
  const effMax = edgesMax ?? dataMax
  const padding = (effMax - effMin) * 0.05 || Math.abs(effMax) * 0.01 || 0.1
  const xMin = effMin - padding
  const xMax = effMax + padding
  const ticks = buildTicks(xMin, xMax, 11)
  return { xMin, xMax, ticks }
}

function buildTicks(xMin: number, xMax: number, count: number): number[] {
  const step = (xMax - xMin) / (count - 1)
  return Array.from({ length: count }, (_, i) => xMin + i * step)
}

// ── 直方图渲染 ─────────────────────────────────────────
function renderHistogram(tabId: string) {
  const tab = getTabById(tabId)
  if (!tab?.data) return
  const chart = chartInstances[`${tabId}_hist`]
  if (!chart) return

  const { sites, param_name, unit, lower_limit: ll, upper_limit: ul,
          global_edges, exceeds_limit, ll_bin_index, ul_bin_index } = tab.data
  const allSites = chartSites(tab)
  const edges: number[] = global_edges ?? allSites[0]?.histogram.edges ?? []
  if (edges.length < 2) return

  const allSiteStats = sites.find((s: any) => s.site === 0)?.stats
  const numBins = edges.length - 1

  // ── 判断渲染模式 ──
  if (exceeds_limit && ll_bin_index != null && ul_bin_index != null) {
    // ═══ 超限模式：使用 category 轴，每个 bin 等宽 ═══
    // 生成 category 标签（bin 中心值）
    const binLabels: string[] = []
    for (let i = 0; i < numBins; i++) {
      binLabels.push(((edges[i] + edges[i + 1]) / 2).toFixed(3))
    }

    const series: any[] = []
    allSites.forEach((s: any, idx: number) => {
      const siteStats = s.stats || allSiteStats
      const sigma6L = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean - 6 * siteStats.stdev : -Infinity
      const sigma6U = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean + 6 * siteStats.stdev : Infinity

      const normalData = s.histogram.counts.map((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return '-'
        return cnt
      })
      const outlierData = s.histogram.counts.map((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) return cnt
        return '-'
      })

      series.push({
        type: 'bar',
        name: legendLabel(s.site),
        data: normalData,
        itemStyle: { color: siteColor(s.site), opacity: 0.7 },
        barGap: '-100%',
        barWidth: '90%',
      })

      if (outlierData.some((d: any) => d !== '-')) {
        series.push({
          type: 'bar',
          name: legendLabel(s.site),
          data: outlierData,
          itemStyle: { color: siteColor(s.site), opacity: 0.7 },
          barGap: '-100%',
          barWidth: '90%',
          barMinHeight: 5,
        })
      }
    })

    // markLine：LL/UL 用 category index 定位
    const markLineData: any[] = []
    if (ll !== null && ll !== undefined) {
      markLineData.push({
        xAxis: ll_bin_index,
        label: { formatter: `LL:${ll.toFixed(4)}`, position: 'middle', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }
    if (ul !== null && ul !== undefined) {
      markLineData.push({
        xAxis: ul_bin_index,
        label: { formatter: `UL:${ul.toFixed(4)}`, position: 'middle', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }

    // sigma 线：找到最近的 category index
    if (tab.options.filter_type === 'filter_by_sigma' && allSiteStats?.mean != null && allSiteStats?.stdev != null) {
      const n = tab.options.sigma ?? 3
      const sigmaL = allSiteStats.mean - n * allSiteStats.stdev
      const sigmaU = allSiteStats.mean + n * allSiteStats.stdev
      const findBinIndex = (val: number) => {
        for (let i = 0; i < numBins; i++) {
          if (val >= edges[i] && val < edges[i + 1]) return i
        }
        return val < edges[0] ? 0 : numBins - 1
      }
      markLineData.push({
        xAxis: findBinIndex(sigmaL),
        label: { formatter: `${n}σL`, position: '70%', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
      markLineData.push({
        xAxis: findBinIndex(sigmaU),
        label: { formatter: `${n}σU`, position: '70%', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
    }

    if (series.length > 0) {
      series[0].markLine = { silent: true, symbol: 'none', animation: false, data: markLineData }
    }

    // X轴标签：只在关键位置显示（LL, UL, 起点, 终点, 中间几个）
    const labelPositions = new Set<number>([0, numBins - 1, ll_bin_index, ul_bin_index])
    // 在 LL~UL 区间内均匀加几个标签
    const midStep = Math.max(1, Math.floor((ul_bin_index - ll_bin_index) / 4))
    for (let i = ll_bin_index; i <= ul_bin_index; i += midStep) labelPositions.add(i)
    // 在 below/above 区间也各加一两个
    if (ll_bin_index > 2) labelPositions.add(Math.floor(ll_bin_index / 2))
    if (numBins - ul_bin_index > 2) labelPositions.add(ul_bin_index + Math.floor((numBins - ul_bin_index) / 2))

    chart.setOption({
      title: {
        text: `${tab.item_number}.${param_name}`,
        subtext: allSiteStats
          ? `Min=${allSiteStats.min_val?.toFixed(4)} Max=${allSiteStats.max_val?.toFixed(4)} Mean=${allSiteStats.mean?.toFixed(4)} Stdev=${allSiteStats.stdev?.toFixed(4)} CPK=${allSiteStats.cpk?.toFixed(4)}`
          : '',
        left: 'center',
        textStyle: { fontSize: 13 },
        subtextStyle: { fontSize: 11, color: '#666' },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || params.length === 0) return ''
          const idx = params[0].dataIndex
          const lo = edges[idx]?.toFixed(4) ?? ''
          const hi = edges[idx + 1]?.toFixed(4) ?? ''
          let tip = `<div style="font-size:11px">[${lo}, ${hi})</div>`
          params.forEach((p: any) => {
            if (p.value > 0) tip += `<div>${p.marker} ${p.seriesName}: ${p.value}</div>`
          })
          return tip
        },
      },
      legend: { show: false },
      grid: { top: 48, bottom: 35, left: 55, right: 25 },
      xAxis: {
        type: 'category',
        data: binLabels,
        name: unit,
        axisLine: { onZero: false, show: false },
        axisTick: { alignWithLabel: true, show: true },
        splitLine: { show: true, lineStyle: { type: 'dashed' } },
        axisLabel: {
          rotate: 30,
          fontSize: 10,
          interval: 0,
          formatter: (_: string, index: number) => {
            if (labelPositions.has(index)) {
              // 在 LL 和 UL 位置显示 limit 值
              if (index === ll_bin_index && ll != null) return `LL:${ll.toFixed(4)}`
              if (index === ul_bin_index && ul != null) return `UL:${ul.toFixed(4)}`
              return edges[index]?.toFixed(3) ?? ''
            }
            return ''
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'Parts',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 40,
        axisLine: {
          show: true,
          onZero: false,
          lineStyle: { color: '#333' }
        },
        splitLine: {
          lineStyle: { type: 'dashed' }
        }
      },
      series,
    }, true)
  } else {
    // ═══ 正常模式：使用 value 轴 ═══
    const dataMin = allSiteStats?.min_val ?? edges[0]
    const dataMax = allSiteStats?.max_val ?? edges[edges.length - 1]
    const edgesMin = edges[0]
    const edgesMax = edges[edges.length - 1]
    const { xMin, xMax, ticks } = calcHistXRange(dataMin, dataMax, ll, ul, edgesMin, edgesMax)

    const binCenters = edges.slice(0, -1).map((e: number, i: number) => (e + edges[i + 1]) / 2)
    const xRange = xMax - xMin
    const binW = edges[1] - edges[0]
    const barWidthPct = Math.max(8, (binW / xRange) * 700)

    const series: any[] = []
    allSites.forEach((s: any, idx: number) => {
      const siteStats = s.stats || allSiteStats
      const sigma6L = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean - 6 * siteStats.stdev : -Infinity
      const sigma6U = siteStats?.mean != null && siteStats?.stdev != null ? siteStats.mean + 6 * siteStats.stdev : Infinity

      const normalData: any[] = []
      const outlierData: any[] = []
      
      s.histogram.counts.forEach((cnt: number, i: number) => {
        const center = (edges[i] + edges[i + 1]) / 2
        if ((center < sigma6L || center > sigma6U) && cnt > 0 && cnt < 5) {
          outlierData.push([binCenters[i], cnt])
        } else {
          normalData.push([binCenters[i], cnt])
        }
      })

      series.push({
        type: 'bar',
        name: legendLabel(s.site),
        data: normalData,
        itemStyle: { color: siteColor(s.site), opacity: 0.7 },
        barGap: '-100%',
        barWidth: barWidthPct,
      })

      if (outlierData.length > 0) {
        series.push({
          type: 'bar',
          name: legendLabel(s.site),
          data: outlierData,
          itemStyle: { color: siteColor(s.site), opacity: 0.7 },
          barGap: '-100%',
          barWidth: barWidthPct,
          barMinHeight: 5,
        })
      }
    })

    const markLineData: any[] = []
    if (ll !== null && ll !== undefined) {
      markLineData.push({
        xAxis: ll,
        label: { formatter: `LL:${ll.toFixed(4)}`, position: 'middle', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }
    if (ul !== null && ul !== undefined) {
      markLineData.push({
        xAxis: ul,
        label: { formatter: `UL:${ul.toFixed(4)}`, position: 'middle', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: 'red', rotate: 0 },
        lineStyle: { color: 'red', type: 'dashed', width: 1.5 },
      })
    }

    if (tab.options.filter_type === 'filter_by_sigma' && allSiteStats?.mean != null && allSiteStats?.stdev != null) {
      const n = tab.options.sigma ?? 3
      const sigmaL = allSiteStats.mean - n * allSiteStats.stdev
      const sigmaU = allSiteStats.mean + n * allSiteStats.stdev
      markLineData.push({
        xAxis: sigmaL,
        label: { formatter: `${n}σL`, position: '70%', align: 'left', padding: [0, 0, 0, 8], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
      markLineData.push({
        xAxis: sigmaU,
        label: { formatter: `${n}σU`, position: '70%', align: 'right', padding: [0, 8, 0, 0], fontSize: 10, color: '#00c853', rotate: 0 },
        lineStyle: { color: '#00c853', type: 'dashed', width: 1.5 },
      })
    }

    if (series.length > 0) {
      series[0].markLine = { silent: true, symbol: 'none', animation: false, data: markLineData }
    }

    chart.setOption({
      title: {
        text: `${tab.item_number}.${param_name}`,
        subtext: allSiteStats
          ? `Min=${allSiteStats.min_val?.toFixed(4)} Max=${allSiteStats.max_val?.toFixed(4)} Mean=${allSiteStats.mean?.toFixed(4)} Stdev=${allSiteStats.stdev?.toFixed(4)} CPK=${allSiteStats.cpk?.toFixed(4)}`
          : '',
        left: 'center',
        textStyle: { fontSize: 13 },
        subtextStyle: { fontSize: 11, color: '#666' },
      },
      tooltip: { trigger: 'axis' },
      legend: { show: false },
      grid: { top: 48, bottom: 35, left: 55, right: 25 },
      xAxis: {
        type: 'value',
        name: unit,
        min: xMin,
        max: xMax,
        interval: (xMax - xMin) / 10,
        axisLine: { onZero: false, show: false },
        axisTick: { show: true },
        splitLine: { show: true, lineStyle: { type: 'dashed' } },
        axisLabel: {
          rotate: 30,
          fontSize: 10,
          formatter: (v: number) => {
            const isOnTick = ticks.some(t => Math.abs(t - v) < (xMax - xMin) / 100)
            return isOnTick ? v.toFixed(3) : ''
          },
        },
      },
      yAxis: {
        type: 'value',
        name: 'Parts',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 40,
        axisLine: {
          show: true,
          onZero: false,
          lineStyle: { color: '#333' }
        },
        splitLine: {
          lineStyle: { type: 'dashed' }
        }
      },
      series,
    }, true)
  }
}

// ── Trim Step 折线图渲染 ────────────────────────────────
function renderTrimScatter(tabId: string, tab: Tab, chart: any) {
  const trimData = tab.data.trim_data
  const stepCount = trimData.step_count || trimData.steps?.length || 1
  const maxStep = stepCount - 1
  const curves = trimData.curves || []

  const isShift = !!tab.options?.trim_shift
  const isRobust = !!tab.options?.trim_robust
  const isInvert = !!tab.options?.trim_invert
  const step0 = trimData.steps?.[0]
  const allMean0 = step0?.stats_all?.mean

  // Calculate Invert Step Mapping (分半区物理连续性排序)
  const sortedStepIndices: number[] = []
  const origToNewStepMap: Record<number, number> = {}

  if (isInvert && trimData.steps && trimData.steps.length >= 2) {
    const N = trimData.steps.length
    const M = Math.floor(N / 2) // 1/2 max step 分界点

    const getMean = (idx: number) => {
      const st = trimData.steps?.[idx]
      return (getTrimStepAllMean(tab, st) ?? st?.stats_all?.mean ?? 0)
    }

    // 前半区 (0 ~ M-1)
    const half1Indices: number[] = []
    for (let i = 0; i < M; i++) half1Indices.push(i)
    if (getMean(0) > getMean(M - 1)) {
      half1Indices.reverse() // 下降趋势 -> 倒序为连续递增 [M-1, M-2, ..., 0]
    }

    // 后半区 (M ~ N-1)
    const half2Indices: number[] = []
    for (let i = M; i < N; i++) half2Indices.push(i)
    if (getMean(M) > getMean(N - 1)) {
      half2Indices.reverse() // 下降趋势 -> 倒序为连续递增 [N-1, N-2, ..., M]
    }

    // 比较两半区整体均值以决定排列顺序
    const h1Avg = half1Indices.reduce((sum, idx) => sum + getMean(idx), 0) / (half1Indices.length || 1)
    const h2Avg = half2Indices.reduce((sum, idx) => sum + getMean(idx), 0) / (half2Indices.length || 1)

    const combined = (h1Avg <= h2Avg)
      ? [...half1Indices, ...half2Indices]
      : [...half2Indices, ...half1Indices]

    combined.forEach((origIdx, newIdx) => {
      sortedStepIndices[newIdx] = origIdx
      origToNewStepMap[origIdx] = newIdx
    })
  } else {
    for (let i = 0; i < stepCount; i++) {
      sortedStepIndices[i] = i
      origToNewStepMap[i] = i
    }
  }

  const v = tab.options?.site_view ?? 'all'
  let visibleSites: number[] = trimData.sites || []
  if (v === 'site') {
    visibleSites = tab.options?.active_sites || []
  }

  const filteredCurves = curves.filter((c: any) => visibleSites.includes(c.site))
  const series: any[] = []
  let allVals: number[] = []
  const allFitPoints: { x: number; y: number }[] = []

  visibleSites.forEach(siteNum => {
    const siteCurves = filteredCurves.filter((c: any) => c.site === siteNum)
    if (siteCurves.length === 0) return

    // Global Step 0 baseline for Shift
    let all0 = step0?.stats_all?.mean
    if (isShift && isRobust) {
      const sites = tab.data.trim_data.sites || []
      const site0RobustMeans = sites
        .map((s: number) => calcTrimStepRobustMean(tab, 0, s))
        .filter((v: number | null): v is number => v !== null && !isNaN(v))
      if (site0RobustMeans.length > 0) {
        all0 = site0RobustMeans.reduce((a: number, b: number) => a + b, 0) / site0RobustMeans.length
      }
    }

    const plotData: any[] = []

    siteCurves.forEach((c: any, dieIdx: number) => {
      if (dieIdx > 0) {
        plotData.push([null, null])
      }

      // Find this specific die's raw value at Step 0 to calculate per-die Shift Delta
      let dieDelta = 0
      if (isShift && all0 != null) {
        const diePt0 = c.points?.find((p: any) => p[0] === 0)
        const dieRaw0 = (diePt0 && diePt0[1] !== null && typeof diePt0[1] === 'number') ? diePt0[1] : null
        if (dieRaw0 != null) {
          dieDelta = all0 - dieRaw0
        }
      }

      const diePoints: { newX: number; origX: number; plotVal: number | null; rawVal: number | null; delta: number }[] = []
      c.points.forEach((pt: [number, number | null]) => {
        const origStepIdx = pt[0]
        const newX = origToNewStepMap[origStepIdx] ?? origStepIdx
        const rawVal = pt[1]
        let plotVal: number | null = rawVal
        if (rawVal !== null && typeof rawVal === 'number') {
          if (isShift) {
            plotVal = rawVal + dieDelta
          }
          allVals.push(plotVal)
        }
        diePoints.push({ newX, origX: origStepIdx, plotVal, rawVal, delta: dieDelta })
      })

      // Sort points by newX (0 ~ maxStep) so curves connect monotonically
      diePoints.sort((a, b) => a.newX - b.newX)

      diePoints.forEach(p => {
        plotData.push([p.newX, p.plotVal, p.rawVal, p.delta, p.origX])
        if (p.plotVal !== null && typeof p.plotVal === 'number') {
          allFitPoints.push({ x: p.newX, y: p.plotVal })
        }
      })
    })

    series.push({
      name: `S${siteNum}`,
      type: 'line',
      data: plotData,
      connectNulls: false,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 3,
      lineStyle: {
        color: siteColor(siteNum),
        width: 1.2,
        opacity: 0.55
      },
      itemStyle: {
        color: siteColor(siteNum),
        opacity: 0.75
      },
      emphasis: {
        lineStyle: {
          width: 2.5,
          opacity: 1
        }
      }
    })
  })

  // Linear Regression (y = ax + b) for Invert mode
  let formulaText = ''
  if (isInvert && allFitPoints.length >= 2) {
    const M = allFitPoints.length
    const sumX = allFitPoints.reduce((acc, p) => acc + p.x, 0)
    const sumY = allFitPoints.reduce((acc, p) => acc + p.y, 0)
    const meanX = sumX / M
    const meanY = sumY / M

    let num = 0
    let den = 0
    allFitPoints.forEach(p => {
      num += (p.x - meanX) * (p.y - meanY)
      den += (p.x - meanX) * (p.x - meanX)
    })

    const a = den !== 0 ? num / den : 0
    const b = meanY - a * meanX

    let ssTot = 0
    let ssRes = 0
    allFitPoints.forEach(p => {
      const pred = a * p.x + b
      ssTot += (p.y - meanY) * (p.y - meanY)
      ssRes += (p.y - pred) * (p.y - pred)
    })
    const r2 = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 1

    const sign = b >= 0 ? '+' : '-'
    const absB = Math.abs(b)
    formulaText = `📈 Trend: y = ${a.toFixed(5)}x ${sign} ${absB.toFixed(4)} (R² = ${r2.toFixed(4)})`

    series.push({
      name: 'y = ax + b',
      type: 'line',
      data: [
        [0, parseFloat(b.toFixed(6))],
        [maxStep, parseFloat((a * maxStep + b).toFixed(6))]
      ],
      showSymbol: false,
      lineStyle: {
        color: '#ff4d4f',
        type: 'dashed',
        width: 2.5
      },
      itemStyle: {
        color: '#ff4d4f'
      },
      emphasis: {
        lineStyle: {
          width: 3.5
        }
      },
      z: 15
    })
  }

  let yMin = allVals.length > 0 ? Math.min(...allVals) : 0
  let yMax = allVals.length > 0 ? Math.max(...allVals) : 1

  if (yMin === yMax) {
    yMin -= 1
    yMax += 1
  } else {
    const pad = (yMax - yMin) * 0.05
    yMin -= pad
    yMax += pad
  }

  const baseParam = trimData.base_param || tab.param_name
  const totalDies = filteredCurves.length
  
  let modeInfo = ''
  if (isShift) modeInfo += ' | ⚡ [Shift Active]'
  if (isRobust) modeInfo += ' | 🛡️ [Robust (10% Trimmed)]'
  if (isInvert) modeInfo += ' | 🔄 [Invert]'

  chart.setOption({
    title: {
      text: `${tab.item_number || ''}.${baseParam}`,
      subtext: `Trim ${stepCount} Steps (0 ~ ${maxStep}) | ${totalDies} Dies | Unit: ${trimData.unit || '-'}${modeInfo}`,
      left: 'center',
      textStyle: { fontSize: 13 },
      subtextStyle: { fontSize: 11, color: (isShift || isRobust || isInvert) ? '#722ed1' : '#666', fontWeight: (isShift || isRobust || isInvert) ? 'bold' : 'normal' },
    },
    graphic: (isInvert && formulaText) ? [{
      type: 'text',
      left: 'center',
      bottom: 38,
      style: {
        text: formulaText,
        fill: '#cf1322',
        font: 'bold 11px sans-serif'
      },
      z: 20
    }] : [],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#9254de', type: 'dashed', width: 1.5 }
      },
      formatter: (params: any) => {
        if (!params || !params.length) return ''
        const first = params.find((p: any) => p.data && p.data[0] !== null && p.data[0] !== undefined)
        if (!first) return ''

        const stepX = Math.round(first.data[0])
        const origStepIdx = (first.data[4] !== undefined) ? first.data[4] : sortedStepIndices[stepX]
        const stepInfo = trimData.steps?.[origStepIdx]
        const origStepName = stepInfo?.param_name ?? `Step ${origStepIdx}`

        let header = `<div style="font-size:13px;font-weight:bold;margin-bottom:4px;border-bottom:1px solid #f0f0f0;padding-bottom:2px">
          Step ${origStepIdx} <span style="font-size:11px;color:#1890ff">(${origStepName})</span>
        </div>`
        if (isInvert) {
          header = `<div style="font-size:13px;font-weight:bold;margin-bottom:4px;border-bottom:1px solid #f0f0f0;padding-bottom:2px">
            原始 Step ${origStepIdx} <span style="font-size:11px;color:#1890ff">(${origStepName})</span>
            <div style="font-size:11px;color:#888;font-weight:normal">从小到大排列序号: ${stepX}</div>
          </div>`
        }

        // Step Mean summary
        const stepAllMean = getTrimStepAllMean(tab, stepInfo)
        let content = `<div style="margin-bottom:4px"><b>ALL Mean:</b> <span style="color:#722ed1;font-weight:bold">${stepAllMean != null ? stepAllMean.toFixed(4) : '-'}</span> ${trimData.unit || ''}</div>`

        // Site means for visible sites
        const siteMeansHtml = visibleSites.map(s => {
          const sMean = getTrimStepSiteMean(tab, stepInfo, s)
          const color = siteColor(s)
          return `<span style="margin-right:8px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:2px"></span>S${s}: <b>${sMean != null ? sMean.toFixed(4) : '-'}</b></span>`
        }).join('')

        content += `<div style="font-size:11px;color:#555;margin-bottom:4px">${siteMeansHtml}</div>`

        // If Invert trend line value
        if (isInvert && allFitPoints.length >= 2) {
          const fitted = a * stepX + b
          content += `<div style="font-size:11px;color:#ff4d4f;margin-top:2px;border-top:1px dashed #ffd666;padding-top:2px"><b>趋势拟合值 (y=ax+b):</b> ${fitted.toFixed(6)} ${trimData.unit || ''}</div>`
        }

        return header + content
      }
    },
    legend: { show: false },
    grid: { top: 48, bottom: 35, left: 55, right: 25 },
    xAxis: {
      type: 'value',
      name: 'Step',
      min: 0,
      max: maxStep,
      interval: maxStep > 32 ? 4 : (maxStep > 16 ? 2 : 1),
      axisTick: { show: true },
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
      axisLabel: {
        fontSize: 10,
        formatter: (v: number) => {
          const idx = Math.round(v)
          if (isInvert) {
            const origIdx = sortedStepIndices[idx]
            return origIdx !== undefined ? `${origIdx}` : `${idx}`
          }
          return `${idx}`
        }
      }
    },
    yAxis: {
      type: 'value',
      name: trimData.unit || '',
      min: parseFloat(yMin.toFixed(6)),
      max: parseFloat(yMax.toFixed(6)),
      splitLine: { lineStyle: { type: 'dashed' } }
    },
    series
  }, true)
}

// ── Scatter渲染 ────────────────────────────────────────
function renderScatter(tabId: string) {
  const tab = getTabById(tabId)
  if (!tab?.data) return
  const chart = chartInstances[`${tabId}_scatter`]
  if (!chart) return

  if (tab.options?.trim_step_mode && tab.data.trim_data) {
    renderTrimScatter(tabId, tab, chart)
    return
  }

  const allSiteStats = tab.data.sites?.find((s: any) => s.site === 0)?.stats
  let validMin = allSiteStats?.min_val
  let validMax = allSiteStats?.max_val
  
  const hasValidData = validMin != null && validMax != null

  let mapMinVal = validMin ?? 0
  let mapMaxVal = validMax ?? 1
  
  if (hasValidData) {
    if (tab.options.filter_type === 'custom') {
      if (tab.options.custom_min != null) mapMinVal = Math.min(mapMinVal, tab.options.custom_min)
      if (tab.options.custom_max != null) mapMaxVal = Math.max(mapMaxVal, tab.options.custom_max)
    }
    if (mapMinVal === mapMaxVal) {
      mapMinVal -= 1
      mapMaxVal += 1
    }
  }

  const activeLevel = waferMapState[tabId]?.activeLevel

  const { sites, unit, lower_limit: ll, upper_limit: ul } = tab.data
  const allSites = chartSites(tab)
  const isEachMode = tab.options?.scatter_x_mode === 'each'
  let currentXOffset = 0

  const series: any[] = allSites.map((s: any, idx: number) => {
    let validData = []
    if (hasValidData) {
      validData = s.scatter.filter((p: any) => p.val >= validMin! && p.val <= validMax!)
      if (activeLevel != null) {
        validData = validData.filter((p: any) => {
          const lvl = valToLevel(p.val, mapMinVal, mapMaxVal, NUM_COLOR_LEVELS)
          return lvl === activeLevel
        })
      }
    }

    let plotData: [number, number][]
    if (isEachMode) {
      plotData = validData.map((p: any, i: number) => [currentXOffset + i + 1, p.val])
      currentXOffset += validData.length
    } else {
      plotData = validData.map((p: any) => [p.idx, p.val])
    }

    return {
      type: 'scatter',
      name: legendLabel(s.site),
      data: plotData,
      symbolSize: 3,
      itemStyle: { color: siteColor(s.site), opacity: 0.6 },
    }
  })

  const mode = tab.options.scatter_y_mode ?? 'auto'

  const markLineData: any[] = []
  if (mode === 'limit') {
    if (ll !== null && ll !== undefined) {
      markLineData.push({
        yAxis: ll,
        label: { formatter: `LL:${ll.toFixed(4)}`, position: 'end' },
        lineStyle: { color: 'red', type: 'dashed' },
      })
    }
    if (ul !== null && ul !== undefined) {
      markLineData.push({
        yAxis: ul,
        label: { formatter: `UL:${ul.toFixed(4)}`, position: 'end' },
        lineStyle: { color: 'red', type: 'dashed' },
      })
    }
  } else if (mode === 'sigma' && allSiteStats?.mean != null && allSiteStats?.stdev != null) {
    const sigmaN = tab.options.scatter_sigma_n ?? 6
    markLineData.push({
      yAxis: allSiteStats.mean - sigmaN * allSiteStats.stdev,
      label: { formatter: `Mean-${sigmaN}σ`, position: 'insideEndTop', color: '#722ed1' },
      lineStyle: { color: '#722ed1', type: 'dashed' },
    })
    markLineData.push({
      yAxis: allSiteStats.mean + sigmaN * allSiteStats.stdev,
      label: { formatter: `Mean+${sigmaN}σ`, position: 'insideEndTop', color: '#722ed1' },
      lineStyle: { color: '#722ed1', type: 'dashed' },
    })
  }

  series.push({
    type: 'line',
    data: [],
    markLine: {
      silent: true,
      symbol: 'none',
      data: markLineData,
    },
  })

  let yMin: number
  let yMax: number

  if (mode === 'limit' && ll != null && ul != null) {
    // Limit mode: Y axis spans Low/High Limit with 2% padding
    const pad = (ul - ll) * 0.02 || Math.abs(ul) * 0.01 || 0.1
    yMin = ll - pad
    yMax = ul + pad
  } else if (mode === 'sigma' && allSiteStats?.mean != null && allSiteStats?.stdev != null) {
    // N sigma mode: Y axis spans mean ± N*stdev
    const n = Math.max(1, Number(tab.options.scatter_sigma_n) || 6)
    yMin = allSiteStats.mean - n * allSiteStats.stdev
    yMax = allSiteStats.mean + n * allSiteStats.stdev
    if (yMin === yMax) { yMin -= 1; yMax += 1 }
  } else {
    // Auto mode: Y axis min is stats min_val, max is stats max_val
    let statMin = allSiteStats?.min_val
    let statMax = allSiteStats?.max_val

    if (tab.options?.site_view === 'site' && allSites.length > 0) {
      const mins = allSites.map((s: any) => s.stats?.min_val).filter((v: any) => v != null)
      const maxs = allSites.map((s: any) => s.stats?.max_val).filter((v: any) => v != null)
      if (mins.length > 0) statMin = Math.min(...mins)
      if (maxs.length > 0) statMax = Math.max(...maxs)
    }

    if (statMin != null && statMax != null) {
      yMin = statMin
      yMax = statMax
    } else {
      const { min: globalMin, max: globalMax } = getGlobalRange(tab)
      yMin = globalMin
      yMax = globalMax
    }
    if (yMin === yMax) { yMin -= 1; yMax += 1 }
  }

  const param_name = tab.data.param_name
  chart.setOption({
    title: {
      text: `${tab.item_number}.${param_name}`,
      subtext: allSiteStats
        ? `Min=${allSiteStats.min_val?.toFixed(4)} Max=${allSiteStats.max_val?.toFixed(4)} Mean=${allSiteStats.mean?.toFixed(4)} Stdev=${allSiteStats.stdev?.toFixed(4)} CPK=${allSiteStats.cpk?.toFixed(4)}`
        : '',
      left: 'center',
      textStyle: { fontSize: 13 },
      subtextStyle: { fontSize: 11, color: '#666' },
    },
    tooltip: { trigger: 'item' },
    legend: { show: false },
    grid: { top: 48, bottom: 35, left: 55, right: 25 },
    xAxis: { type: 'value', name: 'Index' },
    yAxis: {
      type: 'value',
      name: unit,
      min: parseFloat(yMin.toFixed(6)),
      max: parseFloat(yMax.toFixed(6)),
    },
    series,
  })
}

// ── Wafer Map 渲染 ─────────────────────────────────────
function levelToColor(level: number, total: number): string {
  const ratio = total <= 1 ? 0.5 : level / (total - 1)
  let r, g, b
  if (ratio < 0.5) {
    r = 0; g = Math.round(ratio * 2 * 255); b = Math.round((1 - ratio * 2) * 255)
  } else {
    r = Math.round((ratio - 0.5) * 2 * 255); g = Math.round((1 - (ratio - 0.5) * 2) * 255); b = 0
  }
  return `rgb(${r},${g},${b})`
}

function valToLevel(val: number, minVal: number, maxVal: number, levels: number): number {
  if (maxVal === minVal) return Math.floor(levels / 2)
  const ratio = (val - minVal) / (maxVal - minVal)
  return Math.min(levels - 1, Math.max(0, Math.floor(ratio * levels)))
}

function renderWaferMap(tabId: string, canvas: HTMLCanvasElement) {
  const tab = getTabById(tabId)
  if (!tab?.data) return

  // 与 histogram/scatter 一致：按 site_view/active_sites 过滤(由顶部 Site chip 控制)
  // all_only(ALL聚合)时，wafer map 仍展示全部 site dies（site0 无独立 wafer_map）
  const v = tab.options?.site_view ?? 'all'
  const visibleSites = v === 'all_only'
    ? new Set(tab.data.sites.filter((s: any) => s.site > 0).map((s: any) => s.site))
    : new Set(chartSites(tab).map((s: any) => s.site))
  const siteDataMap: Map<number, any[]> = new Map()
  tab.data.sites.forEach((s: any) => {
    if (s.site > 0 && s.wafer_map && visibleSites.has(s.site)) {
      siteDataMap.set(s.site, s.wafer_map)
    }
  })

  const allData: any[] = []
  siteDataMap.forEach((dies, siteNum) => {
    dies.forEach(d => allData.push({ ...d, site: siteNum }))
  })

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (allData.length === 0) {
    if (waferMapState[tabId]) waferMapState[tabId].dies = []
    return
  }

  const allSiteStats = tab.data.sites.find((s: any) => s.site === 0)?.stats
  if (!allSiteStats || allSiteStats.min_val == null) {
    if (waferMapState[tabId]) waferMapState[tabId].dies = []
    return
  }

  let minVal = allSiteStats.min_val
  let maxVal = allSiteStats.max_val
  
  if (tab.options.filter_type === 'custom') {
    if (tab.options.custom_min != null) minVal = Math.min(minVal, tab.options.custom_min)
    if (tab.options.custom_max != null) maxVal = Math.max(maxVal, tab.options.custom_max)
  }

  if (minVal === maxVal) {
    minVal -= 1
    maxVal += 1
  }

  const validData = allData.filter(d => d.val >= allSiteStats.min_val && d.val <= allSiteStats.max_val)

  // 用全部site（含隐藏的）计算坐标范围，保持map位置稳定
  const allCoords: any[] = []
  tab.data.sites.forEach((s: any) => {
    if (s.site > 0 && s.wafer_map) allCoords.push(...s.wafer_map)
  })
  const xs = allCoords.map((d: any) => d.x)
  const ys = allCoords.map((d: any) => d.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  // Sync map rotation with Bin analysis page (localStorage key ate_map_rotate_<product>)
  const rotateProgram = String(lotInfo.value?.program || '').trim()
  const rotateIdx = rotateProgram.indexOf('_')
  const rotateKey = 'ate_map_rotate_' + (rotateProgram ? (rotateIdx > 0 ? rotateProgram.slice(0, rotateIdx) : rotateProgram) : '')
  const _savedRotate = rotateKey ? localStorage.getItem(rotateKey) : null
  const mapRotate = (_savedRotate === '90' || _savedRotate === '180' || _savedRotate === '270') ? _savedRotate as string : '0'
  const applyParamRotation = (x: number, y: number) => {
    switch (mapRotate) {
      case '90':  return { x: maxY - y + minX, y: x - minX + minY }
      case '180': return { x: maxX - x + minX, y: maxY - y + minY }
      case '270': return { x: y - minY + minX, y: maxX - x + minY }
      default:    return { x, y }
    }
  }
  const allCoordsRot = allCoords.map((d: any) => { const r = applyParamRotation(d.x, d.y); return { ...d, rx: r.x, ry: r.y } })
  const validDataRot = validData.map((d: any) => { const r = applyParamRotation(d.x, d.y); return { ...d, rx: r.x, ry: r.y } })
  const rxs = allCoordsRot.map((d: any) => d.rx)
  const rys = allCoordsRot.map((d: any) => d.ry)
  const rMinX = Math.min(...rxs), rMaxX = Math.max(...rxs)
  const rMinY = Math.min(...rys), rMaxY = Math.max(...rys)

  // 布局：左侧range文字区 | 色块 | 右侧count文字区
  const LEGEND_RANGE_W = 80   // 左侧range文字
  const LEGEND_BLOCK_W = 16   // 色块宽度
  const LEGEND_COUNT_W = 55   // 右侧count文字
  const LEGEND_TOTAL_W = LEGEND_RANGE_W + LEGEND_BLOCK_W + LEGEND_COUNT_W + 8
  const W = canvas.width
  const H = canvas.height
  const margin = 40
  
  // 地图区域中心
  const mapAreaW = W - LEGEND_TOTAL_W - margin * 2
  const centerX = mapAreaW / 2 + margin
  const centerY = H / 2
  const radius = Math.min(mapAreaW, H - margin * 2) / 2

  const gridW = rMaxX - rMinX + 1
  const gridH = rMaxY - rMinY + 1
  
  // 支持长方形 Die
  const dieW = (radius * 2) / gridW
  const dieH = (radius * 2) / gridH
  
  const offsetX = centerX - radius
  const offsetY = centerY - radius

  // 绘制 Wafer 背景圆
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2)
  ctx.fillStyle = '#fdfdfd'
  ctx.fill()
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.stroke()

  // 绘制圆周边界
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 2
  ctx.stroke()

  // 绘制 Notch (缺口)
  ctx.beginPath()
  let notchX = centerX, notchY = centerY + radius
  let startAngle = Math.PI, endAngle = 0
  switch (mapRotate) {
    case '90':
      notchX = centerX - radius; notchY = centerY
      startAngle = 1.5 * Math.PI; endAngle = 0.5 * Math.PI
      break
    case '180':
      notchX = centerX; notchY = centerY - radius
      startAngle = 0; endAngle = Math.PI
      break
    case '270':
      notchX = centerX + radius; notchY = centerY
      startAngle = 0.5 * Math.PI; endAngle = 1.5 * Math.PI
      break
  }
  ctx.beginPath()
  ctx.arc(notchX, notchY, 12, startAngle, endAngle)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#cccccc'
  ctx.stroke()

  // 绘制底图所有测试过的die (浅灰色背景)
  ctx.fillStyle = '#f5f5f5'
  allCoordsRot.forEach((d: any) => {
    const px = offsetX + (d.rx - rMinX) * dieW
    const py = offsetY + (d.ry - rMinY) * dieH
    ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2))
  })

  // 统计每个色阶die数量
  const levelCounts = new Array(NUM_COLOR_LEVELS).fill(0)
  validData.forEach(d => {
    levelCounts[valToLevel(d.val, minVal, maxVal, NUM_COLOR_LEVELS)]++
  })

  // 绘制有效die，记录位置供hover检测
  const dies: typeof waferMapState[string]['dies'] = []
  const activeLevel = waferMapState[tabId]?.activeLevel

  validDataRot.forEach(d => {
    const lvl = valToLevel(d.val, minVal, maxVal, NUM_COLOR_LEVELS)
    
    // 如果有选中的色阶且当前die不在此色阶，跳过绘制
    if (activeLevel != null && lvl !== activeLevel) return

    const px = offsetX + (d.rx - rMinX) * dieW
    const py = offsetY + (d.ry - rMinY) * dieH
    
    ctx.fillStyle = levelToColor(lvl, NUM_COLOR_LEVELS)
    ctx.fillRect(px, py, Math.max(0.5, dieW - 0.2), Math.max(0.5, dieH - 0.2))
    dies.push({ px, py, width: dieW, height: dieH, dieX: d.x, dieY: d.y, val: d.val, site: d.site, lvl })
  })
  if (waferMapState[tabId]) waferMapState[tabId].dies = dies

  // ── 绘制图例（三列：range | 色块 | count）────────────
  const legendStartX = mapAreaW + margin + margin
  const legendTopY = margin
  const totalLegendH = H - margin * 2
  const blockH = Math.floor(totalLegendH / NUM_COLOR_LEVELS)

  const blockX = legendStartX + LEGEND_RANGE_W + 4
  const countX = blockX + LEGEND_BLOCK_W + 4

  const legendBlocks: typeof waferMapState[string]['legendBlocks'] = []

  ctx.font = '9px Arial'

  for (let lvl = NUM_COLOR_LEVELS - 1; lvl >= 0; lvl--) {
    // 从顶部开始，顶部对应最高值
    const drawRow = NUM_COLOR_LEVELS - 1 - lvl
    const blockY = legendTopY + drawRow * blockH
    const midY = blockY + blockH / 2

    const rangeMin = minVal + (lvl / NUM_COLOR_LEVELS) * (maxVal - minVal)
    const rangeMax = minVal + ((lvl + 1) / NUM_COLOR_LEVELS) * (maxVal - minVal)

    // 左侧：range文字，右对齐到色块左边
    ctx.fillStyle = '#333'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(rangeMax.toFixed(3), blockX - 4, midY + 1)
    ctx.fillStyle = '#999'
    ctx.textBaseline = 'top'
    ctx.fillText(rangeMin.toFixed(3), blockX - 4, midY)

    // 中间：色块
    ctx.fillStyle = levelToColor(lvl, NUM_COLOR_LEVELS)
    ctx.fillRect(blockX, blockY, LEGEND_BLOCK_W, blockH - 1)
    legendBlocks.push({ lvl, x: blockX, y: blockY, w: LEGEND_BLOCK_W, h: blockH - 1 })

    if (activeLevel === lvl) {
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1.5
      ctx.strokeRect(blockX - 1, blockY - 1, LEGEND_BLOCK_W + 2, blockH)
    }

    // 右侧：count
    ctx.fillStyle = '#444'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${levelCounts[lvl]}`, countX, midY)
  }
  
  if (waferMapState[tabId]) {
    waferMapState[tabId].legendBlocks = legendBlocks
  }

  // 图例标题
  ctx.fillStyle = '#555'
  ctx.font = 'bold 9px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Range', blockX - 4 - LEGEND_RANGE_W / 2, legendTopY - 2)
  ctx.fillText('n', countX + 20, legendTopY - 2)
}

// ── 工具函数 ───────────────────────────────────────────
function cpkColor(val: number | null) {
  if (val === null || val === undefined) return {}
  if (val < 1.0) return { color: 'red', fontWeight: 'bold' }
  if (val < 1.33) return { color: 'orange' }
  return {}
}

function yieldColor(val: number) {
  if (!val) return {}
  if (val < 0.8) return { color: 'red' }
  if (val < 0.95) return { color: 'orange' }
  return { color: 'green' }
}

function formatDate(d: string) {
  return fmtDateTz(d) || '-'
}

onMounted(async () => {
  await fetchParamList()
  await fetchLotInfo()
  addTab()
})
</script>

<style scoped>
.param-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lot-info-bar {
  background: white;
  padding: 10px 16px;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  margin-bottom: 8px;
}

.info-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.label { font-size: 11px; color: #999; }
.value { font-size: 13px; color: #333; font-weight: 500; }

.tab-bar {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  background: white;
  padding: 8px 12px 0;
  border-radius: 6px 6px 0 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow-x: auto;
}

.tab {
  padding: 6px 16px;
  border: 1px solid #d9d9d9;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab.active {
  background: white;
  border-color: #1890ff;
  color: #1890ff;
}

.tab-close { font-size: 14px; color: #999; line-height: 1; }
.tab-close:hover { color: red; }

.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  background: white;
  border-radius: 0 6px 6px 6px;
  padding: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.options-bar, .vs-opts-bar {
  display: flex;
  align-items: center;
  align-content: flex-start;
  gap: 16px;
  flex-shrink: 0;
  flex-wrap: wrap;
  border-bottom: 1px solid #f0f0f0;
  padding: 8px 0 10px;
  min-height: 82px;
  position: sticky;
  top: 0;
  z-index: 100;
  background: white; /* 滚动时确保不透明 */
}

.options-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  flex: 1;
}

.nav-group { display: flex; align-items: center; gap: 6px; }
.nav-group button {
  padding: 4px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}
.nav-group select {
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  max-width: 300px;
}

.option-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.option-item label { color: #666; }
.option-item select, .option-item input[type="number"] {
  padding: 3px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}
.option-item button {
  padding: 3px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}

/* Chart legend (chip style, matching top site chips) */
.chart-legend {
  display: grid;
  grid-template-columns: repeat(16, auto);
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  margin-top: -12px;
  position: relative;
  z-index: 2;
}
.chart-legend-item {
  display: inline-flex;
  align-items: center;
  min-width: 30px;
  padding: 2px 9px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--lg-color, #999);
  border-radius: 6px;
  line-height: 1.4;
  user-select: none;
}

/* Fixed top chart-control bar (ALL toggle + Chart checkboxes + VS) — controls both panels */
.viz-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  flex-shrink: 0;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  background: white;
  z-index: 100;
}

/* Scatter Y-axis range mode controls (Auto / Limit / N sigma) */
.scatter-axis-mode-box { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; width: 100%; box-sizing: border-box; }
.scatter-axis-mode-box .label { font-size: 12px; font-weight: 500; color: #4b5563; }
.axis-mode-btn { border: 1px solid #d9d9d9; background: #fff; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; color: #374151; }
.axis-mode-btn:hover { border-color: #1890ff; color: #1890ff; }
.axis-mode-btn.active { background: #1890ff; color: #fff; border-color: #1890ff; font-weight: 600; }
.sigma-input { width: 58px; padding: 4px 6px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; }
.sigma-input:disabled { opacity: 0.45; cursor: not-allowed; }

.mode-toggle-btn {
  min-width: 54px;
  height: 26px;
  padding: 3px 12px;
  border: 1px solid #1890ff;
  border-radius: 4px;
  background: #fff;
  color: #1890ff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mode-toggle-btn:hover {
  background: #e6f7ff;
}

.content-row {
  flex: 1;
  display: flex;
  gap: 12px;
  overflow-y: auto;
  overflow-x: auto;
}

.charts-area {
  width: 840px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vs-right-panel {
  width: 840px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.stats-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
.stats-table th, .stats-table td {
  border: 1px solid #f0f0f0;
  padding: 4px 8px;
  text-align: center;
}
.stats-table th { background: #fafafa; color: #666; }

.chart-container {
  background: #fafafa;
  border-radius: 4px;
  padding: 8px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.wafer-tooltip {
  position: absolute;
  background: rgba(0,0,0,0.78);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 10;
  line-height: 1.6;
}

/* Map下方Site图例 */
.wafer-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 6px 4px 2px;
  justify-content: center;
}

.wafer-legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid #e0e0e0;
  background: #fff;
  user-select: none;
  transition: opacity 0.15s;
}

.wafer-legend-item.hidden {
  opacity: 0.35;
  text-decoration: line-through;
}

.wafer-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
  flex-shrink: 0;
}

/* Trim Step Mode button */
.option-item .btn-trim-step {
  padding: 4px 10px;
  background: #722ed1;
  color: #fff;
  border: 1px solid #531dab;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  line-height: 1.2;
}
.option-item .btn-trim-step:hover {
  background: #9254de;
  border-color: #722ed1;
}
.option-item .btn-trim-step.active {
  background: #391085;
  border-color: #22075e;
  box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.4);
}

.stats-table-trim {
  min-height: 290px;
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
}

/* Trim Calc 5x2 Box */
.trim-calc-box {
  width: 100%;
  background: #ffffff;
  border: 1px solid #d3adf7;
  border-radius: 6px;
  margin-top: 10px;
  padding: 10px 14px;
  box-shadow: 0 2px 6px rgba(114, 46, 209, 0.08);
}
.trim-calc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.trim-calc-title {
  font-size: 13px;
  font-weight: 700;
  color: #531dab;
}
.trim-calc-target-info {
  font-size: 11px;
  color: #888;
}
.trim-calc-table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-size: 13px;
}
.trim-calc-table th {
  background: #f9f0ff;
  color: #531dab;
  padding: 6px 8px;
  border: 1px solid #efdbff;
  font-weight: 600;
}
.trim-calc-table td {
  padding: 6px 8px;
  border: 1px solid #efdbff;
  background: #fff;
}
.trim-calc-input {
  width: 110px;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #333;
}
.trim-calc-input:focus {
  border-color: #722ed1;
  outline: none;
  box-shadow: 0 0 0 2px rgba(114, 46, 209, 0.2);
}
.trim-calc-result-val {
  font-size: 14px;
  font-weight: 700;
  color: #389e0d;
}
.trim-calc-diff {
  font-size: 11px;
  color: #888;
  margin-left: 4px;
}
.trim-calc-result-code {
  font-size: 13px;
  font-weight: 700;
  color: #722ed1;
  background: #f9f0ff;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid #d3adf7;
}

/* VS button */
.option-item .btn-vs {
  padding: 4px 12px;
  background: #52c41a;
  color: #fff;
  border: 1px solid #389e0d; /* 调低边框厚度以与其他按钮对齐 */
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  transition: background 0.15s, border-color 0.15s;
  line-height: 1.2; /* 调低行高 */
}
.option-item .btn-vs:hover { background: #73d13d; border-color: #52c41a; }
.option-item .btn-vs.active { background: #135200; border-color: #092b00; color: #fff; }

/* VS separator */
.vs-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  writing-mode: vertical-rl;
  padding: 12px 4px;
}
.vs-separator span {
  background: #52c41a;
  color: white;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 5px;
  border-radius: 4px;
  letter-spacing: 2px;
}

/* VS right panel */
.vs-right-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

/* VS mini options bar */
.vs-opts-bar {
  /* 基础样式已在 .options-bar 中定义 */
  background: white; /* 必须设为不透明，防止图表穿层 */
  border: none;
  padding: 8px 0 10px;
  border-bottom: 1px solid #f0f0f0;
  border-radius: 0;
}

/* Linked tooltip (VS cross-map tooltip) */
.wafer-linked-tooltip {
  border: 2px solid #52c41a;
  background: rgba(0, 50, 0, 0.82) !important;
}
/* ── Site 选择 chips ── */
.site-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 16px;
  flex-wrap: wrap;
}
.chip-label {
  font-size: 12px;
  color: #888;
  margin-right: 2px;
}
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  color: #fff;
  background: var(--chip-bg, #999);
  opacity: 0.35;
  transition: opacity .15s, transform .1s;
}
.chip:hover { opacity: 0.7; }
.chip.active {
  opacity: 1;
  border-color: #1a1a2e;
  box-shadow: 0 0 0 1px rgba(0,0,0,.15);
}
.chip-all {
  background: #2b2b3c;
  color: #ffd43b;
}
.chip-all.active { background: #495057; }

/* stats 表格 Site 列标签（去掉勾选框后） */
.site-cell-label {
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
