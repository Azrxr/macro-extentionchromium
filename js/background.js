// Magerin - Background Service Worker

// Buka panel sisi secara manual ketika ikon tindakan ekstensi diklik
// Cara ini jauh lebih kompatibel di semua browser Chromium dibanding setPanelBehavior
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
        console.warn('Gagal membuka panel sisi via klik ikon:', err);
      });
    }
  });
}

// State Global
let state = {
  status: 'idle', // 'idle', 'recording', 'playing', 'paused'
  scenario: [], // [{ id, type, selector, value, csvColumn }]
  csvData: null, // { name: '...', headers: [], rows: [] }
  loopMode: 'csv', // 'csv' or 'static'
  csvStartRow: 1,
  csvEndRow: 1,
  staticLoopCount: 1,
  
  // Penunjuk eksekusi berjalan
  currentLoopIndex: 0, // Indeks baris CSV / putaran aktif (0-based)
  currentActionIndex: 0, // Indeks aksi aktif (0-based)
  activeTabId: null,
  lastErrorContext: null,
  
  // Pilihan penanganan error
  errorChoice: null, // null, or { action: 'resume'|'stop', always: boolean }
  
  // Indeks penyisipan saat rekam dari posisi tertentu
  recordInsertIndex: null,
  
  // State untuk Floating UI
  isFloatingOpen: false,
  
  // Log Aktivitas
  logs: [
    { timestamp: new Date().toLocaleTimeString('id-ID'), message: 'Magerin siap digunakan.', type: 'info' }
  ]
};

// Menginisialisasi penyimpanan lokal ekstensi saat pertama kali dipasang
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['scenarios', 'csvs'], (res) => {
    if (!res.scenarios) {
      chrome.storage.local.set({ scenarios: {} });
    }
    if (!res.csvs) {
      chrome.storage.local.set({ csvs: {} });
    }
  });
  addLog('Ekstensi berhasil dipasang.', 'success');
});

// Deteksi perpindahan tab saat recording aktif
let lastRecordedTabId = null;
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (state.status !== 'recording') return;
  
  // Abaikan jika ini tab yang sama (bukan perpindahan)
  if (lastRecordedTabId === activeInfo.tabId) return;
  
  // Jangan rekam perpindahan pertama saat baru mulai rekam
  if (lastRecordedTabId === null) {
    lastRecordedTabId = activeInfo.tabId;
    return;
  }
  
  lastRecordedTabId = activeInfo.tabId;
  
  // Dapatkan URL tab baru
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    const tabUrl = tab.url || '';
    if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://')) return;
    
    recordAction({
      id: Date.now(),
      type: 'tab_switch',
      selector: 'Tab',
      value: tabUrl,
      url: tabUrl
    });
  });
});

// Helper untuk menambahkan log aktivitas
function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const logObj = { timestamp, message, type };
  state.logs = state.logs || [];
  state.logs.push(logObj);
  // Batasi log maksimal 50 baris terakhir
  if (state.logs.length > 50) {
    state.logs.shift();
  }
  broadcastState();
}

// Listener untuk koneksi Sidepanel & Floating UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received Message:', message);
  
  switch (message.type) {
    case 'GET_STATE':
      sendResponse(state);
      break;
      
    case 'START_RECORDING':
      startRecording(sendResponse);
      return true; // Asinkron
      
    case 'STOP_RECORDING':
      stopRecording(sendResponse);
      return true;
      
    case 'RECORD_ACTION':
      recordAction(message.action);
      sendResponse({ status: 'success' });
      break;
      
    case 'CLEAR_ACTIONS':
      state.scenario = [];
      addLog('Daftar langkah aksi dibersihkan.', 'info');
      broadcastState();
      sendResponse({ status: 'success' });
      break;
      
    case 'UPDATE_ACTION':
      updateAction(message.index, message.updatedAction);
      sendResponse({ status: 'success' });
      break;
      
    case 'DELETE_ACTION':
      deleteAction(message.index);
      sendResponse({ status: 'success' });
      break;
      
    case 'PLAY_SINGLE_ACTION':
      playSingleAction(message.action, sendResponse);
      return true; // Asinkron
      
    case 'START_AUTOMATION':
      startAutomation(message.config, sendResponse);
      return true; // Asinkron
      
    case 'STOP_AUTOMATION':
      stopAutomation();
      sendResponse({ status: 'success' });
      break;
      
    case 'ERROR_MODAL_RESPONSE':
      handleErrorResponse(message.choice, message.always, message.options || {});
      sendResponse({ status: 'success' });
      break;
      
    case 'TOGGLE_FLOATING':
      toggleFloatingUI(sendResponse);
      return true;
      
    case 'GET_ACTIVE_TAB_INFO':
      getActiveTabInfo(sendResponse);
      return true;
      
    case 'SAVE_CSV':
      saveCSV(message.name, message.headers, message.rows, sendResponse);
      return true;
      
    case 'LOAD_CSV':
      loadCSV(message.name, sendResponse);
      return true;
      
    case 'DELETE_CSV':
      deleteCSV(message.name, sendResponse);
      return true;
      
    case 'CLOSE_ACTIVE_CSV':
      state.csvData = null;
      addLog('File CSV ditutup.', 'info');
      broadcastState();
      sendResponse({ status: 'success' });
      break;

    case 'SAVE_SCENARIO_TO_DB':
      saveScenarioToDB(message.name, sendResponse);
      return true;

    case 'LOAD_SCENARIO_FROM_DB':
      loadScenarioFromDB(message.name, sendResponse);
      return true;

    case 'DELETE_SCENARIO_FROM_DB':
      deleteScenarioFromDB(message.name, sendResponse);
      return true;
      
    case 'CLEAR_LOGS':
      state.logs = [];
      broadcastState();
      sendResponse({ status: 'success' });
      break;

    case 'PAUSE_AUTOMATION':
      pauseAutomation();
      sendResponse({ status: 'success' });
      break;

    case 'EXECUTE_NEXT_STEP':
      executeNextStep(sendResponse);
      return true; // Asinkron

    case 'MOVE_ACTION':
      moveAction(message.fromIndex, message.toIndex);
      sendResponse({ status: 'success' });
      break;

    case 'INSERT_ACTION':
      insertAction(message.index, message.action);
      sendResponse({ status: 'success' });
      break;

    case 'START_RECORDING_AT_INDEX':
      startRecordingAtIndex(message.index, sendResponse);
      return true; // Asinkron
  }
});

// Penyiapan status perekaman
function startRecording(callback) {
  state.status = 'recording';
  lastRecordedTabId = null; // Reset tab tracking
  
  // Suntikkan content script ke tab aktif jika belum ter-inject
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      state.activeTabId = tabs[0].id;
      recordInitialPageContext(tabs[0]);
      addLog('Perekaman interaksi dimulai...', 'warning');
      broadcastState();
      // Beritahu content script untuk mengaktifkan perekaman
      chrome.tabs.sendMessage(tabs[0].id, { type: 'ACTIVATE_RECORDER' }, (res) => {
        if (chrome.runtime.lastError) {
          injectContentScriptAndActivate(tabs[0].id);
        }
      });
    } else {
      addLog('Perekaman gagal dimulai: tab aktif tidak ditemukan.', 'error');
    }
    callback({ status: 'success' });
  });
}

function stopRecording(callback) {
  state.status = 'idle';
  state.recordInsertIndex = null;
  addLog(`Perekaman selesai. ${state.scenario.length} langkah terekam.`, 'success');
  broadcastState();
  
  // Beritahu content script untuk menghentikan perekaman
  if (state.activeTabId) {
    chrome.tabs.sendMessage(state.activeTabId, { type: 'DEACTIVATE_RECORDER' }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('Could not notify content script about stopping.');
      }
    });
  }
  callback({ status: 'success' });
}

function recordAction(action) {
  if (state.recordInsertIndex !== null && state.recordInsertIndex >= 0) {
    // Sisipkan pada posisi tertentu (saat rekam dari posisi insert line)
    const insertAt = Math.min(state.recordInsertIndex, state.scenario.length);
    state.scenario.splice(insertAt, 0, action);
    state.recordInsertIndex = insertAt + 1; // Geser posisi insert untuk aksi berikutnya
    addLog(`Aksi disisipkan di posisi ${insertAt + 1}: ${action.type.toUpperCase()} pada ${action.selector}`, 'info');
  } else {
    state.scenario.push(action);
    addLog(`Aksi terekam: ${action.type.toUpperCase()} pada ${action.selector}`, 'info');
  }
  broadcastState();
}

function updateAction(index, updatedAction) {
  if (state.scenario[index]) {
    state.scenario[index] = { ...state.scenario[index], ...updatedAction };
    addLog(`Langkah ${index + 1} diperbarui.`, 'info');
    broadcastState();
  }
}

function deleteAction(index) {
  if (index >= 0 && index < state.scenario.length) {
    state.scenario.splice(index, 1);
    addLog(`Langkah ${index + 1} dihapus.`, 'warning');
    broadcastState();
  }
}

// Jeda otomatisasi (pause)
function pauseAutomation() {
  state.status = 'paused';
  addLog('Otomatisasi dijeda.', 'warning');
  broadcastState();
}

// Eksekusi satu langkah berikutnya (saat paused)
async function executeNextStep(callback) {
  if (state.currentActionIndex >= state.scenario.length) {
    addLog('Semua langkah telah dieksekusi.', 'success');
    state.status = 'idle';
    state.currentActionIndex = 0;
    broadcastState();
    callback({ status: 'success', message: 'Selesai' });
    return;
  }

  const step = state.scenario[state.currentActionIndex];
  addLog(`[Langkah ${state.currentActionIndex + 1}] Eksekusi manual: ${step.type.toUpperCase()}`, 'info');

  try {
    let tabId = await getOrCreateActiveTabId();
    state.activeTabId = tabId;
    const csvRowData = null; // Tidak ada data CSV saat step-by-step
    const result = await executeStepWithActiveTab(tabId, step, csvRowData, state.currentActionIndex);

    if (result.status === 'success') {
      addLog(`[Langkah ${state.currentActionIndex + 1}] Sukses.`, 'success');
    } else {
      addLog(`[Langkah ${state.currentActionIndex + 1}] Gagal: ${result.message}`, 'error');
    }

    state.currentActionIndex++;
    if (state.currentActionIndex >= state.scenario.length) {
      addLog('Semua langkah telah dieksekusi.', 'success');
      state.status = 'idle';
      state.currentActionIndex = 0;
    }
    broadcastState();
    callback(result);
  } catch (err) {
    addLog(`[Langkah ${state.currentActionIndex + 1}] Error: ${err.message}`, 'error');
    callback({ status: 'error', message: err.message });
  }
}

// Geser posisi aksi dalam skenario
function moveAction(fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= state.scenario.length) return;
  if (toIndex < 0 || toIndex >= state.scenario.length) return;

  const [moved] = state.scenario.splice(fromIndex, 1);
  state.scenario.splice(toIndex, 0, moved);
  addLog(`Langkah ${fromIndex + 1} dipindahkan ke posisi ${toIndex + 1}.`, 'info');
  broadcastState();
}

// Sisipkan aksi pada posisi tertentu
function insertAction(index, action) {
  const insertAt = Math.min(index, state.scenario.length);
  state.scenario.splice(insertAt, 0, action);
  addLog(`Aksi ${action.type.toUpperCase()} disisipkan di posisi ${insertAt + 1}.`, 'info');
  broadcastState();
}

// Mulai rekam dari posisi tertentu (insert line)
function startRecordingAtIndex(index, callback) {
  state.recordInsertIndex = index;
  state.status = 'recording';
  lastRecordedTabId = null; // Reset tab tracking

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      state.activeTabId = tabs[0].id;
      recordInitialPageContext(tabs[0]);
      addLog(`Perekaman dimulai dari posisi ${index + 1}...`, 'warning');
      broadcastState();
      chrome.tabs.sendMessage(tabs[0].id, { type: 'ACTIVATE_RECORDER' }, (res) => {
        if (chrome.runtime.lastError) {
          injectContentScriptAndActivate(tabs[0].id);
        }
      });
    } else {
      addLog('Perekaman gagal dimulai: tab aktif tidak ditemukan.', 'error');
    }
    callback({ status: 'success' });
  });
}

function recordInitialPageContext(tab) {
  const tabUrl = tab && tab.url ? tab.url : '';
  if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://')) return;

  const existingFirst = state.scenario[0];
  if (existingFirst && (existingFirst.type === 'navigate' || existingFirst.type === 'tab_switch') && normalizeUrl(existingFirst.value || existingFirst.url) === normalizeUrl(tabUrl)) {
    return;
  }

  const action = {
    id: Date.now(),
    type: 'navigate',
    selector: 'URL',
    value: tabUrl,
    url: tabUrl,
    title: tab.title || ''
  };

  if (state.recordInsertIndex !== null && state.recordInsertIndex >= 0) {
    const insertAt = Math.min(state.recordInsertIndex, state.scenario.length);
    state.scenario.splice(insertAt, 0, action);
    state.recordInsertIndex = insertAt + 1;
  } else {
    state.scenario.push(action);
  }
}

function injectContentScriptAndActivate(tabId) {
  if (!chrome.scripting || !tabId) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ['js/content.js'] }, () => {
    if (chrome.runtime.lastError) {
      console.warn('Gagal inject content script:', chrome.runtime.lastError.message);
      addLog('Recorder belum bisa aktif di tab ini. Pastikan halaman web biasa, bukan halaman sistem Chrome.', 'error');
      return;
    }
    chrome.tabs.sendMessage(tabId, { type: 'ACTIVATE_RECORDER' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Content script tetap belum merespons:', chrome.runtime.lastError.message);
      }
    });
  });
}

// Mengirimkan status terbaru ke sidepanel & content script
function broadcastState() {
  chrome.runtime.sendMessage({ type: 'STATE_CHANGED', state: state }).catch(e => {
    // Abaikan jika tidak ada receiver aktif (seperti sidepanel ditutup)
  });
  
  // Kirim juga ke content script di tab aktif agar floating UI tersinkronisasi
  if (state.activeTabId) {
    chrome.tabs.sendMessage(state.activeTabId, { type: 'STATE_CHANGED', state: state }).catch(e => {
      // Abaikan jika tab tidak merespons
    });
  }
}

// Uji coba satu aksi saja ("play aksi itu saja")
async function playSingleAction(action, callback) {
  try {
    let tabId = await getOrCreateActiveTabId();
    if (!tabId) {
      addLog('Gagal uji coba: Tab aktif tidak ditemukan.', 'error');
      callback({ status: 'error', message: 'Tidak ada tab aktif yang ditemukan.' });
      return;
    }
    
    addLog(`Uji coba aksi: ${action.type.toUpperCase()} pada ${action.selector}`, 'info');
    
    // Jika aksi berupa navigasi atau tab_switch, handle langsung di background
    if (action.type === 'navigate' || action.type === 'tab_switch') {
      let targetUrl = action.type === 'tab_switch' ? (action.url || action.value) : action.value;
      if (!targetUrl) {
        callback({ status: 'error', message: 'URL kosong.' });
        return;
      }
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      tabId = await findOrCreateTab(targetUrl);
      state.activeTabId = tabId;
      addLog(`Navigasi ke ${targetUrl} berhasil.`, 'success');
      broadcastState();
      callback({ status: 'success' });
      return;
    }
    
    // Kirim perintah eksekusi ke content script tab aktif
    chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_STEP', step: action, value: action.value }, (res) => {
      if (chrome.runtime.lastError) {
        addLog('Uji coba gagal: Koneksi tab terputus.', 'error');
        callback({ status: 'error', message: 'Gagal mengirim pesan ke tab. Muat ulang halaman dan coba lagi.' });
      } else {
        if (res && res.status === 'success') {
          addLog('Uji coba aksi sukses.', 'success');
        } else {
          addLog(`Uji coba aksi gagal: ${res.message}`, 'error');
        }
        callback(res);
      }
    });
  } catch (err) {
    addLog(`Uji coba aksi gagal: ${err.message}`, 'error');
    callback({ status: 'error', message: err.message });
  }
}

// Logika Tab Switch & Tab Creation
async function findOrCreateTab(targetUrl) {
  try {
    let hostnameTarget = new URL(targetUrl).hostname;
    let tabs = await chrome.tabs.query({});
    
    const normalizedTarget = normalizeUrl(targetUrl);
    let matchedTab = tabs.find(t => t.url && normalizeUrl(t.url) === normalizedTarget);
    if (!matchedTab) {
      matchedTab = tabs.find(t => {
        try {
          const tabUrl = new URL(t.url || '');
          return tabUrl.hostname === hostnameTarget;
        } catch (e) {
          return false;
        }
      });
    }
    if (matchedTab) {
      addLog(`Berpindah ke tab aktif yang cocok: ${hostnameTarget}`, 'info');
      if (normalizeUrl(matchedTab.url || '') !== normalizedTarget) {
        await chrome.tabs.update(matchedTab.id, { active: true, url: targetUrl });
        await waitForTabComplete(matchedTab.id);
      } else {
        await chrome.tabs.update(matchedTab.id, { active: true });
      }
      if (matchedTab.windowId) {
        await chrome.windows.update(matchedTab.windowId, { focused: true });
      }
      return matchedTab.id;
    } else {
      addLog(`Membuka tab baru untuk URL: ${targetUrl}`, 'info');
      // Buat tab baru jika tidak ada yang cocok
      let newTab = await chrome.tabs.create({ url: targetUrl });
      // Tunggu sampai tab selesai memuat
      await waitForTabComplete(newTab.id);
      return newTab.id;
    }
  } catch (e) {
    addLog(`Membuka tab baru: ${targetUrl}`, 'info');
    let newTab = await chrome.tabs.create({ url: targetUrl });
    return newTab.id;
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch (e) {
    return url || '';
  }
}

function urlsAreCloseEnough(currentUrl, targetUrl) {
  try {
    const current = new URL(currentUrl || '');
    const target = new URL(targetUrl || '');
    if (current.hostname !== target.hostname) return false;
    return current.pathname === target.pathname && current.search === target.search;
  } catch (e) {
    return false;
  }
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab && tab.status === 'complete') finish();
    });
  });
}

async function getOrCreateActiveTabId() {
  let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    return tabs[0].id;
  }
  tabs = await chrome.tabs.query({ active: true });
  if (tabs[0]) {
    return tabs[0].id;
  }
  return null;
}

// Mulai Pemutaran Loop Otomatisasi
async function startAutomation(config, callback) {
  state.status = 'playing';
  state.loopMode = config.loopMode;
  state.csvStartRow = config.csvStartRow;
  state.csvEndRow = config.csvEndRow;
  state.staticLoopCount = config.staticLoopCount;
  state.currentLoopIndex = 0;
  state.currentActionIndex = 0;
  state.errorChoice = null;
  
  // Load CSV by name if specified
  if (config.loopMode === 'csv' && config.csvName) {
    await new Promise((resolve) => {
      chrome.storage.local.get(['csvs'], (res) => {
        const csvs = res.csvs || {};
        if (csvs[config.csvName]) {
          state.csvData = { name: config.csvName, headers: csvs[config.csvName].headers, rows: csvs[config.csvName].rows };
          addLog(`CSV "${config.csvName}" dimuat untuk otomatisasi.`, 'info');
        }
        resolve();
      });
    });
  }
  
  addLog(`Otomatisasi dimulai (${state.loopMode === 'csv' ? 'Mode CSV' : 'Mode Statis'}).`, 'success');
  broadcastState();
  
  callback({ status: 'success' });
  
  // Jalankan orkestrasi asinkron
  runAutomationLoop();
}

// Berhenti paksa
function stopAutomation() {
  state.status = 'idle';
  addLog('Otomatisasi dihentikan oleh pengguna.', 'warning');
  broadcastState();
}

// Fungsi Utama Mesin Loop Otomatisasi (Engine)
async function runAutomationLoop() {
  let start = 1;
  let end = 1;
  
  const csvRows = (state.csvData && state.csvData.rows) ? state.csvData.rows : [];
  
  if (state.loopMode === 'csv') {
    if (csvRows.length === 0) {
      addLog('Eksekusi gagal: Data CSV kosong.', 'error');
      state.status = 'idle';
      broadcastState();
      return;
    }
    start = parseInt(state.csvStartRow) || 1;
    end = parseInt(state.csvEndRow) || csvRows.length;
    start = Math.max(1, Math.min(start, csvRows.length));
    end = Math.max(start, Math.min(end, csvRows.length));
  } else {
    start = 1;
    end = parseInt(state.staticLoopCount) || 1;
  }
  
  let totalLoops = end - start + 1;
  addLog(`Total loop terhitung: ${totalLoops} putaran.`, 'info');
  
  for (let loopIdx = 0; loopIdx < totalLoops; loopIdx++) {
    if (state.status !== 'playing' && state.status !== 'paused') break;
    
    let actualRowIndex = start - 1 + loopIdx; // 0-based
    state.currentLoopIndex = loopIdx;
    
    if (state.loopMode === 'csv') {
      addLog(`[Putaran ${loopIdx + 1}/${totalLoops}] Menjalankan baris CSV ke-${actualRowIndex + 1}`, 'warning');
    } else {
      addLog(`[Putaran ${loopIdx + 1}/${totalLoops}] Menjalankan loop statis`, 'warning');
    }
    broadcastState();
    
    let csvRowData = csvRows[actualRowIndex] || null;
    
    // Jalankan skenario langkah demi langkah
    for (let actionIdx = 0; actionIdx < state.scenario.length; actionIdx++) {
      if (state.status !== 'playing' && state.status !== 'paused') break;
      
      // Tunggu jika dalam status JEDA (Paused)
      while (state.status === 'paused') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (state.status !== 'playing') break;
      
      state.currentActionIndex = actionIdx;
      broadcastState();
      
      let step = state.scenario[actionIdx];
      addLog(`[Langkah ${actionIdx + 1}] Memulai aksi: ${step.type.toUpperCase()}`, 'info');
      
      let success = false;
      while (!success && state.status === 'playing') {
        try {
          let tabId = await getOrCreateActiveTabId();
          state.activeTabId = tabId;
          
          let result = await executeStepWithActiveTab(tabId, step, csvRowData, actionIdx);
          if (result.status === 'success') {
            success = true;
            addLog(`[Langkah ${actionIdx + 1}] Sukses.`, 'success');
          } else {
            addLog(`[Langkah ${actionIdx + 1}] Gagal: ${result.message}`, 'error');
            
            // Tangani error dengan dialog konfirmasi
            let choice = await promptUserForErrorAction(result.message);
            if (choice === 'resume') {
              success = true; // Anggap sukses untuk lanjut
            } else if (choice === 'retry') {
              addLog(`[Langkah ${actionIdx + 1}] Mencoba ulang setelah kondisi tunggu terpenuhi...`, 'info');
            } else if (choice === 'stop') {
              state.status = 'idle';
              addLog('Otomatisasi dibatalkan setelah terjadi error.', 'warning');
              broadcastState();
              return;
            }
          }
        } catch (err) {
          addLog(`[Langkah ${actionIdx + 1}] Error Sistem: ${err.message}`, 'error');
          let choice = await promptUserForErrorAction(err.message);
          if (choice === 'resume') {
            success = true;
          } else if (choice === 'retry') {
            addLog(`[Langkah ${actionIdx + 1}] Mencoba ulang setelah kondisi tunggu terpenuhi...`, 'info');
          } else {
            state.status = 'idle';
            addLog('Otomatisasi dibatalkan setelah terjadi error.', 'warning');
            broadcastState();
            return;
          }
        }
      }
      
      if (success && state.scenario[actionIdx] !== step && state.scenario[actionIdx + 1] === step) {
        actionIdx++;
      }

      // Jeda antarlangkah kecil
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    
    addLog(`[Putaran ${loopIdx + 1}/${totalLoops}] Selesai.`, 'success');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  addLog('Seluruh otomatisasi telah selesai.', 'success');
  state.status = 'idle';
  broadcastState();
}

// Menjalankan perintah aksi pada tab aktif
async function executeStepWithActiveTab(tabId, step, csvRowData, actionIdx) {
  // Handle tab_switch action
  if (step.type === 'tab_switch') {
    const targetUrl = step.url || step.value;
    if (!targetUrl) {
      return { status: 'error', message: 'URL tab switch kosong.' };
    }
    addLog(`[Langkah ${actionIdx + 1}] Pindah ke tab: ${targetUrl}`, 'info');
    let newTabId = await findOrCreateTab(targetUrl);
    state.activeTabId = newTabId;
    broadcastState();
    // Tunggu tab siap
    await new Promise(resolve => setTimeout(resolve, 500));
    return { status: 'success' };
  }

  if (step.type === 'navigate') {
    let targetUrl = step.value;
    
    if (step.csvColumn && csvRowData && csvRowData[step.csvColumn] !== undefined) {
      targetUrl = csvRowData[step.csvColumn];
    }
    
    if (!targetUrl) {
      return { status: 'error', message: 'URL navigasi kosong.' };
    }
    
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }
    
    addLog(`[Langkah ${actionIdx + 1}] Navigasi ke URL: ${targetUrl}`, 'info');
    let newTabId = await findOrCreateTab(targetUrl);
    state.activeTabId = newTabId;
    broadcastState();
    return { status: 'success' };
  }
  
  if (step.type === 'wait') {
    let delayMs = parseInt(step.value) || 1000;
    addLog(`[Langkah ${actionIdx + 1}] Menunggu jeda selama ${delayMs}ms...`, 'info');
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return { status: 'success' };
  }

  if (step.type === 'wait_until') {
    const condition = step.condition || step.value || '';
    const timeoutMs = parseInt(step.timeoutMs || step.timeout || step.extra, 10) || 30000;
    if (!condition) {
      return { status: 'error', message: 'Kondisi tunggu kosong.' };
    }
    const waitTabId = await ensureTabForStep(tabId, step, actionIdx, { navigateExact: false });
    addLog(`[Langkah ${actionIdx + 1}] Menunggu kondisi: ${condition}`, 'info');
    return sendStepToTab(waitTabId, {
      type: 'wait_until',
      selector: step.selector || '',
      value: condition,
      condition,
      timeoutMs
    }, condition);
  }
  
  // For DOM actions (click, input, scroll, keypress): verify we're on the right tab
  if (step.url && (step.type === 'click' || step.type === 'click_optional' || step.type === 'input' || step.type === 'scroll' || step.type === 'keypress')) {
    tabId = await ensureTabForStep(tabId, step, actionIdx, { navigateExact: true });
  }
  
  if (!tabId) {
    return { status: 'error', message: 'Tidak menemukan tab aktif untuk mengeksekusi aksi DOM.' };
  }
  
  let executionValue = step.value;
  if (step.type === 'input' && step.csvColumn && csvRowData && csvRowData[step.csvColumn] !== undefined) {
    executionValue = csvRowData[step.csvColumn];
  }
  
  return sendStepToTab(tabId, step, executionValue);
}

async function ensureTabForStep(tabId, step, actionIdx, options = {}) {
  if (!step.url) return tabId;
  try {
    let tabInfo = null;
    if (tabId) {
      tabInfo = await new Promise((resolve) => {
        chrome.tabs.get(tabId, (info) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(info);
        });
      });
    }

    const currentUrl = tabInfo ? tabInfo.url || '' : '';
    const stepHost = new URL(step.url).hostname;
    const currentHost = currentUrl ? new URL(currentUrl).hostname : '';
    const mustNavigate = !currentHost || currentHost !== stepHost || (options.navigateExact && !urlsAreCloseEnough(currentUrl, step.url));

    if (mustNavigate) {
      addLog(`[Langkah ${actionIdx + 1}] Membuka halaman yang terekam: ${step.url}`, 'warning');
      tabId = await findOrCreateTab(step.url);
      state.activeTabId = tabId;
      broadcastState();
      await waitForTabComplete(tabId);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (e) {
    console.warn('URL verification failed:', e);
  }
  return tabId;
}

function sendStepToTab(tabId, step, executionValue) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_STEP', step: step, value: executionValue }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ status: 'error', message: 'Koneksi dengan tab terputus. Silakan muat ulang halaman.' });
      } else {
        resolve(res);
      }
    });
  });
}

// Mengelola prompt dialog error untuk Lanjut / Hentikan
let errorActionResolver = null;

async function promptUserForErrorAction(errorMessage) {
  // Jika pengguna sebelumnya memilih "Always" (Terapkan pilihan ini untuk semua error berikutnya)
  if (state.errorChoice && state.errorChoice.always) {
    addLog(`Mengabaikan error otomatis berdasarkan keputusan sebelumnya (Selalu Lanjutkan).`, 'warning');
    return state.errorChoice.action;
  }
  
  state.status = 'paused';
  state.lastErrorContext = { message: errorMessage, actionIndex: state.currentActionIndex };
  addLog('Otomatisasi dijeda karena adanya error. Menunggu keputusan pengguna...', 'warning');
  broadcastState();
  
  // Kirim perintah memunculkan dialog modal di UI
  chrome.runtime.sendMessage({ type: 'SHOW_ERROR_MODAL', message: errorMessage }).catch(e => {});
  if (state.activeTabId) {
    chrome.tabs.sendMessage(state.activeTabId, { type: 'SHOW_ERROR_MODAL', message: errorMessage }).catch(e => {});
  }
  
  return new Promise((resolve) => {
    errorActionResolver = resolve;
  });
}

function handleErrorResponse(choice, always, options = {}) {
  if (always) {
    state.errorChoice = { action: choice, always: true };
  }
  
  if (choice === 'wait_until') {
    const waitAction = {
      id: Date.now(),
      type: 'wait_until',
      selector: options.selector || '',
      value: options.condition || (options.selector ? `exists ${options.selector}` : ''),
      condition: options.condition || (options.selector ? `exists ${options.selector}` : ''),
      timeoutMs: parseInt(options.timeoutMs, 10) || 30000,
      url: options.url || ''
    };
    const insertAt = Math.max(0, state.currentActionIndex);
    state.scenario.splice(insertAt, 0, waitAction);
    addLog(`Aksi tunggu kondisi disisipkan sebelum langkah ${insertAt + 2}.`, 'info');
    addLog(`Keputusan pengguna terdeteksi: Tunggu kondisi lalu coba lagi`, 'info');
    state.status = 'playing';
    broadcastState();

    (async () => {
      const result = await executeStepWithActiveTab(state.activeTabId, waitAction, null, insertAt);
      if (result.status === 'success') {
        addLog('Kondisi tunggu terpenuhi. Mengulang aksi yang gagal...', 'success');
        resolveErrorAction('retry');
      } else {
        addLog(`Kondisi tunggu gagal: ${result.message}`, 'error');
        resolveErrorAction('stop');
      }
    })();
    return;
  }

  addLog(`Keputusan pengguna terdeteksi: ${choice === 'resume' ? 'Lanjutkan (Lewati)' : 'Hentikan'}`, 'info');
  state.status = 'playing';
  broadcastState();
  resolveErrorAction(choice);
}

function resolveErrorAction(choice) {
  if (errorActionResolver) {
    errorActionResolver(choice);
    errorActionResolver = null;
  }
}

// Logika Toggle Floating UI Iframe
async function toggleFloatingUI(callback) {
  let tabId = await getOrCreateActiveTabId();
  if (!tabId) {
    callback({ status: 'error', message: 'Tidak ada tab aktif.' });
    return;
  }
  
  state.activeTabId = tabId;
  // Kirim perintah pemicu ke content script tab aktif
  chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_FLOATING_UI', extensionId: chrome.runtime.id }, (res) => {
    if (chrome.runtime.lastError) {
      callback({ status: 'error', message: 'Gagal mengaktifkan Floating UI di tab ini. Pastikan halaman bukan halaman proteksi sistem Chrome (seperti chrome:// atau Web Store).' });
    } else {
      state.isFloatingOpen = res.isOpen;
      addLog(`Jendela melayang (Floating UI) ${state.isFloatingOpen ? 'aktif' : 'nonaktif'}.`, 'info');
      broadcastState();
      callback(res);
    }
  });
}

async function getActiveTabInfo(callback) {
  try {
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      callback({ title: tabs[0].title || 'Halaman Kosong', url: tabs[0].url });
    } else {
      callback({ title: 'Tidak terdeteksi', url: '' });
    }
  } catch (e) {
    callback({ title: 'Error', url: '' });
  }
}

// ==========================================
// OPERASI DATABASE CSV (chrome.storage.local)
// ==========================================

function saveCSV(name, headers, rows, callback) {
  chrome.storage.local.get(['csvs'], (res) => {
    let csvs = res.csvs || {};
    csvs[name] = { headers, rows, timestamp: Date.now() };
    chrome.storage.local.set({ csvs }, () => {
      // Set sebagai CSV aktif saat ini
      state.csvData = { name, headers, rows };
      addLog(`CSV "${name}" disimpan dan dimuat ke sistem.`, 'success');
      broadcastState();
      callback({ status: 'success' });
    });
  });
}

function loadCSV(name, callback) {
  chrome.storage.local.get(['csvs'], (res) => {
    let csvs = res.csvs || {};
    if (csvs[name]) {
      state.csvData = { name, headers: csvs[name].headers, rows: csvs[name].rows };
      addLog(`CSV "${name}" berhasil dimuat.`, 'success');
      broadcastState();
      callback({ status: 'success', csv: csvs[name] });
    } else {
      addLog(`Gagal memuat: CSV "${name}" tidak ditemukan.`, 'error');
      callback({ status: 'error', message: 'File CSV tidak ditemukan.' });
    }
  });
}

function deleteCSV(name, callback) {
  chrome.storage.local.get(['csvs'], (res) => {
    let csvs = res.csvs || {};
    if (csvs[name]) {
      delete csvs[name];
      chrome.storage.local.set({ csvs }, () => {
        addLog(`CSV "${name}" berhasil dihapus.`, 'warning');
        if (state.csvData && state.csvData.name === name) {
          state.csvData = null;
        }
        broadcastState();
        callback({ status: 'success' });
      });
    } else {
      callback({ status: 'error', message: 'File tidak ditemukan.' });
    }
  });
}

// ==========================================
// OPERASI DATABASE SKENARIO (chrome.storage.local)
// ==========================================

function saveScenarioToDB(name, callback) {
  if (!name || name.trim() === '') {
    callback({ status: 'error', message: 'Nama skenario tidak boleh kosong.' });
    return;
  }
  
  chrome.storage.local.get(['scenarios'], (res) => {
    let scenarios = res.scenarios || {};
    scenarios[name] = {
      scenario: state.scenario,
      timestamp: Date.now()
    };
    chrome.storage.local.set({ scenarios }, () => {
      addLog(`Skenario "${name}" disimpan ke database.`, 'success');
      callback({ status: 'success' });
    });
  });
}

// Load Scenario
function loadScenarioFromDB(name, callback) {
  chrome.storage.local.get(['scenarios'], (res) => {
    let scenarios = res.scenarios || {};
    if (scenarios[name]) {
      state.scenario = scenarios[name].scenario;
      addLog(`Skenario "${name}" berhasil dimuat.`, 'success');
      broadcastState();
      callback({ status: 'success', scenario: scenarios[name].scenario });
    } else {
      addLog(`Gagal memuat: Skenario "${name}" tidak ditemukan.`, 'error');
      callback({ status: 'error', message: 'Skenario tidak ditemukan.' });
    }
  });
}

// Delete Scenario
function deleteScenarioFromDB(name, callback) {
  chrome.storage.local.get(['scenarios'], (res) => {
    let scenarios = res.scenarios || {};
    if (scenarios[name]) {
      delete scenarios[name];
      chrome.storage.local.set({ scenarios }, () => {
        addLog(`Skenario "${name}" dihapus.`, 'warning');
        broadcastState();
        callback({ status: 'success' });
      });
    } else {
      callback({ status: 'error', message: 'Skenario tidak ditemukan.' });
    }
  });
}
