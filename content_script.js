/**
 * Content Script for Cookie Grabber Extension
 * Extracts localStorage and sessionStorage data from the current page
 */

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStorage') {
        try {
            const data = {
                localStorage: getStorageData(window.localStorage),
                sessionStorage: getStorageData(window.sessionStorage)
            };
            sendResponse({ success: true, data });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }

    // Set (inject) storage data
    if (request.action === 'setStorage') {
        try {
            const storage = request.storageType === 'localStorage'
                ? window.localStorage
                : window.sessionStorage;

            const data = request.data;
            let count = 0;

            for (const [key, value] of Object.entries(data)) {
                // Convert objects/arrays back to JSON strings
                const stringValue = typeof value === 'string'
                    ? value
                    : JSON.stringify(value);
                storage.setItem(key, stringValue);
                count++;
            }

            sendResponse({ success: true, count });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }
});

/**
 * Extract all key-value pairs from a Storage object
 * @param {Storage} storage - localStorage or sessionStorage
 * @returns {Array} Array of {key, value} objects
 */
function getStorageData(storage) {
    const items = [];
    try {
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            let value = storage.getItem(key);

            // Try to parse JSON values for better display
            let parsedValue = value;
            let isJson = false;
            try {
                parsedValue = JSON.parse(value);
                isJson = true;
            } catch (e) {
                // Not valid JSON, keep as string
            }

            items.push({
                key,
                value: parsedValue,
                rawValue: value,
                isJson,
                size: new Blob([value]).size
            });
        }
    } catch (error) {
        console.error('Error reading storage:', error);
    }
    return items;
}
