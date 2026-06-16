<template>
  <div class="profile-page">
    <!-- 页头 -->
    <div class="page-header">
      <div class="avatar-block">
        <div class="avatar">{{ authStore.user?.username?.[0]?.toUpperCase() }}</div>
        <div>
          <div class="username">{{ authStore.user?.username }}</div>
          <div class="badges">
            <span class="badge blue">{{ authStore.user?.email }}</span>
            <span v-if="authStore.user?.role === 'admin'" class="badge gold">Admin</span>
            <span v-else-if="authStore.user?.role === 'eng'" class="badge blue">ENG</span>
            <span class="badge green">已验证</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="tabs">
      <button v-for="t in visibleTabs" :key="t.key"
              :class="['tab-btn', { active: activeTab === t.key }]"
              @click="activeTab = t.key">
        {{ t.label }}
      </button>
    </div>

    <!-- ── 个人信息 Tab ── -->
    <div v-if="activeTab === 'info'" class="panel">
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">用户名</span>
          <span class="info-value">{{ authStore.user?.username }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">邮箱</span>
          <span class="info-value">{{ authStore.user?.email }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">注册时间</span>
          <span class="info-value">{{ fmtDate(authStore.user?.created_at) }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">最后登录</span>
          <span class="info-value">{{ fmtDate(authStore.user?.last_login_at) || '—' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">存储用量</span>
          <span class="info-value">{{ fmtBytes(authStore.user?.storage_used_bytes) }}</span>
        </div>
      </div>

      <div class="section-title">修改密码</div>
      <form class="pw-form" @submit.prevent="handleChangePw">
        <div class="field-row">
          <div class="field">
            <label>当前密码</label>
            <input v-model="pwForm.old" type="password" placeholder="请输入当前密码" />
          </div>
          <div class="field">
            <label>新密码</label>
            <input v-model="pwForm.new" type="password" placeholder="至少8位，含字母和数字" />
          </div>
          <div class="field">
            <label>确认新密码</label>
            <input v-model="pwForm.confirm" type="password" placeholder="再次输入新密码" />
          </div>
        </div>
        <div v-if="pwError"   class="msg error">{{ pwError }}</div>
        <div v-if="pwSuccess" class="msg success">{{ pwSuccess }}</div>
        <button type="submit" class="btn-primary" :disabled="pwLoading">
          {{ pwLoading ? '保存中...' : '修改密码' }}
        </button>
      </form>
    </div>

    <!-- ── 分享 Tab ── -->
    <div v-if="activeTab === 'shares'" class="panel">
      <div class="share-sections">
        <div class="share-col">
          <div class="section-title">分享给我的 <span class="count">{{ received.length }}</span></div>
          <div v-if="received.length === 0" class="empty-tip">暂无分享</div>
          <div v-for="s in received" :key="s.id" class="share-card">
            <div class="share-file">📄 {{ s.lot_filename }}</div>
            <div class="share-meta">
              <span>来自 <strong>{{ s.shared_by_username }}</strong></span>
              <span class="tag">{{ daysLeft(s.expires_at) }}</span>
            </div>
            <div v-if="s.message" class="share-msg">{{ s.message }}</div>
          </div>
        </div>

        <div class="share-col">
          <div class="section-title">我分享出去的 <span class="count">{{ sent.length }}</span></div>
          <div v-if="sent.length === 0" class="empty-tip">暂无分享</div>
          <div v-for="s in sent" :key="s.id" class="share-card">
            <div class="share-file">📄 {{ s.lot_filename }}</div>
            <div class="share-meta">
              <span>给 <strong>{{ s.shared_to_username }}</strong></span>
              <span :class="['tag', isExpired(s.expires_at) ? 'expired' : '']">
                {{ isExpired(s.expires_at) ? '已过期' : daysLeft(s.expires_at) }}
              </span>
            </div>
            <button class="btn-revoke" @click="revokeShare(s.id)">撤销</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 系统管理 Tab (Admin) ── -->
    <div v-if="activeTab === 'admin'" class="panel">

      <!-- ═══════════════════════════════════════ -->
      <!-- 时区设置卡片                             -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="authStore.isAdmin" class="settings-card">
        <div class="settings-card-header" @click="tzExpanded = !tzExpanded">
          <div class="settings-card-title">
            <span class="settings-icon">🌐</span>
            <span>系统时区</span>
            <span class="badge blue" style="margin-left:8px">{{ timezoneStore.timezone }}</span>
          </div>
          <span class="collapse-arrow">{{ tzExpanded ? '▲' : '▼' }}</span>
        </div>
        <div v-if="tzExpanded" class="settings-card-body">
          <div class="tz-info-row">
            <span class="tz-info-text">🖥️ 浏览器时区：<strong>{{ browserTz }}</strong></span>
            <button class="btn-sm" @click="resetTzToBrowser">↩ 还原浏览器时区</button>
          </div>
          <div class="form-grid" style="margin-top:12px">
            <div class="form-field" style="grid-column:1/-1">
              <label>选择时区</label>
              <select v-model="tzSelected" class="tz-select">
                <option v-for="tz in tzList" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
              </select>
            </div>
            <div class="form-field" style="grid-column:1/-1">
              <label>自定义 IANA 时区（如 America/Chicago）</label>
              <input v-model="tzCustom" placeholder="留空则使用上方下拉选择" class="tz-custom-input" />
            </div>
          </div>
          <div class="tz-preview" v-if="tzPreview">
            ⏱ 当前时刻预览：<strong>{{ tzPreview }}</strong>
          </div>
          <div v-if="tzSaveMsg" :class="['msg', tzSaveMsg.ok ? 'success' : 'error']" style="margin-top:8px">{{ tzSaveMsg.text }}</div>
          <div class="action-row" style="margin-top:12px">
            <button class="btn-primary" @click="saveTz">💾 保存时区设置</button>
          </div>
          <div class="tz-hint">时区设置保存在本地浏览器，仅影响当前设备的时间显示（上传时间、日志时间等均按此时区展示）。</div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- 邮箱配置卡片                             -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="authStore.isAdmin" class="settings-card">
        <div class="settings-card-header" @click="smtpExpanded = !smtpExpanded">
          <div class="settings-card-title">
            <span class="settings-icon">📧</span>
            <span>邮箱配置</span>
            <span v-if="smtpConfigured" class="badge green" style="margin-left:8px">已绑定</span>
            <span v-else class="badge gray" style="margin-left:8px">未配置</span>
          </div>
          <span class="collapse-arrow">{{ smtpExpanded ? '▲' : '▼' }}</span>
        </div>

        <div v-if="smtpExpanded" class="settings-card-body">
          <!-- 邮箱类型快选 -->
          <div class="quick-select-row">
            <span class="quick-label">快速选择：</span>
            <button v-for="preset in emailPresets" :key="preset.label"
              :class="['preset-btn', smtpForm.smtp_host === preset.host ? 'active' : '']"
              @click="applyPreset(preset)">
              {{ preset.label }}
            </button>
          </div>

          <div class="form-grid">
            <div class="form-field">
              <label>账号（邮箱地址）</label>
              <input v-model="smtpForm.smtp_user" placeholder="如 example@qq.com" />
            </div>
            <div class="form-field">
              <label>密码 / 授权码</label>
              <input v-model="smtpForm.smtp_password" type="password" placeholder="QQ/163请使用授权码" />
            </div>
            <div class="form-field">
              <label>SMTP 服务器</label>
              <input v-model="smtpForm.smtp_host" placeholder="如 smtp.qq.com" />
            </div>
            <div class="form-field">
              <label>端口</label>
              <input v-model.number="smtpForm.smtp_port" type="number" placeholder="465" />
            </div>
            <div class="form-field">
              <label>发件人名称（选填）</label>
              <input v-model="smtpForm.smtp_from" placeholder="留空则使用账号地址" />
            </div>
            <div class="form-field form-field-inline">
              <label>连接方式</label>
              <div class="toggle-row">
                <label class="toggle-label">
                  <input type="radio" v-model="smtpForm.smtp_ssl" :value="true" /> SSL（端口465）
                </label>
                <label class="toggle-label">
                  <input type="radio" v-model="smtpForm.smtp_ssl" :value="false" /> STARTTLS（端口587）
                </label>
              </div>
            </div>
          </div>

          <div v-if="smtpSaveMsg" :class="['msg', smtpSaveMsg.ok ? 'success' : 'error']">
            {{ smtpSaveMsg.text }}
          </div>

          <div class="action-row">
            <button class="btn-primary" @click="saveSmtp" :disabled="smtpSaving">
              {{ smtpSaving ? '保存中...' : '💾 保存配置' }}
            </button>
          </div>

          <!-- 测试邮件 -->
          <div class="test-row">
            <div class="test-label">发送测试邮件：</div>
            <input v-model="smtpTestEmail" placeholder="输入收件人邮箱" class="test-input" />
            <button class="btn-test" @click="sendTestEmail" :disabled="smtpTesting">
              {{ smtpTesting ? '发送中...' : '📤 发送测试' }}
            </button>
          </div>
          <div v-if="smtpTestMsg" :class="['msg', smtpTestMsg.ok ? 'success' : 'error']">
            {{ smtpTestMsg.text }}
          </div>
        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- OSAT / FTP 配置卡片                      -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="authStore.isAdmin || authStore.isEng" class="settings-card">
        <div class="settings-card-header" @click="osatExpanded = !osatExpanded">
          <div class="settings-card-title">
            <span class="settings-icon">🖥</span>
            <span>OSAT / FTP 配置</span>
            <span class="badge blue" style="margin-left:8px">{{ osatList.length }} 个</span>
          </div>
          <span class="collapse-arrow">{{ osatExpanded ? '▲' : '▼' }}</span>
        </div>

        <div v-if="osatExpanded" class="settings-card-body">
          <div class="action-row">
            <button class="btn-primary" @click="openOsatModal(null)">+ 新增 OSAT</button>
          </div>

          <!-- OSAT 列表 -->
          <div v-if="osatList.length === 0" class="empty-tip">暂无 OSAT 配置，点击「新增」添加</div>
          <div v-for="osat in osatList" :key="osat.id" class="osat-card">
            <div class="osat-card-header">
              <div class="osat-title-line">
                <div class="osat-name-row">
                  <span class="osat-name">{{ osat.name }}</span>
                  <span :class="['badge', osat.enabled ? 'green' : 'gray']">
                    {{ osat.enabled ? '● 已启用' : '○ 已停用' }}
                  </span>
                </div>
                <div class="osat-actions">
                  <button class="btn-sm" @click="openOsatModal(osat)">✏ 编辑</button>
                  <button class="btn-sm btn-green" @click="testOsatFtp(osat)" :disabled="osat._testing">
                    {{ osat._testing ? '测试中...' : '🔗 测试连接' }}
                  </button>
                  <button :class="['btn-sm', osat.enabled ? 'btn-warn' : 'btn-purple']" @click="toggleOsatStatus(osat)" :disabled="osat._running">
                    {{ osat._running ? '处理中...' : (osat.enabled ? '⏹ 停止' : '▶ 启用') }}
                  </button>
                  <button class="btn-sm btn-warn" @click="deleteOsat(osat)">🗑 删除</button>
                </div>
              </div>
              <div class="osat-meta">
                <span>🌐 {{ osat.ftp_host }}:{{ osat.ftp_port }}</span>
                <span>👤 {{ osat.ftp_user }}</span>
                <span>🔐 {{ formatFtpEncryption(osat.ftp_encryption) }}</span>
                <span>📁 Data: {{ osat.ftp_remote_dir }}</span>
                <span>📄 Summary: {{ osat.ftp_summary_dir || '-' }}</span>
                <span>🕐 {{ osat.schedule_start }} ~ {{ osat.schedule_end }}</span>
                <span class="badge blue">类型: {{ osat.data_type }}</span>
              </div>
            </div>
            <div v-if="osat._msg" :class="['msg', osat._msg.ok ? 'success' : 'error']" style="margin-top:6px">
              {{ osat._msg.text }}
            </div>
          </div>

        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- FTP 上传日志卡片                         -->
      <!-- ═══════════════════════════════════════ -->
      <div class="settings-card">
        <div class="settings-card-header" @click="ftpLogExpanded = !ftpLogExpanded">
          <div class="settings-card-title">
            <span class="settings-icon">📋</span>
            <span>{{ (authStore.isAdmin || authStore.isEng) ? 'FTP 上传日志' : '手动上传日志' }}</span>
            <span class="badge blue" style="margin-left:8px">
              {{ activeLogSubTab === 'ftp' ? logTotal + ' 条' : manualLogTotal + ' 条' }}
            </span>
          </div>
          <span class="collapse-arrow">{{ ftpLogExpanded ? '▲' : '▼' }}</span>
        </div>

        <div v-if="ftpLogExpanded" class="settings-card-body">
          <!-- sub-tabs (only for admin/eng) -->
          <div v-if="authStore.isAdmin || authStore.isEng" class="quick-select-row" style="margin-bottom: 16px;">
            <button :class="['preset-btn', activeLogSubTab === 'ftp' ? 'active' : '']" @click="activeLogSubTab = 'ftp'">
              📋 FTP 自动上传日志
            </button>
            <button :class="['preset-btn', activeLogSubTab === 'manual' ? 'active' : '']" @click="activeLogSubTab = 'manual'">
              📤 ENG_上传日志
            </button>
          </div>

          <!-- FTP 自动上传日志 content -->
          <template v-if="activeLogSubTab === 'ftp' && (authStore.isAdmin || authStore.isEng)">
            <div class="log-filter-row">
              <select v-model="logFilterOsat" @change="loadFtpLogs" class="filter-select-sm">
                <option value="">全部 OSAT</option>
                <option v-for="o in osatList" :key="o.id" :value="o.id">{{ o.name }}</option>
              </select>
              <select v-model="logFilterStatus" @change="loadFtpLogs" class="filter-select-sm">
                <option value="">全部状态</option>
                <option value="success">✅ 成功</option>
                <option value="failed">❌ 失败</option>
                <option value="processing">⏳ 处理中</option>
              </select>
              <button class="btn-sm" @click="loadFtpLogs">🔄 刷新</button>
              <button class="btn-sm btn-warn" @click="loadStuckFiles" style="margin-left:auto">
                ⚠ 查看卡住文件 <span v-if="stuckFiles.length > 0" class="stuck-badge">{{ stuckFiles.length }}</span>
              </button>
            </div>

            <!-- Stuck files panel -->
            <div v-if="stuckPanelVisible" class="stuck-panel">
              <div class="stuck-panel-header">
                <span>⚠ 失败超过 {{ stuckMaxRetries }} 次、被跳过的文件（共 {{ stuckFiles.length }} 个）</span>
                <div class="stuck-panel-actions">
                  <button class="btn-sm btn-green" @click="retryAllStuck" :disabled="stuckRetrying"
                    v-if="stuckFiles.length > 0">
                    {{ stuckRetrying ? '重置中...' : '🔁 全部重试' }}
                  </button>
                  <button class="btn-sm" @click="stuckPanelVisible = false">关闭</button>
                </div>
              </div>
              <div v-if="stuckFiles.length === 0" class="empty-tip" style="margin:12px 0">没有卡住的文件 🎉</div>
              <table v-else class="log-table" style="margin-top:8px">
                <colgroup>
                  <col style="width:90px" />
                  <col />
                  <col style="width:60px" />
                  <col style="width:150px" />
                  <col style="width:220px" />
                  <col style="width:80px" />
                </colgroup>
                <thead>
                  <tr>
                    <th>OSAT</th>
                    <th>文件名</th>
                    <th>失败次数</th>
                    <th>最后尝试</th>
                    <th>最后错误</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in stuckFiles" :key="f.remote_path">
                    <td><span class="osat-tag">{{ f.osat_name || '—' }}</span></td>
                    <td class="log-path" :title="f.remote_path">{{ f.filename }}</td>
                    <td style="text-align:center"><span class="badge red">{{ f.fail_count }}</span></td>
                    <td>{{ fmtDate(f.last_attempt) }}</td>
                    <td class="log-error" :title="f.last_error">{{ f.last_error || '—' }}</td>
                    <td>
                      <button class="btn-sm btn-green" @click="retryOneStuck(f)" :disabled="f._retrying">
                        {{ f._retrying ? '...' : '🔁 重试' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="stuckMsg" :class="['msg', stuckMsg.ok ? 'success' : 'error']" style="margin-top:8px">
                {{ stuckMsg.text }}
              </div>
            </div>

            <div v-if="logsLoading" class="loading">加载中...</div>
            <div v-else-if="ftpLogs.length === 0" class="empty-tip">暂无上传日志</div>
            <table v-else class="log-table">
              <colgroup>
                <col style="width:90px" />
                <col />
                <col style="width:120px" />
                <col style="width:120px" />
                <col style="width:150px" />
                <col style="width:110px" />
              </colgroup>
              <thead>
                <tr>
                  <th>OSAT</th>
                  <th>文件名</th>
                  <th>状态</th>
                  <th>大小</th>
                  <th>时间</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in ftpLogs" :key="log.id">
                  <td><span class="osat-tag">{{ log.osat_name || '—' }}</span></td>
                  <td class="log-path" :title="log.remote_path">{{ log.filename || log.remote_path }}</td>
                  <td>
                    <span v-if="log.status === 'success'" class="badge green">✅ 成功</span>
                    <span v-else-if="log.status === 'failed'" class="badge red">❌ 失败</span>
                    <span v-else class="badge blue">⏳ 处理中</span>
                  </td>
                  <td>{{ log.file_size ? fmtBytes(log.file_size) : '—' }}</td>
                  <td>{{ fmtDate(log.uploaded_at) }}</td>
                  <td class="log-error">{{ log.error_msg || (log.lot_id_created ? `Lot#${log.lot_id_created}` : '—') }}</td>
                </tr>
              </tbody>
            </table>

            <!-- FTP pagination -->
            <div v-if="logTotal > logPageSize" class="log-pagination">
              <button :disabled="logPage === 1" @click="logPage--; loadFtpLogs()" class="btn-sm">上一页</button>
              <span>第 {{ logPage }} 页 / 共 {{ Math.ceil(logTotal / logPageSize) }} 页</span>
              <button :disabled="logPage * logPageSize >= logTotal" @click="logPage++; loadFtpLogs()" class="btn-sm">下一页</button>
            </div>
          </template>

          <!-- ENG_上传日志 content (manual uploads) -->
          <template v-if="activeLogSubTab === 'manual' || (!authStore.isAdmin && !authStore.isEng)">
            <div class="log-filter-row">
              <button class="btn-sm" @click="loadManualLogs">🔄 刷新</button>
            </div>

            <div v-if="manualLogsLoading" class="loading">加载中...</div>
            <div v-else-if="manualLogs.length === 0" class="empty-tip">暂无手动上传日志</div>
            <table v-else class="log-table">
              <colgroup>
                <col style="width:70px" />
                <col />
                <col style="width:120px" />
                <col style="width:120px" />
                <col style="width:150px" />
                <col v-if="authStore.isAdmin || authStore.isEng" style="width:120px" />
              </colgroup>
              <thead>
                <tr>
                  <th>类型</th>
                  <th>文件名</th>
                  <th>状态</th>
                  <th>大小</th>
                  <th>时间</th>
                  <th v-if="authStore.isAdmin || authStore.isEng">上传者</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in manualLogs" :key="log.upload_type + '-' + log.id">
                  <td>
                    <span :class="['badge', log.upload_type === 'program' ? 'purple' : 'blue']">
                      {{ log.upload_type === 'program' ? '程序' : '数据' }}
                    </span>
                  </td>
                  <td class="log-path" :title="log.filename">{{ log.filename }}</td>
                  <td>
                    <span v-if="log.status === 'success'" class="badge green">✅ 成功</span>
                    <span v-else-if="log.status === 'failed'" class="badge red" :title="log.error_msg">❌ 失败</span>
                    <span v-else class="badge blue">⏳ 处理中</span>
                    <div v-if="log.status === 'failed' && log.error_msg" class="log-error" :title="log.error_msg" style="margin-top:4px">
                      {{ log.error_msg }}
                    </div>
                  </td>
                  <td>{{ log.file_size ? fmtBytes(log.file_size) : '—' }}</td>
                  <td>{{ fmtDate(log.upload_date) }}</td>
                  <td v-if="authStore.isAdmin || authStore.isEng">{{ log.uploader_name || '—' }}</td>
                </tr>
              </tbody>
            </table>

            <!-- Manual pagination -->
            <div v-if="manualLogTotal > manualLogPageSize" class="log-pagination">
              <button :disabled="manualLogPage === 1" @click="manualLogPage--; loadManualLogs()" class="btn-sm">上一页</button>
              <span>第 {{ manualLogPage }} 页 / 共 {{ Math.ceil(manualLogTotal / manualLogPageSize) }} 页</span>
              <button :disabled="manualLogPage * manualLogPageSize >= manualLogTotal" @click="manualLogPage++; loadManualLogs()" class="btn-sm">下一页</button>
            </div>
          </template>
        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- 用户管理                                 -->
      <!-- ═══════════════════════════════════════ -->
      <div v-if="authStore.isAdmin" class="settings-card">
        <div class="settings-card-header" @click="userMgmtExpanded = !userMgmtExpanded">
          <div class="settings-card-title">
            <span class="settings-icon">👥</span>
            <span>用户管理</span>
          </div>
          <span class="collapse-arrow">{{ userMgmtExpanded ? '▲' : '▼' }}</span>
        </div>
        <div v-if="userMgmtExpanded" class="settings-card-body">
          <div v-if="adminLoading" class="loading">加载中...</div>
          <table v-else class="user-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>状态</th>
                <th>角色</th>
                <th>注册时间</th>
                <th>上传数量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in userList" :key="u.id">
                <td>{{ u.username }}</td>
                <td class="email-cell">{{ u.email }}</td>
                <td>
                  <span :class="['badge', u.is_active ? 'green' : 'red']">
                    {{ u.is_active ? '正常' : '已禁用' }}
                  </span>
                </td>
                <td>
                  <span v-if="u.role === 'admin'" class="badge gold">Admin</span>
                  <span v-else-if="u.role === 'eng'" class="badge blue">ENG</span>
                  <span v-else class="badge gray">User</span>
                </td>
                <td>{{ fmtDate(u.created_at) }}</td>
                <td>{{ u.lot_count }}</td>
                <td class="action-cell">
                  <button class="btn-sm" @click="toggleActive(u)" :disabled="u.id === authStore.user?.id">
                    {{ u.is_active ? '禁用' : '启用' }}
                  </button>
                  <select v-model="u.role" @change="setRole(u)" class="role-select" :disabled="u.id === authStore.user?.id">
                    <option value="user">User</option>
                    <option value="eng">ENG</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button class="btn-sm btn-warn" @click="openResetPw(u)">重置密码</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 重置密码弹窗 -->
      <div v-if="resetTarget" class="modal-overlay" @click.self="resetTarget = null">
        <div class="modal">
          <h3>重置用户密码</h3>
          <p>为 <strong>{{ resetTarget.username }}</strong> 设置新密码</p>
          <input v-model="newPwForUser" type="password" placeholder="至少8位" class="modal-input" />
          <div v-if="adminPwError" class="msg error">{{ adminPwError }}</div>
          <div class="modal-actions">
            <button class="btn-primary" @click="doAdminResetPw" :disabled="adminPwLoading">
              {{ adminPwLoading ? '保存中...' : '确认重置' }}
            </button>
            <button class="btn-cancel" @click="resetTarget = null">取消</button>
          </div>
        </div>
      </div>

      <!-- OSAT 新增/编辑弹窗 -->
      <div v-if="osatModal" class="modal-overlay" @click.self="osatModal = null">
        <div class="modal modal-lg">
          <h3>{{ osatModal.id ? '编辑 OSAT' : '新增 OSAT' }}</h3>
          <div class="form-field quick-ftp-parser">
            <label>自动识别 FTP 配置</label>
            <textarea
              v-model="osatQuickInput"
              placeholder="可粘贴带标签配置，或按顺序粘贴：OSAT名称  FTP服务器地址  端口ID  FTP用户名  FTP密码  Data目录  Summary目录"
            ></textarea>
            <div class="quick-actions">
              <button class="btn-primary small" @click="parseOsatQuickInput">识别填入</button>
              <span class="quick-hint">识别后请确认字段无误，再点击保存。</span>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field">
              <label>OSAT 名称 *</label>
              <input v-model="osatModal.name" placeholder="如 CMC、JCET" />
            </div>
            <div class="form-field">
              <label>FTP 服务器地址 *</label>
              <input v-model="osatModal.ftp_host" placeholder="如 192.168.1.100" />
            </div>
            <div class="form-field">
              <label>FTP 端口</label>
              <input v-model.number="osatModal.ftp_port" type="number" placeholder="21" />
            </div>
            <div class="form-field">
              <label>FTP 加密方式</label>
              <select v-model="osatModal.ftp_encryption" style="width:100%;height:38px;border-radius:8px;border:1px solid #e2e8f0;padding:0 12px;box-sizing:border-box;outline:none;">
                <option value="explicit_tls_optional">如果可用，使用显式的 FTP over TLS</option>
                <option value="explicit_tls_required">要求显式的 FTP over TLS</option>
                <option value="implicit_tls_required">要求隐式的 FTP over TLS</option>
                <option value="plain">只使用明文 FTP（不安全）⚠</option>
              </select>
            </div>
            <div class="form-field">
              <label>FTP 用户名 *</label>
              <input v-model="osatModal.ftp_user" placeholder="FTP 登录用户名" />
            </div>
            <div class="form-field">
              <label>FTP 密码 *</label>
              <input v-model="osatModal.ftp_password" type="password" placeholder="FTP 登录密码" />
            </div>
            <div class="form-field">
              <label>Data 目录</label>
              <input v-model="osatModal.ftp_remote_dir" placeholder="如 /data 或 /" />
            </div>
            <div class="form-field">
              <label>Summary 目录</label>
              <input v-model="osatModal.ftp_summary_dir" placeholder="如 /Summary 或 /CP Report" />
            </div>
            <div class="form-field">
              <label>抓取开始时间</label>
              <input v-model="osatModal.schedule_start" placeholder="22:00" />
            </div>
            <div class="form-field">
              <label>抓取结束时间</label>
              <input v-model="osatModal.schedule_end" placeholder="08:00" />
            </div>
            <div class="form-field">
              <label>数据类型 (FT/CP)</label>
              <select v-model="osatModal.data_type" style="width:100%;height:38px;border-radius:8px;border:1px solid #e2e8f0;padding:0 12px;box-sizing:border-box;outline:none;">
                <option value="CP">CP (芯片晶圆测试)</option>
                <option value="FT">FT (芯片终测)</option>
              </select>
            </div>
          </div>
          <div class="form-field" style="margin-top:8px">
            <label class="toggle-label" style="font-size:14px">
              <input type="checkbox" v-model="osatModal.enabled" />
              &nbsp;启用定时自动抓取（每5分钟检查一次是否在时间窗口内）
            </label>
          </div>
          <div v-if="osatModalError" class="msg error">{{ osatModalError }}</div>
          <div class="modal-actions" style="margin-top:16px">
            <button class="btn-primary" @click="saveOsatModal" :disabled="osatModalSaving">
              {{ osatModalSaving ? '保存中...' : '保存' }}
            </button>
            <button class="btn-cancel" @click="osatModal = null">取消</button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTimezoneStore, getBrowserTimezone } from '@/stores/timezone'
import { fmtDateTz, COMMON_TIMEZONES } from '@/utils/dateUtils'
import api from '@/api/index'

const authStore = useAuthStore()
const route = useRoute()

// ── Tabs ──
const visibleTabs = computed(() => {
  const list = [
    { key: 'info',   label: '个人信息' },
    { key: 'shares', label: '我的分享' },
  ]
  if (authStore.isAdmin || authStore.isEng) {
    list.push({ key: 'admin',  label: '系统管理' })
  } else {
    list.push({ key: 'admin',  label: '上传日志' })
  }
  return list
})
const activeTab = ref((route.path === '/settings' && (authStore.isAdmin || authStore.isEng)) ? 'admin' : 'info')

watch(() => route.path, (newPath) => {
  if (newPath === '/settings' && (authStore.isAdmin || authStore.isEng)) {
    activeTab.value = 'admin'
  } else {
    activeTab.value = 'info'
  }
})

// ── 折叠状态 ──
const smtpExpanded    = ref(false)
const osatExpanded    = ref(false)
const ftpLogExpanded  = ref(true)
const userMgmtExpanded = ref(false)
const tzExpanded      = ref(false)

// ── 时区设置 ──
const timezoneStore = useTimezoneStore()
const browserTz     = ref(getBrowserTimezone())
const tzList        = COMMON_TIMEZONES
const tzSelected    = ref(timezoneStore.timezone)
const tzCustom      = ref('')
const tzSaveMsg     = ref<{ok: boolean; text: string} | null>(null)
const tzPreview     = computed(() => {
  const tz = tzCustom.value.trim() || tzSelected.value
  try {
    return new Date().toLocaleString('zh-CN', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).replace(/\//g, '-')
  } catch {
    return '无效的时区'
  }
})

function saveTz() {
  const tz = tzCustom.value.trim() || tzSelected.value
  try {
    // 验证时区是否有效
    new Date().toLocaleString('zh-CN', { timeZone: tz })
    timezoneStore.setTimezone(tz)
    tzSaveMsg.value = { ok: true, text: `✅ 时区已设置为 ${tz}，页面所有时间均已更新` }
    setTimeout(() => { tzSaveMsg.value = null }, 4000)
  } catch {
    tzSaveMsg.value = { ok: false, text: `❌ 无效的时区：${tz}，请检查输入` }
  }
}

function resetTzToBrowser() {
  const tz = timezoneStore.resetToBrowser()
  tzSelected.value = tz
  tzCustom.value = ''
  tzSaveMsg.value = { ok: true, text: `✅ 已还原为浏览器时区：${tz}` }
  setTimeout(() => { tzSaveMsg.value = null }, 3000)
}

// ── 个人信息 / 修改密码 ──
const pwForm    = ref({ old: '', new: '', confirm: '' })
const pwLoading = ref(false)
const pwError   = ref('')
const pwSuccess = ref('')

async function handleChangePw() {
  pwError.value = ''
  pwSuccess.value = ''
  if (pwForm.value.new !== pwForm.value.confirm) {
    pwError.value = '两次输入的密码不一致'; return
  }
  if (pwForm.value.new.length < 8) {
    pwError.value = '新密码至少8位'; return
  }
  pwLoading.value = true
  try {
    await api.put('/auth/change-password', {
      old_password: pwForm.value.old,
      new_password: pwForm.value.new,
    })
    pwSuccess.value = '密码已修改，下次登录时请使用新密码'
    pwForm.value = { old: '', new: '', confirm: '' }
  } catch (e: any) {
    pwError.value = e || '修改失败'
  } finally {
    pwLoading.value = false
  }
}

// ── 分享 ──
interface Share {
  id: number; lot_id: number; lot_filename: string
  shared_by_username: string; shared_to_username: string
  expires_at: string; created_at: string; message?: string
}
const received = ref<Share[]>([])
const sent     = ref<Share[]>([])

async function loadShares() {
  try {
    const [r, s]: any = await Promise.all([
      api.get('/shares/received'),
      api.get('/shares/sent'),
    ])
    received.value = r
    sent.value     = s
  } catch {}
}

async function revokeShare(id: number) {
  try {
    await api.delete(`/shares/${id}`)
    sent.value = sent.value.filter(s => s.id !== id)
  } catch (e: any) {
    alert(e)
  }
}

function daysLeft(expiresAt: string) {
  const ms   = new Date(expiresAt).getTime() - Date.now()
  const days = Math.ceil(ms / 86400000)
  return days > 0 ? `剩余 ${days} 天` : '已过期'
}
function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() < Date.now()
}

// ════════════════════════════════════════
// SMTP 邮箱配置
// ════════════════════════════════════════

const emailPresets = [
  { label: 'QQ 邮箱',      host: 'smtp.qq.com',         port: 465, ssl: true  },
  { label: '163 邮箱',     host: 'smtp.163.com',        port: 465, ssl: true  },
  { label: 'Gmail',        host: 'smtp.gmail.com',      port: 465, ssl: true  },
  { label: 'Outlook',      host: 'smtp.office365.com',  port: 587, ssl: false },
]

const smtpForm = ref({
  smtp_host: '',
  smtp_port: 465,
  smtp_user: '',
  smtp_password: '',
  smtp_from: '',
  smtp_ssl: true,
})
const smtpConfigured = ref(false)
const smtpSaving     = ref(false)
const smtpSaveMsg    = ref<{ok: boolean; text: string} | null>(null)
const smtpTestEmail  = ref('')
const smtpTesting    = ref(false)
const smtpTestMsg    = ref<{ok: boolean; text: string} | null>(null)

function applyPreset(preset: typeof emailPresets[0]) {
  smtpForm.value.smtp_host = preset.host
  smtpForm.value.smtp_port = preset.port
  smtpForm.value.smtp_ssl  = preset.ssl
}

async function loadSmtpConfig() {
  try {
    const data: any = await api.get('/settings/smtp')
    smtpConfigured.value = data.is_configured
    if (data.is_configured) {
      smtpForm.value.smtp_host = data.smtp_host || ''
      smtpForm.value.smtp_port = data.smtp_port || 465
      smtpForm.value.smtp_user = data.smtp_user || ''
      smtpForm.value.smtp_from = data.smtp_from || ''
      smtpForm.value.smtp_ssl  = data.smtp_ssl  ?? true
    }
  } catch {}
}

async function saveSmtp() {
  smtpSaveMsg.value = null
  smtpSaving.value = true
  try {
    await api.put('/settings/smtp', smtpForm.value)
    smtpSaveMsg.value = { ok: true, text: '✅ SMTP 配置已保存' }
    smtpConfigured.value = true
  } catch (e: any) {
    smtpSaveMsg.value = { ok: false, text: `❌ 保存失败：${e}` }
  } finally {
    smtpSaving.value = false
  }
}

async function sendTestEmail() {
  smtpTestMsg.value = null
  if (!smtpTestEmail.value) { alert('请输入收件人邮箱'); return }
  smtpTesting.value = true
  try {
    const r: any = await api.post('/settings/smtp/test', { to_email: smtpTestEmail.value })
    smtpTestMsg.value = { ok: true, text: `✅ ${r.message}` }
  } catch (e: any) {
    smtpTestMsg.value = { ok: false, text: `❌ ${e}` }
  } finally {
    smtpTesting.value = false
  }
}

// ════════════════════════════════════════
// OSAT / FTP 管理
// ════════════════════════════════════════

interface OsatItem {
  id: number; name: string
  ftp_host: string; ftp_port: number; ftp_user: string
  ftp_encryption: string; ftp_remote_dir: string; ftp_summary_dir: string
  schedule_start: string; schedule_end: string
  enabled: boolean; data_type: string; created_at?: string; updated_at?: string
  _testing?: boolean; _running?: boolean
  _msg?: { ok: boolean; text: string } | null
}

const osatList = ref<OsatItem[]>([])

function formatFtpEncryption(value: string) {
  const labels: Record<string, string> = {
    explicit_tls_optional: '显式 TLS（可用时）',
    explicit_tls_required: '显式 TLS',
    implicit_tls_required: '隐式 TLS',
    plain: '明文 FTP',
  }
  return labels[value] || '明文 FTP'
}

async function loadOsats() {
  try {
    const data: any = await api.get('/settings/osats')
    osatList.value = data.map((o: any) => ({ ...o, _testing: false, _running: false, _msg: null }))
  } catch {}
}

// OSAT 弹窗
const osatModal      = ref<any>(null)
const osatModalError = ref('')
const osatModalSaving = ref(false)
const osatQuickInput = ref('')

function normalizeFtpHost(raw: string) {
  const value = (raw || '').trim()
  if (!value) return ''
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`ftp://${value}`)
    return url.hostname || value.replace(/^ftp:\/\//i, '').replace(/\/+$/, '')
  } catch {
    return value.replace(/^ftp:\/\//i, '').replace(/\/+$/, '')
  }
}

function inferFtpEncryption(raw: string) {
  const value = (raw || '').toLowerCase()
  if (value.includes('implicit') || value.includes('隐式')) return 'implicit_tls_required'
  if (value.includes('optional') || value.includes('可用')) return 'explicit_tls_optional'
  if (value.includes('tls') || value.includes('加密')) return 'explicit_tls_required'
  if (value.includes('plain') || value.includes('明文') || value.includes('不安全')) return 'plain'
  return osatModal.value?.ftp_encryption || 'plain'
}

function assignOsatField(label: string, value: string) {
  const key = label.toLowerCase().replace(/[：:\s]/g, '')
  const val = value.trim()
  if (!val) return
  if (key.includes('服务器名') || key.includes('osat') || key.includes('名称')) { osatModal.value.name = val; return true }
  if (key.includes('服务器地址') || key.includes('ftp服务器') || key.includes('地址') || key.includes('host')) { osatModal.value.ftp_host = normalizeFtpHost(val); return true }
  if (key.includes('端口')) { osatModal.value.ftp_port = Number(val) || 21; return true }
  if (key.includes('加密')) { osatModal.value.ftp_encryption = inferFtpEncryption(val); return true }
  if (key.includes('用户名') || key.includes('用户')) { osatModal.value.ftp_user = val; return true }
  if (key.includes('密码')) { osatModal.value.ftp_password = val; return true }
  if (key.includes('summary')) { osatModal.value.ftp_summary_dir = val || '/'; return true }
  if (key.includes('data') || key.includes('数据路径') || key.includes('远程根目录')) { osatModal.value.ftp_remote_dir = val || '/'; return true }
  return false
}

function parseSequentialOsatInput(text: string) {
  const tabParts = text.split(/\t+/).map(s => s.trim()).filter(Boolean)
  const parts = tabParts.length >= 4
    ? tabParts
    : text.replace(/\r?\n/g, ' ').split(/\s+/).map(s => s.trim()).filter(Boolean)
  if (parts.length < 5) return false

  const name = parts[0]
  const host = parts[1]
  let cursor = 2
  let port = 21
  if (/^\d+$/.test(parts[cursor] || '')) {
    port = Number(parts[cursor])
    cursor += 1
  }

  const user = parts[cursor]
  const password = parts[cursor + 1]
  const remaining = parts.slice(cursor + 2)
  if (!name || !host || !user || !password || remaining.length < 1) return false

  osatModal.value.name = name
  osatModal.value.ftp_host = normalizeFtpHost(host)
  osatModal.value.ftp_port = port
  osatModal.value.ftp_user = user
  osatModal.value.ftp_password = password
  osatModal.value.ftp_remote_dir = remaining[0] || '/'
  osatModal.value.ftp_summary_dir = remaining.slice(1).join(' ') || '/'
  return true
}

function parseOsatQuickInput() {
  osatModalError.value = ''
  const text = osatQuickInput.value.trim()
  if (!text) {
    osatModalError.value = '请先粘贴 FTP 配置内容'
    return
  }

  if (text.includes('\t') && parseSequentialOsatInput(text)) {
    return
  }

  let matchedLabel = false
  text.split(/\r?\n/).forEach(line => {
    const pairs = [...line.matchAll(/([^：:\s]+(?:\s*[^：:\s]+)*)[：:]\s*([^：:]+?)(?=\s+[^：:\s]+(?:\s*[^：:\s]+)*[：:]|$)/g)]
    if (pairs.length) {
      pairs.forEach(match => {
        const label = match[1]
        const value = match[2]
        if (label && value && assignOsatField(label, value)) matchedLabel = true
      })
    }
  })

  if (!matchedLabel && !parseSequentialOsatInput(text)) {
    osatModalError.value = '未识别成功，请检查是否包含 OSAT名称、服务器地址、用户名、密码、Data目录、Summary目录'
    return
  }

  if (!osatModal.value.schedule_start) osatModal.value.schedule_start = '22:00'
  if (!osatModal.value.schedule_end) osatModal.value.schedule_end = '08:00'
  if (!osatModal.value.data_type) osatModal.value.data_type = 'CP'
  if (!osatModal.value.ftp_encryption) osatModal.value.ftp_encryption = 'plain'
}

function openOsatModal(osat: OsatItem | null) {
  osatModalError.value = ''
  osatQuickInput.value = ''
  if (osat) {
    osatModal.value = {
      id: osat.id,
      name: osat.name,
      ftp_host: osat.ftp_host,
      ftp_port: osat.ftp_port,
      ftp_user: osat.ftp_user,
      ftp_encryption: osat.ftp_encryption || 'plain',
      ftp_password: '',          // 密码不回显，编辑时需重新输入
      ftp_remote_dir: osat.ftp_remote_dir,
      ftp_summary_dir: osat.ftp_summary_dir || '/',
      schedule_start: osat.schedule_start,
      schedule_end: osat.schedule_end,
      enabled: osat.enabled,
      data_type: osat.data_type || 'CP',
    }
  } else {
    osatModal.value = {
      id: null,
      name: '', ftp_host: '', ftp_port: 21, ftp_user: '',
      ftp_encryption: 'plain',
      ftp_password: '', ftp_remote_dir: '/', ftp_summary_dir: '/',
      schedule_start: '22:00', schedule_end: '08:00', enabled: false,
      data_type: 'CP',
    }
  }
}

async function saveOsatModal() {
  osatModalError.value = ''
  if (!osatModal.value.name) { osatModalError.value = '请填写 OSAT 名称'; return }
  if (!osatModal.value.ftp_host) { osatModalError.value = '请填写 FTP 地址'; return }
  if (!osatModal.value.ftp_user) { osatModalError.value = '请填写 FTP 用户名'; return }
  if (!osatModal.value.id && !osatModal.value.ftp_password) { osatModalError.value = '请填写 FTP 密码'; return }

  osatModalSaving.value = true
  try {
    if (osatModal.value.id) {
      await api.put(`/settings/osats/${osatModal.value.id}`, osatModal.value)
    } else {
      await api.post('/settings/osats', osatModal.value)
    }
    osatModal.value = null
    await loadOsats()
  } catch (e: any) {
    osatModalError.value = `保存失败：${e}`
  } finally {
    osatModalSaving.value = false
  }
}

async function deleteOsat(osat: OsatItem) {
  if (!confirm(`确认删除 OSAT「${osat.name}」？关联的上传日志也将一并删除。`)) return
  try {
    await api.delete(`/settings/osats/${osat.id}`)
    await loadOsats()
  } catch (e: any) {
    alert(`删除失败：${e}`)
  }
}

async function testOsatFtp(osat: OsatItem) {
  osat._testing = true
  osat._msg = null
  try {
    const r: any = await api.post(`/settings/osats/${osat.id}/test`)
    osat._msg = { ok: true, text: `✅ ${r.message}` }
  } catch (e: any) {
    osat._msg = { ok: false, text: `❌ ${e}` }
  } finally {
    osat._testing = false
  }
}

async function toggleOsatStatus(osat: OsatItem) {
  osat._running = true
  osat._msg = null
  const newStatus = !osat.enabled
  try {
    const payload = {
      name: osat.name,
      ftp_host: osat.ftp_host,
      ftp_port: osat.ftp_port,
      ftp_user: osat.ftp_user,
      ftp_encryption: osat.ftp_encryption || 'plain',
      ftp_password: '******',
      ftp_remote_dir: osat.ftp_remote_dir,
      ftp_summary_dir: osat.ftp_summary_dir || '/',
      schedule_start: osat.schedule_start,
      schedule_end: osat.schedule_end,
      enabled: newStatus,
      data_type: osat.data_type,
    }
    await api.put(`/settings/osats/${osat.id}`, payload)
    osat.enabled = newStatus

    if (newStatus) {
      const r: any = await api.post(`/settings/osats/${osat.id}/run-now`)
      osat._msg = { ok: true, text: `✅ 已成功启用定时抓取，并触发了立即执行：${r.message}` }
    } else {
      osat._msg = { ok: true, text: `⏹ 已成功停止定时抓取任务` }
    }
  } catch (e: any) {
    osat._msg = { ok: false, text: `❌ 操作失败：${e}` }
  } finally {
    osat._running = false
  }
}

// ── FTP 上传日志 ──
interface FtpLog {
  id: number; osat_id: number; osat_name?: string
  remote_path: string; filename?: string; status: string
  error_msg?: string; file_size?: number; lot_id_created?: number
  uploaded_at?: string
}
const ftpLogs        = ref<FtpLog[]>([])
const logsLoading    = ref(false)
const logFilterOsat  = ref<number | ''>('')
const logFilterStatus = ref('')
const logPage        = ref(1)
const logPageSize    = ref(20)
const logTotal       = ref(0)

async function loadFtpLogs() {
  logsLoading.value = true
  try {
    const params: any = { page: logPage.value, page_size: logPageSize.value }
    if (logFilterOsat.value) params.osat_id = logFilterOsat.value
    if (logFilterStatus.value) params.status = logFilterStatus.value
    const data: any = await api.get('/settings/ftp-logs', { params })
    ftpLogs.value = data.items || []
    logTotal.value = data.total || 0
  } catch {} finally {
    logsLoading.value = false
  }
}

// ── Manual Upload Logs ──
interface ManualLog {
  upload_type: string
  id: number
  filename: string
  upload_date: string
  status: string
  error_msg?: string
  file_size?: number
  uploader_name?: string
  uploader_id?: number
}
const manualLogs        = ref<ManualLog[]>([])
const manualLogsLoading = ref(false)
const manualLogPage     = ref(1)
const manualLogPageSize = ref(20)
const manualLogTotal    = ref(0)
const activeLogSubTab   = ref((authStore.isAdmin || authStore.isEng) ? 'ftp' : 'manual')

async function loadManualLogs() {
  manualLogsLoading.value = true
  try {
    const params: any = { page: manualLogPage.value, page_size: manualLogPageSize.value }
    const data: any = await api.get('/settings/manual-logs', { params })
    manualLogs.value = data.items || []
    manualLogTotal.value = data.total || 0
  } catch {} finally {
    manualLogsLoading.value = false
  }
}

watch(activeTab, (newTab) => {
  if (newTab === 'admin') {
    loadManualLogs()
  }
})

// ── 卡住文件（失败超过上限且从未成功）──
interface StuckFile {
  osat_id: number; osat_name?: string
  remote_path: string; filename: string
  fail_count: number; last_attempt?: string; last_error?: string
  _retrying?: boolean
}
const stuckFiles       = ref<StuckFile[]>([])
const stuckPanelVisible = ref(false)
const stuckMaxRetries  = ref(3)
const stuckRetrying    = ref(false)
const stuckMsg         = ref<{ok: boolean; text: string} | null>(null)

async function loadStuckFiles() {
  stuckMsg.value = null
  try {
    const params: any = {}
    if (logFilterOsat.value) params.osat_id = logFilterOsat.value
    const data: any = await api.get('/settings/ftp-logs/failed-summary', { params })
    stuckFiles.value = (data.items || []).map((f: any) => ({ ...f, _retrying: false }))
    stuckMaxRetries.value = data.max_retries || 3
    stuckPanelVisible.value = true
  } catch (e: any) {
    alert(`加载失败：${e}`)
  }
}

async function retryOneStuck(f: StuckFile) {
  f._retrying = true
  stuckMsg.value = null
  try {
    const r: any = await api.delete('/settings/ftp-logs/failed', {
      params: { remote_path: f.remote_path }
    })
    stuckMsg.value = { ok: true, text: `✅ 已重置「${f.filename}」，下次扫描将重新尝试` }
    // 从列表移除
    stuckFiles.value = stuckFiles.value.filter(x => x.remote_path !== f.remote_path)
    await loadFtpLogs()
  } catch (e: any) {
    stuckMsg.value = { ok: false, text: `❌ 重置失败：${e}` }
  } finally {
    f._retrying = false
  }
}

async function retryAllStuck() {
  if (!confirm(`确认重试所有 ${stuckFiles.value.length} 个卡住文件？它们将在下次 FTP 扫描时被重新处理。`)) return
  stuckRetrying.value = true
  stuckMsg.value = null
  try {
    const params: any = {}
    if (logFilterOsat.value) params.osat_id = logFilterOsat.value
    const r: any = await api.delete('/settings/ftp-logs/failed', { params })
    stuckMsg.value = { ok: true, text: `✅ ${r.message}` }
    stuckFiles.value = []
    await loadFtpLogs()
  } catch (e: any) {
    stuckMsg.value = { ok: false, text: `❌ 重置失败：${e}` }
  } finally {
    stuckRetrying.value = false
  }
}

// ── Admin：用户管理 ──
interface UserItem {
  id: number; username: string; email: string
  role: string; is_active: boolean
  email_verified: boolean; created_at: string
  last_login_at?: string; storage_used_bytes?: number; lot_count: number
}
const userList      = ref<UserItem[]>([])
const adminLoading  = ref(false)
const resetTarget   = ref<UserItem | null>(null)
const newPwForUser  = ref('')
const adminPwError  = ref('')
const adminPwLoading = ref(false)

async function loadUsers() {
  adminLoading.value = true
  try {
    const data: any = await api.get('/users')
    userList.value = data
  } catch {} finally {
    adminLoading.value = false
  }
}

async function toggleActive(u: UserItem) {
  try {
    const r: any = await api.put(`/users/${u.id}/toggle-active`)
    u.is_active = r.is_active
  } catch (e: any) { alert(e) }
}

async function setRole(u: UserItem) {
  try {
    const r: any = await api.put(`/users/${u.id}/role?role=${u.role}`)
    u.role = r.role
  } catch (e: any) {
    alert(e)
    await loadUsers()
  }
}

function openResetPw(u: UserItem) {
  resetTarget.value  = u
  newPwForUser.value = ''
  adminPwError.value = ''
}

async function doAdminResetPw() {
  if (newPwForUser.value.length < 8) {
    adminPwError.value = '密码至少8位'; return
  }
  adminPwLoading.value = true
  try {
    await api.put(`/users/${resetTarget.value!.id}/reset-password`, {
      new_password: newPwForUser.value,
    })
    resetTarget.value = null
  } catch (e: any) {
    adminPwError.value = e || '重置失败'
  } finally {
    adminPwLoading.value = false
  }
}

// ── 工具 ──
function fmtDate(d?: string) {
  return fmtDateTz(d)
}
function fmtBytes(b?: number) {
  if (!b) return '0 B'
  if (b < 1024) return b + ' B'
  if (b < 1024 ** 2) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1024 ** 3) return (b / 1024 ** 2).toFixed(1) + ' MB'
  return (b / 1024 ** 3).toFixed(2) + ' GB'
}

onMounted(async () => {
  await authStore.refreshMe()
  await loadShares()
  await loadManualLogs()
  if (authStore.isAdmin || authStore.isEng) {
    await Promise.all([loadOsats(), loadFtpLogs(), loadSmtpConfig()])
  }
  if (authStore.isAdmin) {
    await loadUsers()
  }
})
</script>


<style scoped>
.profile-page { width: 100%; max-width: 1600px; margin: 0 auto; padding: 24px; box-sizing: border-box; }

/* 页头 */
.page-header { background: white; border-radius: 12px; padding: 24px 28px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.avatar-block { display: flex; align-items: center; gap: 18px; }
.avatar { width: 64px; height: 64px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: white; }
.username { font-size: 20px; font-weight: 600; color: #1a1a2e; }
.badges { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 20px; font-weight: 500; }
.badge.blue  { background: #eff6ff; color: #3b82f6; }
.badge.gold  { background: #fffbeb; color: #d97706; }
.badge.green { background: #f0fdf4; color: #16a34a; }
.badge.red   { background: #fef2f2; color: #dc2626; }
.badge.gray  { background: #f3f4f6; color: #6b7280; }
.badge.purple { background: #f5f3ff; color: #7c3aed; }

/* Tabs */
.tabs { display: flex; gap: 4px; margin-bottom: 20px; }
.tab-btn { padding: 8px 20px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; background: white; color: #666; box-shadow: 0 1px 4px rgba(0,0,0,0.06); transition: all 0.2s; }
.tab-btn.active { background: #3b82f6; color: white; }
.tab-btn:hover:not(.active) { background: #f0f4ff; color: #3b82f6; }

/* Panel */
.panel { background: #f8fafc; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; flex-direction: column; gap: 16px; }

/* 个人信息 */
.info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
.info-item { background: #f8fafc; border-radius: 8px; padding: 14px 16px; }
.info-label { font-size: 12px; color: #888; display: block; margin-bottom: 4px; }
.info-value { font-size: 14px; font-weight: 500; color: #1a1a2e; word-break: break-all; }
.section-title { font-size: 15px; font-weight: 600; color: #1a1a2e; margin-bottom: 16px; border-left: 3px solid #3b82f6; padding-left: 10px; }

/* 修改密码 */
.field-row { display: flex; gap: 12px; flex-wrap: wrap; }
.field-row .field { flex: 1; min-width: 200px; }
.field label { display: block; font-size: 13px; color: #555; margin-bottom: 5px; }
.field input { width: 100%; padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; transition: border-color 0.2s; }
.field input:focus { outline: none; border-color: #3b82f6; }

/* 通用按钮 */
.btn-primary { margin-top: 12px; padding: 9px 24px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity 0.2s; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.msg { font-size: 13px; margin: 10px 0; padding: 8px 12px; border-radius: 6px; }
.msg.error   { background: #fef2f2; color: #dc2626; }
.msg.success { background: #f0fdf4; color: #16a34a; }

/* 分享 */
.share-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.count { background: #3b82f6; color: white; font-size: 11px; border-radius: 10px; padding: 1px 7px; margin-left: 6px; }
.empty-tip { color: #aaa; font-size: 14px; padding: 20px 0; }
.share-card { background: #f8fafc; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; border: 1px solid #e2e8f0; }
.share-file { font-size: 14px; font-weight: 500; color: #1a1a2e; margin-bottom: 6px; }
.share-meta { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #666; }
.share-msg { font-size: 12px; color: #888; margin-top: 6px; font-style: italic; }
.tag { font-size: 12px; background: #eff6ff; color: #3b82f6; padding: 2px 8px; border-radius: 10px; }
.tag.expired { background: #fef2f2; color: #dc2626; }
.btn-revoke { margin-top: 8px; padding: 4px 10px; font-size: 12px; background: transparent; border: 1px solid #fca5a5; color: #dc2626; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.btn-revoke:hover { background: #fef2f2; }

/* ── 设置卡片 ── */
.settings-card {
  background: white; border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.settings-card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: background 0.15s;
  user-select: none;
}
.settings-card-header:hover { background: #f8fafc; }
.settings-card-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #1a1a2e; }
.settings-icon { font-size: 18px; }
.collapse-arrow { color: #aaa; font-size: 12px; }
.settings-card-body { padding: 20px; border-top: 1px solid #f1f5f9; }

/* 快速选择行 */
.quick-select-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.quick-label { font-size: 13px; color: #666; white-space: nowrap; }
.preset-btn { padding: 5px 14px; border-radius: 20px; border: 1px solid #e2e8f0; background: white; font-size: 13px; cursor: pointer; transition: all 0.2s; color: #555; }
.preset-btn:hover { border-color: #3b82f6; color: #3b82f6; }
.preset-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }

/* 表单网格 */
.form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.form-field label { display: block; font-size: 13px; color: #555; margin-bottom: 5px; font-weight: 500; }
.form-field input, .form-field select, .form-field textarea {
  width: 100%; padding: 9px 12px;
  border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; box-sizing: border-box;
  transition: border-color 0.2s; background: white; color: #1a1a2e;
}
.form-field textarea { min-height: 86px; resize: vertical; line-height: 1.5; }
.form-field input:focus, .form-field select:focus, .form-field textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.quick-ftp-parser { margin-bottom: 14px; }
.quick-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.btn-primary.small { margin-top: 0; padding: 6px 14px; font-size: 12px; border-radius: 6px; }
.quick-hint { font-size: 12px; color: #64748b; }
.toggle-row { display: flex; gap: 16px; align-items: center; margin-top: 4px; }
.toggle-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #555; cursor: pointer; }

/* 操作行 */
.action-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.test-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
.test-label { font-size: 13px; color: #666; white-space: nowrap; }
.test-input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
.test-input:focus { outline: none; border-color: #3b82f6; }
.btn-test { padding: 8px 18px; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; white-space: nowrap; transition: opacity 0.2s; }
.btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

/* OSAT 卡片 */
.osat-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; transition: box-shadow 0.2s; }
.osat-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.osat-card-header { margin-bottom: 0; }
.osat-title-line { display: flex; align-items: center; justify-content: flex-start; gap: 12px; margin-bottom: 8px; }
.osat-name-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.osat-name { font-size: 15px; font-weight: 600; color: #1a1a2e; }
.osat-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #666; line-height: 1.6; }
.osat-actions { display: flex; gap: 6px; flex-wrap: nowrap; }

/* 按钮变体 */
.btn-sm { padding: 4px 10px; font-size: 12px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; cursor: pointer; color: #555; white-space: nowrap; transition: all 0.2s; }
.btn-sm:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; }
.btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-sm.btn-warn  { border-color: #fca5a5; color: #dc2626; }
.btn-sm.btn-warn:hover  { background: #fef2f2; }
.btn-sm.btn-green { border-color: #6ee7b7; color: #059669; }
.btn-sm.btn-green:hover { background: #f0fdf4; }
.btn-sm.btn-purple { border-color: #c4b5fd; color: #7c3aed; }
.btn-sm.btn-purple:hover { background: #f5f3ff; }
.loading { color: #aaa; padding: 20px 0; font-size: 14px; }

/* 日志筛选 */
.log-filter-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.filter-select-sm { padding: 5px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: white; }
.stuck-badge { display: inline-flex; align-items: center; justify-content: center; background: #dc2626; color: white; border-radius: 10px; font-size: 11px; font-weight: 700; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 4px; }

/* 卡住文件面板 */
.stuck-panel { border: 1.5px solid #fca5a5; border-radius: 10px; background: #fff7f7; padding: 14px 16px; margin-bottom: 16px; }
.stuck-panel-header { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: #b91c1c; margin-bottom: 4px; }
.stuck-panel-actions { display: flex; gap: 8px; }

/* 日志表格 */
.log-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 4px; table-layout: fixed; }
.log-table th { padding: 9px 12px; background: #f8fafc; color: #555; text-align: left; border-bottom: 2px solid #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.log-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.log-table tr:hover td { background: #fafbff; }
.log-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #444; }
.log-error { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dc2626; font-size: 12px; }
.osat-tag { background: #f5f3ff; color: #7c3aed; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; }
.log-pagination { display: flex; align-items: center; gap: 12px; justify-content: center; margin-top: 12px; font-size: 13px; color: #666; }

/* 用户表 */
.user-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.user-table th { padding: 10px 12px; background: #f8fafc; color: #555; text-align: left; border-bottom: 2px solid #e2e8f0; }
.user-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.user-table tr:hover td { background: #f8fafc; }
.email-cell { color: #666; font-size: 12px; }
.action-cell { display: flex; gap: 6px; align-items: center; }
.role-select { padding: 3px 8px; font-size: 12px; border-radius: 6px; border: 1px solid #e2e8f0; background: white; cursor: pointer; color: #555; transition: all 0.2s; }
.role-select:focus { outline: none; border-color: #3b82f6; }
.role-select:disabled { opacity: 0.4; cursor: not-allowed; }

/* 弹窗 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: white; border-radius: 14px; padding: 28px 32px; min-width: 360px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
.modal-lg { min-width: 600px; }
.modal h3 { margin: 0 0 16px; font-size: 17px; color: #1a1a2e; }
.modal p  { margin: 0 0 16px; font-size: 14px; color: #666; }
.modal-input { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box; margin-bottom: 12px; }
.modal-input:focus { outline: none; border-color: #3b82f6; }
.modal-actions { display: flex; gap: 10px; }
.btn-cancel { padding: 9px 20px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; font-size: 14px; cursor: pointer; color: #555; }
.btn-cancel:hover { background: #f8fafc; }

/* 时区设置 */
.tz-info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #f0f7ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
}
.tz-info-text { font-size: 13px; color: #444; flex: 1; }
.tz-info-text strong { color: #1d4ed8; }
.tz-select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  background: white;
  color: #333;
  outline: none;
  cursor: pointer;
}
.tz-select:focus { border-color: #3b82f6; }
.tz-custom-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
}
.tz-custom-input:focus { border-color: #3b82f6; }
.tz-preview {
  margin-top: 10px;
  padding: 8px 14px;
  background: #fafafa;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #555;
}
.tz-preview strong { color: #0f766e; font-size: 14px; }
.tz-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
  padding: 6px 0;
  border-top: 1px solid #f3f4f6;
}
</style>
