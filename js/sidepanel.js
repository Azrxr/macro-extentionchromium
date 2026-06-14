// Magerin - Sidepanel UI Logic

document.addEventListener('DOMContentLoaded', () => {
  // Elements Selection
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  const activeTabTitle = document.getElementById('current-tab-title');
  const btnToggleFloating = document.getElementById('btn-toggle-floating');
  
  // Navigation Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // Tab Automation Controls
  const btnRecord = document.getElementById('btn-record');
  const btnStop = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');
  const btnPlay = document.getElementById('btn-play');
  
  const loopModeSelect = document.getElementById('loop-mode');
  const loopSettingsCsv = document.getElementById('loop-settings-csv');
  const loopSettingsStatic = document.getElementById('loop-settings-static');
  const csvStartRowInput = document.getElementById('csv-start-row');
  const csvEndRowInput = document.getElementById('csv-end-row');
  const staticLoopCountInput = document.getElementById('static-loop-count');
  const loopCsvSelect = document.getElementById('loop-csv-select');
  
  // Next Step button
  const btnNext = document.getElementById('btn-next');
  
  // Steps List
  const stepsCountBadge = document.getElementById('steps-count');
  const stepsListContainer = document.getElementById('steps-list');
  
  // Log Area
  const logContainer = document.getElementById('log-container');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  
  // Tab CSV Manager Controls
  const csvDropzone = document.getElementById('csv-dropzone');
  const csvFileInput = document.getElementById('csv-file-input');
  const selectedCsvCard = document.getElementById('selected-csv-card');
  const selectedCsvName = document.getElementById('selected-csv-name');
  const selectedCsvRows = document.getElementById('selected-csv-rows');
  const csvPreviewCols = document.getElementById('csv-preview-cols');
  const btnCloseCsv = document.getElementById('btn-close-csv');
  const csvSavedListContainer = document.getElementById('csv-saved-list');
  
  // Tab Scenarios Controls
  const scenarioNameInput = document.getElementById('scenario-name-input');
  const btnSaveScenario = document.getElementById('btn-save-scenario');
  const scenariosListContainer = document.getElementById('scenarios-list');
  
  // Error Modal
  const errorModal = document.getElementById('error-modal');
  const errorMessageText = document.getElementById('error-message-text');
  const errorAlwaysApply = document.getElementById('error-always-apply');
  const errorWaitCondition = document.getElementById('error-wait-condition');
  const errorWaitTimeout = document.getElementById('error-wait-timeout');
  const btnErrorWait = document.getElementById('btn-error-wait');
  const btnErrorResume = document.getElementById('btn-error-resume');
  const btnErrorStop = document.getElementById('btn-error-stop');

  // State local sinkron
  let currentState = getFallbackState();

  // Helper untuk mengirim pesan dengan penanganan error / context invalidated
  function sendExtensionMessage(message, callback) {
    try {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        showContextInvalidatedWarning();
        if (callback) callback(null);
        return;
      }
      
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message;
          console.warn('Extension connection error:', errMsg);
          if (errMsg.includes('context invalidated') || errMsg.includes('Extension context invalidated')) {
            showContextInvalidatedWarning();
          }
          if (callback) callback(null);
        } else {
          if (callback) callback(response);
        }
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      if (err.message.includes('context invalidated') || err.message.includes('Extension context invalidated')) {
        showContextInvalidatedWarning();
      }
      if (callback) callback(null);
    }
  }

  function showContextInvalidatedWarning() {
    const warnMsg = 'Koneksi ekstensi terputus karena pembaruan. Silakan tutup dan buka kembali panel samping Chrome (atau muat ulang halaman jika menggunakan Floating UI).';
    if (logContainer) {
      const logDiv = document.createElement('div');
      logDiv.className = 'log-item error';
      logDiv.textContent = `[PENTING] ${warnMsg}`;
      logContainer.appendChild(logDiv);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    console.error(warnMsg);
  }

  // Ambil state awal dari background
  sendExtensionMessage({ type: 'GET_STATE' }, (state) => {
    currentState = state || getFallbackState();
    updateUI(currentState);
    loadSavedCsvsList();
    loadSavedScenariosList();
  });
  
  updateActiveTabInfo();
  
  // Polling to keep active tab title fresh
  setInterval(updateActiveTabInfo, 3000);

  // Tab Switcher Logic
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));
      
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
      
      // Reload list if target is database lists
      if (btn.dataset.tab === 'tab-csv') {
        loadSavedCsvsList();
      } else if (btn.dataset.tab === 'tab-scenarios') {
        loadSavedScenariosList();
      }
    });
  });

  // Active Tab Info helper
  function updateActiveTabInfo() {
    sendExtensionMessage({ type: 'GET_ACTIVE_TAB_INFO' }, (res) => {
      if (res && res.title && activeTabTitle) {
        activeTabTitle.textContent = res.title;
        activeTabTitle.title = res.url;
      }
    });
  }

  // Listening for global state updates from background.js
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'STATE_CHANGED') {
        currentState = message.state || getFallbackState();
        updateUI(currentState);
        loadSavedCsvsList();
        loadSavedScenariosList();
      } else if (message.type === 'SHOW_ERROR_MODAL') {
        if (errorMessageText) errorMessageText.textContent = message.message;
        if (errorAlwaysApply) errorAlwaysApply.checked = false;
        if (errorWaitCondition) errorWaitCondition.value = suggestWaitConditionFromError(message.message);
        if (errorWaitTimeout) errorWaitTimeout.value = '30000';
        if (errorModal) errorModal.classList.remove('hidden');
      }
    });
  }

  // Fallback state helper
  function getFallbackState() {
    return {
      status: 'idle',
      scenario: [],
      csvData: null,
      loopMode: 'csv',
      csvStartRow: 1,
      csvEndRow: 1,
      staticLoopCount: 1,
      currentLoopIndex: 0,
      currentActionIndex: 0,
      isFloatingOpen: false,
      logs: []
    };
  }

  // UI Update main orchestrator
  function updateUI(state) {
    if (!state) state = getFallbackState();
    
    // 1. Status indicator
    if (statusDot) statusDot.className = 'status-dot ' + (state.status || 'idle');
    if (statusText) statusText.textContent = (state.status || 'idle').toUpperCase();
    
    // 2. Toggle button visibility based on status
    const status = state.status || 'idle';
    
    // Record / Stop toggle
    if (btnRecord) {
      if (status === 'recording') {
        btnRecord.classList.add('hidden');
      } else {
        btnRecord.classList.remove('hidden');
        btnRecord.disabled = (status !== 'idle');
      }
    }
    if (btnStop) {
      if (status === 'recording' || status === 'playing' || status === 'paused') {
        btnStop.classList.remove('hidden');
        btnStop.disabled = false;
      } else {
        btnStop.classList.add('hidden');
        btnStop.disabled = true;
      }
    }
    
    // Play / Pause toggle
    if (btnPlay) {
      if (status === 'playing') {
        btnPlay.classList.add('playing');
        btnPlay.disabled = false;
        btnPlay.title = 'Jeda';
      } else {
        btnPlay.classList.remove('playing');
        btnPlay.title = 'Jalankan';
        btnPlay.disabled = (status !== 'idle' && status !== 'paused') || (!state.scenario || state.scenario.length === 0);
      }
    }
    
    // Next button - only visible when paused
    if (btnNext) {
      if (status === 'paused') {
        btnNext.classList.remove('hidden');
        btnNext.disabled = false;
      } else {
        btnNext.classList.add('hidden');
        btnNext.disabled = true;
      }
    }
    
    // Clear button
    if (btnClear) {
      btnClear.disabled = (status !== 'idle');
    }
    
    // 3. Floating UI button highlight
    if (btnToggleFloating) {
      if (state.isFloatingOpen) {
        btnToggleFloating.classList.add('active');
      } else {
        btnToggleFloating.classList.remove('active');
      }
    }

    // 4. Render Scenario Steps
    renderStepsList(state.scenario || [], state.csvData, state.status, state.currentActionIndex);
    
    // 5. Render Active CSV Info
    if (state.csvData && selectedCsvCard) {
      selectedCsvCard.classList.remove('hidden');
      if (selectedCsvName) selectedCsvName.textContent = state.csvData.name || 'data.csv';
      
      const rowsCount = (state.csvData.rows) ? state.csvData.rows.length : 0;
      if (selectedCsvRows) selectedCsvRows.textContent = `${rowsCount} baris`;
      
      // Render columns preview
      if (csvPreviewCols) {
        csvPreviewCols.innerHTML = '';
        const headers = state.csvData.headers || [];
        headers.forEach(h => {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = h;
          csvPreviewCols.appendChild(tag);
        });
      }
      
      // Update max row values in loops
      if (csvEndRowInput) {
        csvEndRowInput.max = rowsCount;
        if (parseInt(csvEndRowInput.value) > rowsCount || csvEndRowInput.value === '10') {
          csvEndRowInput.value = rowsCount;
        }
      }
    } else {
      if (selectedCsvCard) selectedCsvCard.classList.add('hidden');
    }
    
    // 6. Update loop modes UI
    if (loopModeSelect) {
      loopModeSelect.value = state.loopMode || 'static';
      toggleLoopInputs(state.loopMode || 'static');
    }
    
    // 7. Render Logs
    if (logContainer) {
      renderLogs(state.logs || []);
    }
  }

  // Loop mode input toggler
  function toggleLoopInputs(mode) {
    if (mode === 'csv') {
      if (loopSettingsCsv) loopSettingsCsv.classList.remove('hidden');
      if (loopSettingsStatic) loopSettingsStatic.classList.add('hidden');
      populateLoopCsvDropdown();
    } else {
      if (loopSettingsCsv) loopSettingsCsv.classList.add('hidden');
      if (loopSettingsStatic) loopSettingsStatic.classList.remove('hidden');
    }
  }

  if (loopModeSelect) {
    loopModeSelect.addEventListener('change', (e) => {
      toggleLoopInputs(e.target.value);
    });
  }

  // Render logs list helper
  function renderLogs(logs) {
    if (!logContainer) return;
    logContainer.innerHTML = '';
    
    if (logs.length === 0) {
      logContainer.innerHTML = '<div class="log-item info">Belum ada aktivitas terekam.</div>';
      return;
    }
    
    logs.forEach(log => {
      const logDiv = document.createElement('div');
      logDiv.className = `log-item ${log.type || 'info'}`;
      logDiv.textContent = `[${log.timestamp || ''}] ${log.message || ''}`;
      logContainer.appendChild(logDiv);
    });
    
    // Auto scroll ke bawah
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  // Clear logs click handler
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      sendExtensionMessage({ type: 'CLEAR_LOGS' });
    });
  }

  // RECORDER BUTTONS (toggle Record/Stop)
  if (btnRecord) {
    btnRecord.addEventListener('click', () => {
      sendExtensionMessage({ type: 'START_RECORDING' }, (res) => {
        console.log('Recording started', res);
      });
    });
  }

  if (btnStop) {
    btnStop.addEventListener('click', () => {
      if (statusText && statusText.textContent === 'RECORDING') {
        sendExtensionMessage({ type: 'STOP_RECORDING' }, (res) => {
          console.log('Recording stopped', res);
        });
      } else {
        sendExtensionMessage({ type: 'STOP_AUTOMATION' }, (res) => {
          console.log('Automation stopped', res);
        });
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (confirm('Apakah Anda yakin ingin menghapus semua aksi skenario saat ini?')) {
        sendExtensionMessage({ type: 'CLEAR_ACTIONS' });
      }
    });
  }

  // Play / Pause toggle
  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      if (btnPlay.classList.contains('playing')) {
        // Currently playing -> pause
        sendExtensionMessage({ type: 'PAUSE_AUTOMATION' }, (res) => {
          console.log('Automation paused', res);
        });
      } else {
        // Currently idle -> start
        const config = {
          loopMode: loopModeSelect ? loopModeSelect.value : 'static',
          csvStartRow: csvStartRowInput ? (parseInt(csvStartRowInput.value) || 1) : 1,
          csvEndRow: csvEndRowInput ? (parseInt(csvEndRowInput.value) || 1) : 1,
          staticLoopCount: staticLoopCountInput ? (parseInt(staticLoopCountInput.value) || 1) : 1,
          csvName: loopCsvSelect ? loopCsvSelect.value : ''
        };
        sendExtensionMessage({ type: 'START_AUTOMATION', config }, (res) => {
          console.log('Automation initiated', res);
        });
      }
    });
  }

  // Next step button (execute one step while paused)
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      sendExtensionMessage({ type: 'EXECUTE_NEXT_STEP' }, (res) => {
        console.log('Next step executed', res);
      });
    });
  }

  // Floating Mode Toggle click handler
  if (btnToggleFloating) {
    btnToggleFloating.addEventListener('click', () => {
      sendExtensionMessage({ type: 'TOGGLE_FLOATING' }, (res) => {
        if (res && res.status === 'error') {
          alert(res.message);
        }
      });
    });
  }

  // Error modal handlers
  if (btnErrorResume) {
    btnErrorResume.addEventListener('click', () => {
      sendExtensionMessage({
        type: 'ERROR_MODAL_RESPONSE',
        choice: 'resume',
        always: errorAlwaysApply ? errorAlwaysApply.checked : false
      });
      if (errorModal) errorModal.classList.add('hidden');
    });
  }

  if (btnErrorWait) {
    btnErrorWait.addEventListener('click', () => {
      const condition = errorWaitCondition ? errorWaitCondition.value.trim() : '';
      if (!condition) {
        alert('Masukkan kondisi tunggu, contoh: exists .ytp-ad-skip-button');
        return;
      }
      sendExtensionMessage({
        type: 'ERROR_MODAL_RESPONSE',
        choice: 'wait_until',
        always: false,
        options: {
          condition,
          timeoutMs: errorWaitTimeout ? (parseInt(errorWaitTimeout.value, 10) || 30000) : 30000
        }
      });
      if (errorModal) errorModal.classList.add('hidden');
    });
  }

  if (btnErrorStop) {
    btnErrorStop.addEventListener('click', () => {
      sendExtensionMessage({
        type: 'ERROR_MODAL_RESPONSE',
        choice: 'stop',
        always: errorAlwaysApply ? errorAlwaysApply.checked : false
      });
      if (errorModal) errorModal.classList.add('hidden');
    });
  }

  function suggestWaitConditionFromError(message) {
    const quoted = String(message || '').match(/"([^"]+)"/);
    if (quoted && quoted[1]) return `exists ${quoted[1]}`;
    return 'exists ';
  }

  // Render list of Scenario Actions Steps
  function renderStepsList(scenario, csvData, status, activeIndex) {
    if (stepsCountBadge) stepsCountBadge.textContent = `${scenario.length} Langkah`;
    if (!stepsListContainer) return;
  
    // Dynamic card height: ~54px per step, max 7 visible
    const stepsCard = document.querySelector('.steps-card');
    if (stepsCard) {
      const maxVisible = Math.min(scenario.length, 7);
      const maxH = scenario.length === 0 ? 120 : Math.max(80, maxVisible * 54 + 50);
      stepsListContainer.style.maxHeight = maxH + 'px';
    }
  
    if (scenario.length === 0) {
      stepsListContainer.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 15V17M12 7V13M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>Belum ada aksi yang direkam. Klik tombol <strong>Rekam</strong> untuk memulai otomatisasi.</p>
        </div>
      `;
      return;
    }
  
    stepsListContainer.innerHTML = '';
    let activeStepEl = null;
  
    scenario.forEach((step, idx) => {
      if (!step) return;
      const isCurrentExecuting = (status === 'playing' || status === 'paused') && activeIndex === idx;
      const isIdle = status === 'idle';
  
      // -- Insert line BEFORE this step --
      const insertLine = document.createElement('div');
      insertLine.className = 'step-insert-line';
      insertLine.title = 'Klik untuk menyisipkan aksi';
      insertLine.dataset.insertIndex = idx;
      insertLine.addEventListener('click', () => toggleInsertToolbar(insertLine, idx));
      stepsListContainer.appendChild(insertLine);
  
      // -- Step item (row layout: content-area + reorder-section) --
      const stepItem = document.createElement('div');
      stepItem.className = `step-item ${isCurrentExecuting ? 'active' : ''}`;
      if (isCurrentExecuting) activeStepEl = stepItem;
  
      // Content area (left side)
      const contentArea = document.createElement('div');
      contentArea.className = 'step-content-area';
  
      // Top Row
      const topRow = document.createElement('div');
      topRow.className = 'step-row-top';
  
      const stepInfo = document.createElement('div');
      stepInfo.className = 'step-info';
  
      const stepNum = document.createElement('span');
      stepNum.className = 'step-num';
      stepNum.textContent = idx + 1;
  
      const typeBadge = document.createElement('span');
      typeBadge.className = `step-type-badge ${step.type}`;
      // Custom label for special types
      if (step.type === 'tab_switch') typeBadge.textContent = 'Tab';
      else if (step.type === 'keypress') typeBadge.textContent = `Key: ${step.value || 'Enter'}`;
      else typeBadge.textContent = step.type;
  
      const selectorSpan = document.createElement('span');
      selectorSpan.className = 'step-selector';
      if (step.type === 'tab_switch') {
        try { selectorSpan.textContent = new URL(step.url || step.value || '').hostname; } catch(e) { selectorSpan.textContent = step.url || step.value || ''; }
        selectorSpan.title = step.url || step.value || '';
      } else if (step.type === 'navigate') {
        try { selectorSpan.textContent = new URL(step.value || step.url || '').hostname; } catch(e) { selectorSpan.textContent = step.value || step.url || ''; }
        selectorSpan.title = step.value || step.url || '';
      } else if (step.type === 'wait_until') {
        selectorSpan.textContent = step.condition || step.value || '';
        selectorSpan.title = step.condition || step.value || '';
      } else {
        selectorSpan.textContent = step.selector || '';
        selectorSpan.title = step.selector || '';
      }
  
      stepInfo.appendChild(stepNum);
      stepInfo.appendChild(typeBadge);
      stepInfo.appendChild(selectorSpan);

      // URL badge for click/input actions
      if (step.url && (step.type === 'click' || step.type === 'click_optional' || step.type === 'input')) {
        const urlBadge = document.createElement('span');
        urlBadge.className = 'step-url-badge';
        try { urlBadge.textContent = new URL(step.url).hostname; } catch(e) { urlBadge.textContent = step.url; }
        urlBadge.title = step.url;
        stepInfo.appendChild(urlBadge);
      }
  
      // Actions: play + delete
      const stepActions = document.createElement('div');
      stepActions.className = 'step-actions';

      // Play per step button
      const btnPlayStep = document.createElement('button');
      btnPlayStep.className = 'btn-step-action btn-play-step';
      btnPlayStep.title = 'Uji coba aksi ini';
      btnPlayStep.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
      btnPlayStep.addEventListener('click', (e) => {
        e.stopPropagation();
        // Visual feedback
        btnPlayStep.classList.add('playing');
        stepItem.classList.add('playing-single');
        sendExtensionMessage({ type: 'PLAY_SINGLE_ACTION', action: step }, (res) => {
          btnPlayStep.classList.remove('playing');
          stepItem.classList.remove('playing-single');
          if (res && res.status === 'success') {
            // Brief success flash
            stepItem.classList.add('success-flash');
            setTimeout(() => stepItem.classList.remove('success-flash'), 800);
          } else if (res && res.status === 'error') {
            stepItem.classList.add('error-flash');
            setTimeout(() => stepItem.classList.remove('error-flash'), 800);
          }
        });
      });
  
      // Delete step button
      const btnDeleteStep = document.createElement('button');
      btnDeleteStep.className = 'btn-step-action btn-delete-step';
      btnDeleteStep.title = 'Hapus aksi ini';
      btnDeleteStep.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;
      btnDeleteStep.disabled = !isIdle;
      btnDeleteStep.addEventListener('click', (e) => {
        e.stopPropagation();
        sendExtensionMessage({ type: 'DELETE_ACTION', index: idx });
      });
  
      stepActions.appendChild(btnPlayStep);
      stepActions.appendChild(btnDeleteStep);
  
      topRow.appendChild(stepInfo);
      topRow.appendChild(stepActions);
      contentArea.appendChild(topRow);
  
      // Bottom Row (edit parameters and mappings) - collapsed by default
      const bottomRow = document.createElement('div');
      bottomRow.className = 'step-row-bottom collapsed';

      let hasBottomContent = false;
  
      if (step.type === 'click' || step.type === 'click_optional' || step.type === 'input') {
        hasBottomContent = true;
        const selectorInput = document.createElement('input');
        selectorInput.type = 'text';
        selectorInput.className = 'step-param-input';
        selectorInput.value = step.selector || '';
        selectorInput.placeholder = 'CSS Selector target';
        selectorInput.disabled = !isIdle;
        selectorInput.addEventListener('change', (e) => {
          sendExtensionMessage({ type: 'UPDATE_ACTION', index: idx, updatedAction: { selector: e.target.value } });
        });
        bottomRow.appendChild(selectorInput);
      }
  
      if (step.type === 'input' || step.type === 'navigate' || step.type === 'scroll' || step.type === 'wait' || step.type === 'wait_until' || step.type === 'click_optional' || step.type === 'tab_switch' || step.type === 'keypress') {
        hasBottomContent = true;
        const paramInput = document.createElement('input');
        paramInput.type = 'text';
        paramInput.className = 'step-param-input';
        paramInput.value = step.type === 'tab_switch' ? (step.url || step.value || '') : (step.type === 'wait_until' ? (step.condition || step.value || '') : (step.type === 'click_optional' ? (step.timeoutMs || 5000) : (step.value || '')));
        paramInput.placeholder = step.type === 'input' ? 'Teks pengisian...' : (step.type === 'navigate' ? 'URL...' : (step.type === 'tab_switch' ? 'URL tab...' : (step.type === 'keypress' ? 'Key (Enter)...' : (step.type === 'wait_until' ? 'exists .selector / text .status contains "OK"' : (step.type === 'click_optional' ? 'Timeout opsional ms' : 'Nilai...')))));
        paramInput.disabled = !isIdle;
        paramInput.addEventListener('change', (e) => {
          const field = step.type === 'tab_switch' ? 'url' : (step.type === 'wait_until' ? 'condition' : (step.type === 'click_optional' ? 'timeoutMs' : 'value'));
          const updatedAction = { [field]: step.type === 'click_optional' ? (parseInt(e.target.value, 10) || 5000) : e.target.value };
          if (step.type === 'wait_until') updatedAction.value = e.target.value;
          sendExtensionMessage({ type: 'UPDATE_ACTION', index: idx, updatedAction });
        });
        bottomRow.appendChild(paramInput);
      }

      if (step.type === 'wait_until') {
        hasBottomContent = true;
        const timeoutInput = document.createElement('input');
        timeoutInput.type = 'number';
        timeoutInput.className = 'step-param-input';
        timeoutInput.value = step.timeoutMs || 30000;
        timeoutInput.placeholder = 'Timeout ms';
        timeoutInput.disabled = !isIdle;
        timeoutInput.addEventListener('change', (e) => {
          sendExtensionMessage({ type: 'UPDATE_ACTION', index: idx, updatedAction: { timeoutMs: parseInt(e.target.value, 10) || 30000 } });
        });
        bottomRow.appendChild(timeoutInput);
      }
  
      if ((step.type === 'input' || step.type === 'navigate') && csvData && csvData.headers && csvData.headers.length > 0) {
        hasBottomContent = true;
        const mappingRow = document.createElement('div');
        mappingRow.className = 'step-csv-mapping';
        const labelMapping = document.createElement('span');
        labelMapping.textContent = 'Petakan CSV:';
        const selectMapping = document.createElement('select');
        selectMapping.className = 'step-csv-select';
        selectMapping.disabled = !isIdle;
        const optDefault = document.createElement('option');
        optDefault.value = '';
        optDefault.textContent = '-- Gunakan Nilai Statis --';
        selectMapping.appendChild(optDefault);
        csvData.headers.forEach(header => {
          const opt = document.createElement('option');
          opt.value = header;
          opt.textContent = header;
          if (step.csvColumn === header) opt.selected = true;
          selectMapping.appendChild(opt);
        });
        selectMapping.addEventListener('change', (e) => {
          sendExtensionMessage({ type: 'UPDATE_ACTION', index: idx, updatedAction: { csvColumn: e.target.value } });
        });
        mappingRow.appendChild(labelMapping);
        mappingRow.appendChild(selectMapping);
        bottomRow.appendChild(mappingRow);
      }

      if (hasBottomContent) {
        contentArea.appendChild(bottomRow);
        // Click topRow to expand/collapse
        topRow.style.cursor = 'pointer';
        topRow.addEventListener('click', (e) => {
          // Don't expand when clicking buttons
          if (e.target.closest('.btn-step-action') || e.target.closest('.btn-step-reorder')) return;
          stepsListContainer.querySelectorAll('.step-item.expanded').forEach(item => {
            if (item !== stepItem) {
              item.classList.remove('expanded');
              const row = item.querySelector('.step-row-bottom');
              if (row) row.classList.add('collapsed');
            }
          });
          const isExpanded = stepItem.classList.toggle('expanded');
          bottomRow.classList.toggle('collapsed', !isExpanded);
        });
      }
      stepItem.appendChild(contentArea);

      // Reorder section (far right of card)
      const reorderSection = document.createElement('div');
      reorderSection.className = 'step-reorder-section';

      const btnUp = document.createElement('button');
      btnUp.className = 'btn-step-reorder';
      btnUp.innerHTML = '&#9650;';
      btnUp.title = 'Pindah ke atas';
      btnUp.disabled = !isIdle || idx === 0;
      btnUp.addEventListener('click', () => {
        sendExtensionMessage({ type: 'MOVE_ACTION', fromIndex: idx, toIndex: idx - 1 });
      });

      const btnDown = document.createElement('button');
      btnDown.className = 'btn-step-reorder';
      btnDown.innerHTML = '&#9660;';
      btnDown.title = 'Pindah ke bawah';
      btnDown.disabled = !isIdle || idx === scenario.length - 1;
      btnDown.addEventListener('click', () => {
        sendExtensionMessage({ type: 'MOVE_ACTION', fromIndex: idx, toIndex: idx + 1 });
      });

      reorderSection.appendChild(btnUp);
      reorderSection.appendChild(btnDown);
      stepItem.appendChild(reorderSection);

      stepsListContainer.appendChild(stepItem);
    });
  
    // Final insert line at the bottom
    const insertLineEnd = document.createElement('div');
    insertLineEnd.className = 'step-insert-line';
    insertLineEnd.title = 'Klik untuk menyisipkan aksi';
    insertLineEnd.dataset.insertIndex = scenario.length;
    insertLineEnd.addEventListener('click', () => toggleInsertToolbar(insertLineEnd, scenario.length));
    stepsListContainer.appendChild(insertLineEnd);
  
    // Auto-scroll to active step during playback
    if (activeStepEl && (status === 'playing' || status === 'paused')) {
      setTimeout(() => {
        activeStepEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }
  
  // Insert toolbar toggle helper - 2 row layout
  let currentOpenToolbar = null;
  function toggleInsertToolbar(lineEl, insertIndex) {
    if (currentOpenToolbar) {
      currentOpenToolbar.remove();
      currentOpenToolbar = null;
    }
  
    const toolbar = document.createElement('div');
    toolbar.className = 'step-insert-toolbar visible';
  
    // Row 1: label + record button
    const label = document.createElement('span');
    label.className = 'toolbar-label';
    label.textContent = 'Sisipkan:';
  
    const btnRec = document.createElement('button');
    btnRec.className = 'btn-toolbar-action record-action';
    btnRec.innerHTML = '&#9679; Rekam';
    btnRec.title = 'Lanjutkan rekam dari sini';
    btnRec.addEventListener('click', () => {
      sendExtensionMessage({ type: 'START_RECORDING_AT_INDEX', index: insertIndex });
      toolbar.remove();
      currentOpenToolbar = null;
    });
  
    // Row 1 line break
    const rowBreak = document.createElement('div');
    rowBreak.style.cssText = 'width:100%;flex-basis:100%;';
  
    // Row 2: manual action dropdown + value input + add button
    const selectAction = document.createElement('select');
    selectAction.className = 'toolbar-action-select';
    const options = [
      { value: '', text: '+ Aksi Manual' },
      { value: 'navigate', text: 'Navigasi URL' },
      { value: 'click_optional', text: 'Klik Jika Ada' },
      { value: 'scroll', text: 'Scroll' },
      { value: 'wait_until', text: 'Tunggu Kondisi' },
      { value: 'wait', text: 'Delay (ms)' },
      { value: 'tab_switch', text: 'Pindah Tab' }
    ];
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.text;
      selectAction.appendChild(opt);
    });
  
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'step-param-input';
    valInput.style.width = '120px';
    valInput.placeholder = 'Nilai...';
    valInput.style.display = 'none';
  
    selectAction.addEventListener('change', () => {
      const v = selectAction.value;
      if (v === 'navigate') { valInput.placeholder = 'https://...'; valInput.value = ''; valInput.style.display = ''; }
      else if (v === 'click_optional') { valInput.placeholder = 'CSS selector target'; valInput.value = ''; valInput.style.display = ''; }
      else if (v === 'scroll') { valInput.placeholder = '500'; valInput.value = '500'; valInput.style.display = ''; }
      else if (v === 'wait') { valInput.placeholder = '1000'; valInput.value = '1000'; valInput.style.display = ''; }
      else if (v === 'wait_until') { valInput.placeholder = 'exists .selector'; valInput.value = 'exists '; valInput.style.display = ''; }
      else if (v === 'tab_switch') { valInput.placeholder = 'URL tab tujuan...'; valInput.value = ''; valInput.style.display = ''; }
      else { valInput.style.display = 'none'; }
    });
  
    const btnAdd = document.createElement('button');
    btnAdd.className = 'btn-toolbar-add';
    btnAdd.textContent = 'Tambah';
    btnAdd.addEventListener('click', () => {
      const type = selectAction.value;
      if (!type) return;
      const val = valInput.value.trim();
      if (type === 'navigate' && !val) { alert('Masukkan URL.'); return; }
      if (type === 'click_optional' && !val) { alert('Masukkan selector target.'); return; }
      if (type === 'tab_switch' && !val) { alert('Masukkan URL tab tujuan.'); return; }
      if (type === 'wait_until' && !val) { alert('Masukkan kondisi tunggu.'); return; }
      const action = {
        id: Date.now(),
        type: type,
        selector: type === 'navigate' ? 'URL' : (type === 'click_optional' ? val : (type === 'scroll' ? 'Window' : (type === 'tab_switch' ? 'Tab' : (type === 'wait_until' ? 'Condition' : 'Delay')))),
        value: type === 'click_optional' ? '' : val,
        condition: type === 'wait_until' ? val : '',
        timeoutMs: type === 'wait_until' ? 30000 : (type === 'click_optional' ? 5000 : undefined),
        url: type === 'tab_switch' ? val : ''
      };
      sendExtensionMessage({ type: 'INSERT_ACTION', index: insertIndex, action });
      toolbar.remove();
      currentOpenToolbar = null;
    });
  
    toolbar.appendChild(label);
    toolbar.appendChild(btnRec);
    toolbar.appendChild(rowBreak);
    toolbar.appendChild(selectAction);
    toolbar.appendChild(valInput);
    toolbar.appendChild(btnAdd);
  
    lineEl.parentNode.insertBefore(toolbar, lineEl.nextSibling);
    currentOpenToolbar = toolbar;
  }

  // Populate CSV dropdown in loop mode card
  function populateLoopCsvDropdown() {
    if (!loopCsvSelect) return;
    const currentVal = loopCsvSelect.value;
    loopCsvSelect.innerHTML = '<option value="">-- Pilih CSV --</option>';
    chrome.storage.local.get(['csvs'], (res) => {
      if (chrome.runtime.lastError) return;
      const csvs = res.csvs || {};
      Object.keys(csvs).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === currentVal) opt.selected = true;
        loopCsvSelect.appendChild(opt);
      });
    });
  }

  // When CSV is selected from loop dropdown, load it
  if (loopCsvSelect) {
    loopCsvSelect.addEventListener('change', () => {
      const name = loopCsvSelect.value;
      if (!name) return;
      sendExtensionMessage({ type: 'LOAD_CSV', name: name }, (res) => {
        if (res && res.status === 'success') {
          const csv = res.csv;
          if (csv && csv.rows) {
            if (csvEndRowInput) {
              csvEndRowInput.max = csv.rows.length;
              csvEndRowInput.value = csv.rows.length;
            }
          }
        }
      });
    });
  }

  // ==========================================
  // LOGIKA TAB CSV MANAGER
  // ==========================================

  // Dropzone drag-and-drop actions
  if (csvDropzone) {
    csvDropzone.addEventListener('click', () => {
      if (csvFileInput) csvFileInput.click();
    });

    csvDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      csvDropzone.classList.add('dragover');
    });

    csvDropzone.addEventListener('dragleave', () => {
      csvDropzone.classList.remove('dragover');
    });

    csvDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      csvDropzone.classList.remove('dragover');
      
      if (e.dataTransfer.files.length > 0) {
        handleCSVFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (csvFileInput) {
    csvFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleCSVFile(e.target.files[0]);
      }
    });
  }

  function handleCSVFile(file) {
    if (!file.name.endsWith('.csv')) {
      alert('Format file tidak didukung. Harap unggah file .csv.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseCSV(text);
      
      if (parsed.headers.length === 0) {
        alert('File CSV kosong atau tidak memiliki tajuk (header) kolom.');
        return;
      }
      
      sendExtensionMessage({
        type: 'SAVE_CSV',
        name: file.name,
        headers: parsed.headers,
        rows: parsed.rows
      }, (res) => {
        if (res && res.status === 'success') {
          loadSavedCsvsList();
        } else {
          alert('Gagal menyimpan CSV.');
        }
      });
    };
    reader.readAsText(file);
  }

  // CSV Text parsing helper
  function parseCSV(text) {
    let lines = [];
    let row = [""];
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      let c = text[i];
      let next = text[i+1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push("");
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += c;
      }
    }
    
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }
    
    if (lines.length === 0) return { headers: [], rows: [] };
    let headers = lines[0].map(h => h.trim());
    let rows = [];
    
    for (let i = 1; i < lines.length; i++) {
      let line = lines[i];
      if (line.length === 1 && line[0] === "") continue; // skip baris kosong
      let rowObj = {};
      for (let j = 0; j < headers.length; j++) {
        rowObj[headers[j]] = line[j] !== undefined ? line[j] : "";
      }
      rows.push(rowObj);
    }
    return { headers, rows };
  }

  // Close/Detach CSV file
  if (btnCloseCsv) {
    btnCloseCsv.addEventListener('click', () => {
      sendExtensionMessage({ type: 'CLOSE_ACTIVE_CSV' });
    });
  }

  // Load list of saved CSV files
  function loadSavedCsvsList() {
    if (!csvSavedListContainer) return;
    chrome.storage.local.get(['csvs'], (res) => {
      if (chrome.runtime.lastError) return;
      const csvs = res.csvs || {};
      const fileNames = Object.keys(csvs);
      
      const activeName = currentState.csvData ? currentState.csvData.name : null;
      
      if (fileNames.length === 0) {
        csvSavedListContainer.innerHTML = '<p class="muted-text text-center">Tidak ada file CSV tersimpan.</p>';
        return;
      }
      
      csvSavedListContainer.innerHTML = '';
      
      fileNames.forEach(name => {
        const item = csvs[name];
        if (!item) return;
        
        const isSelected = activeName === name;
        
        const listItem = document.createElement('div');
        listItem.className = `list-item ${isSelected ? 'selected' : ''}`;
        
        const itemInfo = document.createElement('div');
        itemInfo.className = 'item-info';
        itemInfo.addEventListener('click', () => {
          // Select CSV file
          sendExtensionMessage({ type: 'LOAD_CSV', name: name }, (res) => {
            if (res && res.status === 'success') {
              console.log('CSV Loaded:', name);
            }
          });
        });
        
        const itemName = document.createElement('span');
        itemName.className = 'item-name';
        itemName.textContent = name;
        
        const rowsCount = item.rows ? item.rows.length : 0;
        const timestampStr = item.timestamp ? new Date(item.timestamp).toLocaleString('id-ID') : 'Tidak diketahui';
        
        const itemMeta = document.createElement('span');
        itemMeta.className = 'item-meta';
        itemMeta.textContent = `${rowsCount} baris | ${timestampStr}`;
        
        itemInfo.appendChild(itemName);
        itemInfo.appendChild(itemMeta);
        
        const itemActions = document.createElement('div');
        itemActions.className = 'item-actions';
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-item-action delete';
        btnDelete.title = 'Hapus CSV dari Database';
        btnDelete.innerHTML = '✕';
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Apakah Anda yakin ingin menghapus file CSV "${name}"?`)) {
            sendExtensionMessage({ type: 'DELETE_CSV', name: name });
          }
        });
        
        itemActions.appendChild(btnDelete);
        listItem.appendChild(itemInfo);
        listItem.appendChild(itemActions);
        
        csvSavedListContainer.appendChild(listItem);
      });
    });
  }

  // ==========================================
  // LOGIKA TAB SCENARIOS
  // ==========================================

  // Save current active actions list as a scenario
  if (btnSaveScenario) {
    btnSaveScenario.addEventListener('click', () => {
      const name = scenarioNameInput ? scenarioNameInput.value.trim() : '';
      if (name === '') {
        alert('Masukkan nama skenario terlebih dahulu.');
        return;
      }
      
      sendExtensionMessage({ type: 'SAVE_SCENARIO_TO_DB', name: name }, (res) => {
        if (res && res.status === 'success') {
          if (scenarioNameInput) scenarioNameInput.value = '';
          loadSavedScenariosList();
          alert('Skenario berhasil disimpan.');
        } else {
          alert(`Gagal menyimpan skenario: ${res ? res.message : 'Kesalahan tidak diketahui'}`);
        }
      });
    });
  }

  // Load list of saved scenarios
  function loadSavedScenariosList() {
    if (!scenariosListContainer) return;
    chrome.storage.local.get(['scenarios'], (res) => {
      if (chrome.runtime.lastError) return;
      const scenarios = res.scenarios || {};
      const scenarioNames = Object.keys(scenarios);
      
      if (scenarioNames.length === 0) {
        scenariosListContainer.innerHTML = '<p class="muted-text text-center">Tidak ada skenario tersimpan.</p>';
        return;
      }
      
      scenariosListContainer.innerHTML = '';
      
      scenarioNames.forEach(name => {
        const item = scenarios[name];
        if (!item) return;
        
        const listItem = document.createElement('div');
        listItem.className = 'list-item';
        
        const itemInfo = document.createElement('div');
        itemInfo.className = 'item-info';
        itemInfo.addEventListener('click', () => {
          // Load scenario
          if (confirm(`Apakah Anda ingin memuat skenario "${name}"? Ini akan menimpa aksi yang terekam saat ini.`)) {
            sendExtensionMessage({ type: 'LOAD_SCENARIO_FROM_DB', name: name }, (res) => {
              if (res && res.status === 'success') {
                // Switch back to Automation tab
                if (tabButtons[0]) tabButtons[0].click();
              }
            });
          }
        });
        
        const itemName = document.createElement('span');
        itemName.className = 'item-name';
        itemName.textContent = name;
        
        const stepsCount = item.scenario ? item.scenario.length : 0;
        const timestampStr = item.timestamp ? new Date(item.timestamp).toLocaleString('id-ID') : 'Tidak diketahui';
        
        const itemMeta = document.createElement('span');
        itemMeta.className = 'item-meta';
        itemMeta.textContent = `${stepsCount} langkah | ${timestampStr}`;
        
        itemInfo.appendChild(itemName);
        itemInfo.appendChild(itemMeta);
        
        const itemActions = document.createElement('div');
        itemActions.className = 'item-actions';
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-item-action delete';
        btnDelete.title = 'Hapus skenario dari Database';
        btnDelete.innerHTML = '✕';
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Apakah Anda yakin ingin menghapus skenario "${name}"?`)) {
            sendExtensionMessage({ type: 'DELETE_SCENARIO_FROM_DB', name: name }, (res) => {
              if (res && res.status === 'success') {
                loadSavedScenariosList();
              }
            });
          }
        });
        
        itemActions.appendChild(btnDelete);
        listItem.appendChild(itemInfo);
        listItem.appendChild(itemActions);
        
        scenariosListContainer.appendChild(listItem);
      });
    });
  }
});
