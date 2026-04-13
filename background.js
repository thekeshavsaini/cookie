/**
 * Background Service Worker for Cookie Grabber Extension
 * Handles chrome.cookies API calls since content scripts cannot access it directly
 */

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getCookies') {
        getCookiesForDomain(request.url)
            .then(cookies => sendResponse({ success: true, cookies }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep the message channel open for async response
    }

    if (request.action === 'getTabInfo') {
        chrome.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
                if (tabs[0]) {
                    sendResponse({ success: true, tab: tabs[0] });
                } else {
                    sendResponse({ success: false, error: 'No active tab found' });
                }
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // Set (inject) a single cookie
    if (request.action === 'setCookie') {
        setCookie(request.cookie, request.url)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    // Delete a cookie before re-injecting
    if (request.action === 'deleteCookie') {
        deleteCookie(request.cookie, request.url)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

/**
 * Get all cookies for a given URL
 * @param {string} url - The URL to get cookies for
 * @returns {Promise<Array>} Array of cookie objects
 */
async function getCookiesForDomain(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Get all cookies for this domain
        const cookies = await chrome.cookies.getAll({ domain });

        // Also try without leading dot to catch more cookies
        const cookiesNoDot = await chrome.cookies.getAll({
            domain: domain.startsWith('.') ? domain.slice(1) : domain
        });

        // Merge and dedupe by name+domain+path
        const cookieMap = new Map();
        [...cookies, ...cookiesNoDot].forEach(cookie => {
            const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
            if (!cookieMap.has(key)) {
                cookieMap.set(key, formatCookie(cookie));
            }
        });

        return Array.from(cookieMap.values());
    } catch (error) {
        console.error('Error fetching cookies:', error);
        throw error;
    }
}

/**
 * Format a cookie object with all relevant properties
 * @param {Object} cookie - Chrome cookie object
 * @returns {Object} Formatted cookie object
 */
function formatCookie(cookie) {
    return {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expirationDate
            ? new Date(cookie.expirationDate * 1000).toISOString()
            : 'Session',
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite || 'unspecified'
    };
}

/**
 * Set (inject) a cookie
 * @param {Object} cookie - Cookie object from import
 * @param {string} url - Target URL
 * @returns {Promise<Object>} Result of cookie set operation
 */
async function setCookie(cookie, url) {
    try {
        const urlObj = new URL(url);

        // Build cookie details for chrome.cookies.set
        const cookieDetails = {
            url: url,
            name: cookie.name,
            value: cookie.value,
            path: cookie.path || '/',
            secure: cookie.secure || urlObj.protocol === 'https:',
            httpOnly: cookie.httpOnly || false,
            sameSite: normalizeSameSite(cookie.sameSite)
        };

        // Handle domain - if provided, use it; otherwise let Chrome infer
        if (cookie.domain) {
            // Remove leading dot for chrome.cookies.set
            cookieDetails.domain = cookie.domain.startsWith('.')
                ? cookie.domain
                : '.' + cookie.domain;
        }

        // Handle expiration
        if (cookie.expires && cookie.expires !== 'Session') {
            const expirationDate = new Date(cookie.expires).getTime() / 1000;
            if (!isNaN(expirationDate)) {
                cookieDetails.expirationDate = expirationDate;
            }
        }

        const result = await chrome.cookies.set(cookieDetails);

        if (result) {
            return {
                success: true,
                cookie: result,
                message: `Set cookie: ${cookie.name}`
            };
        } else {
            throw new Error(`Failed to set cookie: ${cookie.name}`);
        }
    } catch (error) {
        console.error('Error setting cookie:', error);
        throw error;
    }
}

/**
 * Delete a cookie
 * @param {Object} cookie - Cookie object
 * @param {string} url - Target URL
 */
async function deleteCookie(cookie, url) {
    try {
        await chrome.cookies.remove({
            url: url,
            name: cookie.name
        });
    } catch (error) {
        // Ignore errors when cookie doesn't exist
        console.log('Cookie may not exist:', cookie.name);
    }
}

/**
 * Normalize sameSite value for chrome.cookies API
 * @param {string} sameSite - Input sameSite value
 * @returns {string} Normalized value
 */
function normalizeSameSite(sameSite) {
    if (!sameSite) return 'lax';
    const lower = sameSite.toLowerCase();
    if (lower === 'strict') return 'strict';
    if (lower === 'none') return 'no_restriction';
    return 'lax';
}

