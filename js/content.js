// Magerin - Content Script (Recorder, Player, and Floating UI)

let isRecordingActive = false;
let scrollTimeout = null;
let lastInputRecord = { selector: '', value: '', time: 0 };

// Initialize connection and state on inject
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
  if (state) {
    isRecordingActive = (state.status === 'recording');
  }
});

// Event Listeners for Recording
document.addEventListener('click', (e) => {
  if (!isRecordingActive) return;
  
  // Jangan rekam klik yang terjadi di dalam Floating UI Magerin
  if (isInsideMagerinUI(e.target)) return;
  
  const selector = getUniqueSelector(e.target);
  const elementInfo = getElementInfo(e.target);
  console.log('Recorded Click on Selector:', selector);
  
  chrome.runtime.sendMessage({
    type: 'RECORD_ACTION',
    action: {
      id: Date.now(),
      type: 'click',
      selector: selector,
      value: '',
      url: window.location.href,
      title: document.title,
      element: elementInfo
    }
  });
}, true); // Capture phase to prevent page elements from blocking

document.addEventListener('change', (e) => {
  if (!isRecordingActive) return;
  if (isInsideMagerinUI(e.target)) return;
  
  const tagName = e.target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    recordInputAction(e.target);
  }
}, true);

document.addEventListener('blur', (e) => {
  if (!isRecordingActive) return;
  if (isInsideMagerinUI(e.target)) return;
  
  const tagName = e.target.tagName && e.target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    recordInputAction(e.target);
  }
}, true);

// Record Enter key presses
document.addEventListener('keydown', (e) => {
  if (!isRecordingActive) return;
  if (isInsideMagerinUI(e.target)) return;
  
  if (e.key === 'Enter') {
    const tagName = e.target.tagName && e.target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      recordInputAction(e.target, { submitKey: 'Enter' });
      return;
    }

    const selector = getUniqueSelector(e.target);
    console.log('Recorded Enter keypress on:', selector);
    
    chrome.runtime.sendMessage({
      type: 'RECORD_ACTION',
      action: {
        id: Date.now(),
        type: 'keypress',
        selector: selector,
        value: 'Enter',
        url: window.location.href,
        title: document.title,
        element: getElementInfo(e.target)
      }
    });
  }
}, true);

// Debounced Window Scroll recording
// Menggunakan listener di window tanpa capture agar e.target lebih terprediksi
let lastRecordedScrollY = null;

window.addEventListener('scroll', () => {
  if (!isRecordingActive) return;
  
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    const currentY = window.scrollY || window.pageYOffset || 0;
    // Hindari rekam scroll duplikat pada posisi yang sama
    if (lastRecordedScrollY !== null && Math.abs(currentY - lastRecordedScrollY) < 10) return;
    lastRecordedScrollY = currentY;
    
    console.log('Recorded Scroll, Y-offset:', currentY);
    chrome.runtime.sendMessage({
      type: 'RECORD_ACTION',
      action: {
        id: Date.now(),
        type: 'scroll',
        selector: 'window',
        value: currentY.toString(),
        url: window.location.href,
        title: document.title
      }
    });
  }, 800);
});

// Scroll pada elemen container (untuk TikTok, Instagram, dll yang scroll di dalam div)
let elementScrollTimeout = null;
let lastElementScrollInfo = { selector: '', scrollTop: 0, time: 0 };

document.addEventListener('scroll', (e) => {
  if (!isRecordingActive) return;
  
  const target = e.target;
  // Abaikan scroll di window/document (sudah ditangani di atas)
  if (target === document || target === document.documentElement || target === window) return;
  // Abaikan elemen dari Magerin UI
  if (target.closest && target.closest('#magerin-floating-container')) return;
  
  // Hanya tangkap elemen yang benar-benar scrollable (tinggi scroll > tinggi tampil)
  if (!target.scrollHeight || target.scrollHeight <= target.clientHeight + 10) return;
  
  clearTimeout(elementScrollTimeout);
  elementScrollTimeout = setTimeout(() => {
    const selector = getUniqueSelector(target);
    const scrollTop = target.scrollTop || 0;
    const now = Date.now();
    
    // Deduplikasi: abaikan jika elemen & posisi sama dalam waktu dekat
    if (lastElementScrollInfo.selector === selector && 
        Math.abs(scrollTop - lastElementScrollInfo.scrollTop) < 10 &&
        now - lastElementScrollInfo.time < 2000) return;
    
    lastElementScrollInfo = { selector, scrollTop, time: now };
    
    console.log('Recorded Element Scroll:', selector, 'scrollTop:', scrollTop);
    chrome.runtime.sendMessage({
      type: 'RECORD_ACTION',
      action: {
        id: now,
        type: 'scroll',
        selector: selector,
        value: scrollTop.toString(),
        url: window.location.href,
        title: document.title
      }
    });
  }, 600);
}, true); // capture: true agar menangkap scroll di semua elemen anak

// Listen for execution commands from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content Script received message:', message);
  
  switch (message.type) {
    case 'ACTIVATE_RECORDER':
      isRecordingActive = true;
      sendResponse({ status: 'active' });
      break;
      
    case 'DEACTIVATE_RECORDER':
      isRecordingActive = false;
      sendResponse({ status: 'inactive' });
      break;
      
    case 'STATE_CHANGED':
      isRecordingActive = (message.state.status === 'recording');
      break;

    case 'PING_CONTENT':
      sendResponse({ status: 'ready' });
      break;
      
    case 'EXECUTE_STEP':
      executeStep(message.step, message.value)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ status: 'error', message: err.message }));
      return true; // async response
      
    case 'TOGGLE_FLOATING_UI':
      const toggleRes = toggleFloatingUI(message.extensionId);
      sendResponse(toggleRes);
      break;
  }
});

// ==========================================
// MESIN EKSEKUSI (PLAYER) & SMART WAIT
// ==========================================

async function executeStep(step, value) {
  console.log(`Executing step: ${step.type} on ${step.selector} with value: ${value}`);
  
  try {
    if (step.type === 'click' || step.type === 'click_optional') {
      if (step.type === 'click_optional') {
        const optionalElement = await waitForSmartElement(step, step.timeoutMs || 5000).catch(() => null);
        if (!optionalElement) {
          return { status: 'success', message: 'Elemen opsional tidak muncul, dilewati.' };
        }
        optionalElement.focus();
        optionalElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        optionalElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        optionalElement.click();
        return { status: 'success' };
      }

      const element = await waitForSmartElement(step);
      
      // Berikan fokus dan picu event secara natural
      element.focus();
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      element.click();
      
      return { status: 'success' };
      
    } else if (step.type === 'input') {
      const element = await waitForSmartElement(step);
      
      element.focus();
      element.value = value;
      
      // Dispatch input events agar reactive system mendeteksi ketikan
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      if (step.submitKey === 'Enter') {
        dispatchKeyboardEvent(element, 'keydown', 'Enter');
        dispatchKeyboardEvent(element, 'keypress', 'Enter');
        dispatchKeyboardEvent(element, 'keyup', 'Enter');
      } else {
        // Blur untuk memicu validasi
        element.blur();
      }
      
      return { status: 'success' };
      
    } else if (step.type === 'scroll') {
      if (step.selector.toLowerCase() === 'window') {
        if (value.toLowerCase() === 'bottom') {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
          });
        } else {
          // Gunakan scrollTo untuk posisi absolut (dari rekaman scrollY)
          window.scrollTo({
            top: parseInt(value) || 300,
            behavior: 'smooth'
          });
        }
      } else {
        const element = await waitForSmartElement(step);
        if (value.toLowerCase() === 'bottom') {
          element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth'
          });
        } else {
          // Gunakan scrollTo untuk posisi absolut (dari rekaman scrollTop elemen)
          element.scrollTo({
            top: parseInt(value) || 300,
            behavior: 'smooth'
          });
        }
      }
      // Tunggu jeda animasi scroll selesai
      await new Promise(resolve => setTimeout(resolve, 800));
      return { status: 'success' };

    } else if (step.type === 'keypress') {
      const element = await waitForSmartElement(step);
      element.focus();
      
      const key = step.value || 'Enter';
      dispatchKeyboardEvent(element, 'keydown', key);
      dispatchKeyboardEvent(element, 'keypress', key);
      dispatchKeyboardEvent(element, 'keyup', key);
      
      await new Promise(resolve => setTimeout(resolve, 300));
      return { status: 'success' };
    } else if (step.type === 'wait_until') {
      await waitForCondition(step.condition || step.value || '', step.timeoutMs || 30000);
      return { status: 'success' };
    }
    
    return { status: 'error', message: 'Tipe aksi tidak didukung di content script.' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

function recordInputAction(element, options = {}) {
  const selector = getUniqueSelector(element);
  const val = element.value;
  const now = Date.now();
  if (lastInputRecord.selector === selector && lastInputRecord.value === val && now - lastInputRecord.time < 3000) {
    return;
  }

  lastInputRecord = { selector, value: val, time: now };
  console.log('Recorded Input on Selector:', selector, 'Value:', val);
  
  chrome.runtime.sendMessage({
    type: 'RECORD_ACTION',
    action: {
      id: now,
      type: 'input',
      selector: selector,
      value: val,
      url: window.location.href,
      title: document.title,
      submitKey: options.submitKey || '',
      element: getElementInfo(element)
    }
  });
}

function isInsideMagerinUI(target) {
  return target && target.closest && target.closest('#magerin-floating-container');
}

function dispatchKeyboardEvent(element, type, key) {
  const normalizedKey = key || 'Enter';
  const keyCode = normalizedKey === 'Enter' ? 13 : normalizedKey.charCodeAt(0);
  element.dispatchEvent(new KeyboardEvent(type, {
    key: normalizedKey,
    code: normalizedKey === 'Enter' ? 'Enter' : `Key${normalizedKey.toUpperCase()}`,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true
  }));
}

async function waitForSmartElement(step, timeoutMs = 10000) {
  const selectors = buildSelectorCandidates(step);
  let lastError = null;
  for (const selector of selectors) {
    try {
      return await waitForElement(selector, Math.max(1500, Math.floor(timeoutMs / selectors.length)));
    } catch (err) {
      lastError = err;
    }
  }
  if (step.element && step.element.text && step.type === 'click') {
    const textElement = await waitForElementByText(step.element.text, step.element.tag, 2500).catch(() => null);
    if (textElement) return textElement;
  }
  throw lastError || new Error('Elemen target tidak ditemukan.');
}

function buildSelectorCandidates(step) {
  const candidates = [];
  if (step.selector) candidates.push(step.selector);
  const el = step.element || {};
  if (el.id) candidates.push(`#${CSS.escape(el.id)}`);
  if (el.testId) candidates.push(`[data-testid="${cssAttributeValue(el.testId)}"]`);
  if (el.name) candidates.push(`${el.tag || ''}[name="${cssAttributeValue(el.name)}"]`);
  if (el.placeholder) candidates.push(`${el.tag || ''}[placeholder="${cssAttributeValue(el.placeholder)}"]`);
  if (el.ariaLabel) candidates.push(`${el.tag || ''}[aria-label="${cssAttributeValue(el.ariaLabel)}"]`);
  return [...new Set(candidates.filter(Boolean))];
}

// Fungsi Kunci Smart Wait Engine (MutationObserver & polling)
function waitForElement(selector, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!selector) {
      reject(new Error('Selector target kosong.'));
      return;
    }
    
    // Cek apakah langsung ada di DOM saat ini
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    // Gunakan MutationObserver untuk memantau perubahan DOM secara real-time
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timeout);
        resolve(el);
      }
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    // Batas waktu tunggu maksimal (Timeout)
    const timeout = setTimeout(() => {
      observer.disconnect();
      // Double check terakhir kali sebelum menyerah
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
      } else {
        reject(new Error(`Elemen target "${selector}" tidak muncul dalam waktu ${timeoutMs / 1000} detik.`));
      }
    }, timeoutMs);
  });
}

function waitForElementByText(text, tagName, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      const found = findElementByText(text, tagName);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Elemen dengan teks "${text}" tidak muncul.`));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function waitForCondition(condition, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (evaluateCondition(condition)) {
          resolve();
          return;
        }
      } catch (err) {
        reject(err);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Kondisi "${condition}" tidak terpenuhi dalam ${Math.round(timeoutMs / 1000)} detik.`));
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

function evaluateCondition(condition) {
  const raw = String(condition || '').trim();
  if (!raw) throw new Error('Kondisi tunggu kosong.');

  if (raw.startsWith('exists ')) {
    const selector = raw.substring(7).trim();
    return !!document.querySelector(selector);
  }

  if (raw.startsWith('not exists ')) {
    const selector = raw.substring(11).trim();
    return !document.querySelector(selector);
  }

  if (raw.startsWith('text ')) {
    const body = raw.substring(5).trim();
    const containsIndex = body.indexOf(' contains ');
    const equalsIndex = body.indexOf(' = ');
    let selector = '';
    let expected = '';
    let mode = '';

    if (containsIndex !== -1 && (equalsIndex === -1 || containsIndex < equalsIndex)) {
      mode = 'contains';
      selector = body.substring(0, containsIndex).trim();
      expected = body.substring(containsIndex + 10).trim().replace(/^["']|["']$/g, '');
    } else if (equalsIndex !== -1) {
      mode = 'equals';
      selector = body.substring(0, equalsIndex).trim();
      expected = body.substring(equalsIndex + 3).trim().replace(/^["']|["']$/g, '');
    } else {
      throw new Error('Format text harus: text selector = "nilai" atau text selector contains "nilai".');
    }

    const element = document.querySelector(selector);
    const actual = element ? (element.innerText || element.textContent || '').trim() : '';
    return mode === 'contains' ? actual.includes(expected) : actual === expected;
  }

  return !!document.querySelector(raw);
}

function findElementByText(text, tagName) {
  const cleanText = (text || '').trim();
  if (!cleanText) return null;
  const tags = tagName ? [tagName] : ['button', 'a', 'span', 'div'];
  for (const tag of tags) {
    const nodes = Array.from(document.querySelectorAll(tag));
    const found = nodes.find(node => (node.innerText || node.textContent || '').trim() === cleanText);
    if (found) return found;
  }
  return null;
}

// ==========================================
// GENERATOR CSS SELECTOR UNIK (RECORDER)
// ==========================================

function getUniqueSelector(el) {
  if (el.tagName === 'BODY' || el.tagName === 'HTML') return el.tagName.toLowerCase();
  
  // 1. Coba cari ID yang unik di dokumen
  if (el.id) {
    try {
      if (document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        return '#' + CSS.escape(el.id);
      }
    } catch (e) {}
  }
  
  // 2. Cek atribut penting lainnya (name, data-testid, placeholder)
  const keyAttributes = ['data-testid', 'aria-label', 'name', 'placeholder', 'type'];
  for (let attr of keyAttributes) {
    let val = el.getAttribute(attr);
    if (val) {
      let selector = `${el.tagName.toLowerCase()}[${attr}="${cssAttributeValue(val)}"]`;
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch (e) {}
    }
  }
  
  // 3. Cek kombinasi Class Name yang unik
  if (el.classList && el.classList.length > 0) {
    let classes = Array.from(el.classList).map(c => '.' + CSS.escape(c)).join('');
    let selector = el.tagName.toLowerCase() + classes;
    try {
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    } catch (e) {}
  }
  
  // 4. Trace Hierarki Tag dan nth-of-type
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.tagName.toLowerCase();
    
    let sibling = el;
    let nth = 1;
    while (sibling = sibling.previousElementSibling) {
      if (sibling.tagName === el.tagName) nth++;
    }
    
    if (nth > 1) {
      selector += `:nth-of-type(${nth})`;
    }
    
    path.unshift(selector);
    el = el.parentElement;
    
    let currentSelector = path.join(' > ');
    try {
      if (document.querySelectorAll(currentSelector).length === 1) {
        return currentSelector;
      }
    } catch (e) {}
  }
  
  return path.join(' > ');
}

function cssAttributeValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getElementInfo(el) {
  if (!el || !el.tagName) return {};
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || '',
    name: el.getAttribute('name') || '',
    type: el.getAttribute('type') || '',
    testId: el.getAttribute('data-testid') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    placeholder: el.getAttribute('placeholder') || '',
    text: (el.innerText || el.textContent || '').trim().slice(0, 120),
    href: el.href || ''
  };
}

// ==========================================
// LOGIKA JENDELA MELAYANG (FLOATING UI IFRAME)
// ==========================================

function toggleFloatingUI(extensionId) {
  const containerId = 'magerin-floating-container';
  let container = document.getElementById(containerId);
  
  if (container) {
    // Jika ada, langsung hapus (Tutup/Toggle Off)
    container.remove();
    return { isOpen: false };
  } else {
    // Jika tidak ada, buat dan suntikkan kontainer baru
    container = document.createElement('div');
    container.id = containerId;
    
    // Style kontainer utama (Glassmorphic Window)
    Object.assign(container.style, {
      position: 'fixed',
      top: '60px',
      right: '20px',
      width: '360px',
      height: '620px',
      zIndex: '2147483647', // Nilai Z-index tertinggi agar selalu di atas
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      background: 'rgba(11, 15, 25, 0.9)',
      backdropFilter: 'blur(12px)',
      webkitBackdropFilter: 'blur(12px)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Outfit', sans-serif"
    });
    
    // Handle Drag Bar (Header Handle)
    const dragHandle = document.createElement('div');
    Object.assign(dragHandle.style, {
      width: '100%',
      height: '32px',
      background: 'rgba(20, 27, 45, 0.95)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      cursor: 'move',
      userSelect: 'none',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
    });
    
    const dragTitle = document.createElement('span');
    dragTitle.textContent = 'Magerin Control Panel';
    Object.assign(dragTitle.style, {
      fontSize: '11px',
      fontWeight: '600',
      color: '#A0AEC0',
      letterSpacing: '0.5px',
      textTransform: 'uppercase'
    });
    
    const dragCloseBtn = document.createElement('button');
    dragCloseBtn.textContent = '✕';
    Object.assign(dragCloseBtn.style, {
      background: 'transparent',
      border: 'none',
      color: '#718096',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '700',
      padding: '2px'
    });
    dragCloseBtn.addEventListener('mouseover', () => dragCloseBtn.style.color = '#EF4444');
    dragCloseBtn.addEventListener('mouseout', () => dragCloseBtn.style.color = '#718096');
    dragCloseBtn.addEventListener('click', () => {
      container.remove();
      chrome.runtime.sendMessage({ type: 'TOGGLE_FLOATING' });
    });
    
    dragHandle.appendChild(dragTitle);
    dragHandle.appendChild(dragCloseBtn);
    container.appendChild(dragHandle);
    
    // Elemen Iframe
    const iframe = document.createElement('iframe');
    iframe.src = `chrome-extension://${extensionId}/sidepanel.html`;
    Object.assign(iframe.style, {
      width: '100%',
      height: 'calc(100% - 32px)',
      border: 'none'
    });
    
    container.appendChild(iframe);
    document.body.appendChild(container);
    
    // Terapkan fungsi dragging
    makeElementDraggable(container, dragHandle);
    
    return { isOpen: true };
  }
}

// Fungsi Drag & Drop untuk Elemen Melayang
function makeElementDraggable(elmnt, dragHandle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  dragHandle.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // Terapkan batasan agar tidak diseret keluar layar
    let newTop = elmnt.offsetTop - pos2;
    let newLeft = elmnt.offsetLeft - pos1;
    
    // Batas layar viewport
    const maxTop = window.innerHeight - 100;
    const maxLeft = window.innerWidth - 100;
    
    newTop = Math.max(0, Math.min(newTop, maxTop));
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    
    elmnt.style.top = newTop + "px";
    elmnt.style.left = newLeft + "px";
  }
  
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
