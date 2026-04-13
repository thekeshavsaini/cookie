/**
 * Popup Script for Cookie Grabber Extension
 * Handles UI logic, data fetching, export, and IMPORT functionality
 */

// State management
const state = {
    currentTab: 'cookies',
    cookies: [],
    localStorage: [],
    sessionStorage: [],
    selections: {
        cookies: new Set(),
        localStorage: new Set(),
        sessionStorage: new Set()
    },
    currentUrl: '',
    currentDomain: '',
    // Import state
    importData: null,
    importParsed: false
};

// DOM Elements
const elements = {
    domainBadge: document.getElementById('currentDomain'),
    tabs: document.querySelectorAll('.tab'),
    cookieCount: document.getElementById('cookieCount'),
    localCount: document.getElementById('localCount'),
    sessionCount: document.getElementById('sessionCount'),
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    emptyState: document.getElementById('emptyState'),
    dataList: document.getElementById('dataList'),
    itemsContainer: document.getElementById('itemsContainer'),
    selectAll: document.getElementById('selectAll'),
    deselectAll: document.getElementById('deselectAll'),
    selectionCount: document.getElementById('selectionCount'),
    copyBtn: document.getElementById('copyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    // Export actions footer
    exportActions: document.getElementById('exportActions'),
    // Import elements
    importSection: document.getElementById('importSection'),
    importDomain: document.getElementById('importDomain'),
    fileInput: document.getElementById('fileInput'),
    fileName: document.getElementById('fileName'),
    jsonInput: document.getElementById('jsonInput'),
    importPreview: document.getElementById('importPreview'),
    previewCookies: document.getElementById('previewCookies'),
    previewLocal: document.getElementById('previewLocal'),
    previewSession: document.getElementById('previewSession'),
    parseBtn: document.getElementById('parseBtn'),
    injectBtn: document.getElementById('injectBtn'),
    importLog: document.getElementById('importLog'),
    logEntries: document.getElementById('logEntries')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    setupEventListeners();
    await fetchTabInfo();
}

function setupEventListeners() {
    // Tab switching
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Selection controls
    elements.selectAll.addEventListener('click', selectAllItems);
    elements.deselectAll.addEventListener('click', deselectAllItems);

    // Export buttons
    elements.copyBtn.addEventListener('click', copyToClipboard);
    elements.downloadBtn.addEventListener('click', downloadJSON);

    // Import: File input
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Import: Parse button
    elements.parseBtn.addEventListener('click', parseImportData);

    // Import: Inject button
    elements.injectBtn.addEventListener('click', injectCookies);
}

async function fetchTabInfo() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getTabInfo' });

        if (!response.success) {
            showError('Could not get tab information.');
            return;
        }

        const tab = response.tab;
        state.currentUrl = tab.url;

        // Check for restricted pages
        if (isRestrictedUrl(tab.url)) {
            showError('This extension cannot run on chrome://, edge://, or other browser internal pages.');
            return;
        }

        // Extract domain
        try {
            const url = new URL(tab.url);
            state.currentDomain = url.hostname;
            elements.domainBadge.textContent = state.currentDomain;
            elements.importDomain.textContent = state.currentDomain;
        } catch (e) {
            state.currentDomain = 'Unknown';
            elements.domainBadge.textContent = 'Unknown';
        }

        // Fetch all data
        await Promise.all([
            fetchCookies(),
            fetchStorage()
        ]);

        // Show initial tab
        renderCurrentTab();

    } catch (error) {
        console.error('Init error:', error);
        showError('Failed to initialize. Please try again.');
    }
}

function isRestrictedUrl(url) {
    const restrictedPrefixes = [
        'chrome://',
        'chrome-extension://',
        'edge://',
        'about:',
        'moz-extension://',
        'file://'
    ];
    return restrictedPrefixes.some(prefix => url.startsWith(prefix));
}

async function fetchCookies() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getCookies',
            url: state.currentUrl
        });

        if (response.success) {
            state.cookies = response.cookies;
            elements.cookieCount.textContent = state.cookies.length;
        }
    } catch (error) {
        console.error('Cookie fetch error:', error);
        state.cookies = [];
    }
}

async function fetchStorage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStorage' });

        if (response.success) {
            state.localStorage = response.data.localStorage;
            state.sessionStorage = response.data.sessionStorage;
            elements.localCount.textContent = state.localStorage.length;
            elements.sessionCount.textContent = state.sessionStorage.length;
        }
    } catch (error) {
        console.error('Storage fetch error:', error);
        state.localStorage = [];
        state.sessionStorage = [];
    }
}

function switchTab(tabName) {
    state.currentTab = tabName;

    // Update tab UI
    elements.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show/hide export actions footer based on tab
    if (tabName === 'import') {
        elements.exportActions.classList.add('hidden');
        hideAllStates();
        elements.importSection.classList.remove('hidden');
    } else {
        elements.exportActions.classList.remove('hidden');
        elements.importSection.classList.add('hidden');
        renderCurrentTab();
    }
}

function renderCurrentTab() {
    if (state.currentTab === 'import') return;

    const data = getDataForCurrentTab();

    hideAllStates();

    if (data.length === 0) {
        elements.emptyState.classList.remove('hidden');
        updateButtonStates();
        return;
    }

    elements.dataList.classList.remove('hidden');
    renderItems(data);
    updateSelectionCount();
    updateButtonStates();
}

function getDataForCurrentTab() {
    switch (state.currentTab) {
        case 'cookies': return state.cookies;
        case 'localStorage': return state.localStorage;
        case 'sessionStorage': return state.sessionStorage;
        default: return [];
    }
}

function getCurrentSelections() {
    return state.selections[state.currentTab];
}

function hideAllStates() {
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.emptyState.classList.add('hidden');
    elements.dataList.classList.add('hidden');
    elements.importSection.classList.add('hidden');
}

function showError(message) {
    hideAllStates();
    elements.errorMessage.textContent = message;
    elements.errorState.classList.remove('hidden');
    updateButtonStates();
}

function renderItems(data) {
    const container = elements.itemsContainer;
    container.innerHTML = '';

    data.forEach((item, index) => {
        const el = createItemElement(item, index);
        container.appendChild(el);
    });
}

function createItemElement(item, index) {
    const div = document.createElement('div');
    div.className = 'data-item';
    div.style.animationDelay = `${index * 30}ms`;

    const selections = getCurrentSelections();
    const itemKey = getItemKey(item, index);
    const isSelected = selections.has(itemKey);

    if (isSelected) {
        div.classList.add('selected');
    }

    const isCookie = state.currentTab === 'cookies';

    div.innerHTML = `
    <div class="checkbox-wrapper">
      <input type="checkbox" ${isSelected ? 'checked' : ''} data-index="${index}" data-key="${itemKey}">
    </div>
    <div class="item-content">
      <div class="item-header">
        <span class="item-name">${escapeHtml(isCookie ? item.name : item.key)}</span>
        <div class="item-badges">
          ${isCookie && item.httpOnly ? '<span class="badge badge-httponly">HttpOnly</span>' : ''}
          ${isCookie && item.secure ? '<span class="badge badge-secure">Secure</span>' : ''}
          ${!isCookie && item.isJson ? '<span class="badge badge-json">JSON</span>' : ''}
        </div>
      </div>
      <code class="item-value">${escapeHtml(truncateValue(isCookie ? item.value : item.rawValue))}</code>
      ${isCookie ? `
        <div class="item-meta">
          <span>🌐 ${escapeHtml(item.domain)}</span>
          <span>📁 ${escapeHtml(item.path)}</span>
          <span>⏱️ ${item.expires}</span>
        </div>
      ` : `
        <div class="item-meta">
          <span>📦 ${formatBytes(item.size)}</span>
        </div>
      `}
    </div>
  `;

    // Add checkbox event listener
    const checkbox = div.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
        handleCheckboxChange(e.target.dataset.key, e.target.checked);
        div.classList.toggle('selected', e.target.checked);
    });

    return div;
}

function getItemKey(item, index) {
    if (state.currentTab === 'cookies') {
        return `${item.name}|${item.domain}|${item.path}`;
    }
    return item.key;
}

function handleCheckboxChange(key, isChecked) {
    const selections = getCurrentSelections();

    if (isChecked) {
        selections.add(key);
    } else {
        selections.delete(key);
    }

    updateSelectionCount();
    updateButtonStates();
}

function selectAllItems() {
    const data = getDataForCurrentTab();
    const selections = getCurrentSelections();

    data.forEach((item, index) => {
        selections.add(getItemKey(item, index));
    });

    renderCurrentTab();
}

function deselectAllItems() {
    getCurrentSelections().clear();
    renderCurrentTab();
}

function updateSelectionCount() {
    const count = getCurrentSelections().size;
    elements.selectionCount.textContent = `${count} selected`;
}

function updateButtonStates() {
    const totalSelected =
        state.selections.cookies.size +
        state.selections.localStorage.size +
        state.selections.sessionStorage.size;

    const hasSelection = totalSelected > 0;
    elements.copyBtn.disabled = !hasSelection;
    elements.downloadBtn.disabled = !hasSelection;
}

function getSelectedData() {
    const result = {
        metadata: {
            exportedAt: new Date().toISOString(),
            domain: state.currentDomain,
            url: state.currentUrl
        },
        cookies: [],
        localStorage: {},
        sessionStorage: {}
    };

    // Get selected cookies
    state.selections.cookies.forEach(key => {
        const cookie = state.cookies.find((c, i) => getItemKey(c, i) === key);
        if (cookie) {
            result.cookies.push({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                expires: cookie.expires,
                httpOnly: cookie.httpOnly,
                secure: cookie.secure,
                sameSite: cookie.sameSite
            });
        }
    });

    // Get selected localStorage
    state.selections.localStorage.forEach(key => {
        const item = state.localStorage.find(i => i.key === key);
        if (item) {
            result.localStorage[item.key] = item.value;
        }
    });

    // Get selected sessionStorage
    state.selections.sessionStorage.forEach(key => {
        const item = state.sessionStorage.find(i => i.key === key);
        if (item) {
            result.sessionStorage[item.key] = item.value;
        }
    });

    return result;
}

async function copyToClipboard() {
    try {
        const data = getSelectedData();
        const json = JSON.stringify(data, null, 2);
        await navigator.clipboard.writeText(json);
        showToast('Copied to clipboard!');
    } catch (error) {
        console.error('Copy error:', error);
        showToast('Failed to copy', true);
    }
}

function downloadJSON() {
    try {
        const data = getSelectedData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const filename = `cookies_${state.currentDomain}_${Date.now()}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
        showToast('Downloaded!');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Failed to download', true);
    }
}

// ==================== IMPORT FUNCTIONALITY ====================

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    elements.fileName.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        elements.jsonInput.value = e.target.result;
        // Auto-parse after file load
        parseImportData();
    };
    reader.onerror = () => {
        showToast('Failed to read file', true);
    };
    reader.readAsText(file);
}

function parseImportData() {
    const jsonText = elements.jsonInput.value.trim();

    if (!jsonText) {
        showToast('Please provide JSON data', true);
        return;
    }

    try {
        const data = JSON.parse(jsonText);
        state.importData = normalizeImportData(data);
        state.importParsed = true;

        // Update preview
        const cookieCount = state.importData.cookies?.length || 0;
        const localCount = Object.keys(state.importData.localStorage || {}).length;
        const sessionCount = Object.keys(state.importData.sessionStorage || {}).length;

        elements.previewCookies.textContent = cookieCount;
        elements.previewLocal.textContent = localCount;
        elements.previewSession.textContent = sessionCount;

        elements.importPreview.classList.remove('hidden');
        elements.injectBtn.disabled = cookieCount === 0 && localCount === 0 && sessionCount === 0;

        showToast(`Parsed: ${cookieCount} cookies, ${localCount} local, ${sessionCount} session`);

    } catch (error) {
        console.error('Parse error:', error);
        showToast('Invalid JSON format', true);
        state.importData = null;
        state.importParsed = false;
        elements.importPreview.classList.add('hidden');
        elements.injectBtn.disabled = true;
    }
}

/**
 * Normalize import data to handle different formats
 * Supports: our format, Postman format, simple cookie arrays
 */
function normalizeImportData(data) {
    // If it's an array, assume it's cookies
    if (Array.isArray(data)) {
        return { cookies: data, localStorage: {}, sessionStorage: {} };
    }

    // Standard format
    return {
        cookies: data.cookies || [],
        localStorage: data.localStorage || {},
        sessionStorage: data.sessionStorage || {}
    };
}

async function injectCookies() {
    if (!state.importData || !state.importParsed) {
        showToast('Please parse data first', true);
        return;
    }

    // Clear previous log
    elements.logEntries.innerHTML = '';
    elements.importLog.classList.remove('hidden');

    const cookies = state.importData.cookies || [];
    const localStorage = state.importData.localStorage || {};
    const sessionStorage = state.importData.sessionStorage || {};

    let successCount = 0;
    let errorCount = 0;

    addLogEntry('info', `Starting import to ${state.currentDomain}...`);

    // Inject cookies
    for (const cookie of cookies) {
        try {
            // Delete existing cookie first
            await chrome.runtime.sendMessage({
                action: 'deleteCookie',
                cookie: cookie,
                url: state.currentUrl
            });

            // Set new cookie
            const response = await chrome.runtime.sendMessage({
                action: 'setCookie',
                cookie: cookie,
                url: state.currentUrl
            });

            if (response.success) {
                addLogEntry('success', `✓ Cookie: ${cookie.name}`);
                successCount++;
            } else {
                addLogEntry('error', `✗ Cookie: ${cookie.name} - ${response.error}`);
                errorCount++;
            }
        } catch (error) {
            addLogEntry('error', `✗ Cookie: ${cookie.name} - ${error.message}`);
            errorCount++;
        }
    }

    // Inject localStorage via content script
    if (Object.keys(localStorage).length > 0) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, {
                action: 'setStorage',
                storageType: 'localStorage',
                data: localStorage
            });
            const localCount = Object.keys(localStorage).length;
            addLogEntry('success', `✓ LocalStorage: ${localCount} items`);
            successCount += localCount;
        } catch (error) {
            addLogEntry('error', `✗ LocalStorage: ${error.message}`);
            errorCount++;
        }
    }

    // Inject sessionStorage via content script
    if (Object.keys(sessionStorage).length > 0) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, {
                action: 'setStorage',
                storageType: 'sessionStorage',
                data: sessionStorage
            });
            const sessionCount = Object.keys(sessionStorage).length;
            addLogEntry('success', `✓ SessionStorage: ${sessionCount} items`);
            successCount += sessionCount;
        } catch (error) {
            addLogEntry('error', `✗ SessionStorage: ${error.message}`);
            errorCount++;
        }
    }

    // Summary
    addLogEntry('info', `Complete: ${successCount} success, ${errorCount} errors`);

    if (errorCount === 0) {
        showToast(`Injected ${successCount} items successfully!`);
    } else {
        showToast(`Done with ${errorCount} errors`, true);
    }

    // Refresh cookie list
    await fetchCookies();
}

function addLogEntry(type, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const iconMap = {
        success: '✓',
        error: '✗',
        info: 'ℹ'
    };

    entry.innerHTML = `
        <span class="log-entry-icon">${iconMap[type] || '•'}</span>
        <span>${escapeHtml(message)}</span>
    `;

    elements.logEntries.appendChild(entry);
    elements.logEntries.scrollTop = elements.logEntries.scrollHeight;
}

// ==================== UTILITIES ====================

function showToast(message, isError = false) {
    elements.toastMessage.textContent = message;
    elements.toast.style.background = isError ? 'var(--danger)' : 'var(--success)';
    elements.toast.classList.remove('hidden');
    elements.toast.classList.add('show');

    setTimeout(() => {
        elements.toast.classList.remove('show');
        setTimeout(() => elements.toast.classList.add('hidden'), 300);
    }, 2000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function truncateValue(value, maxLength = 200) {
    if (!value) return '';
    const str = String(value);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
