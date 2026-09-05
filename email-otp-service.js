/**
 * email-otp-service.js
 * Handles OTP generation and verification via same-origin API proxy.
 * This avoids browser CORS failures on localhost and custom domains.
 */

const OTP_API_BASE = '/api';

const OTP_REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url, options = {}, timeoutMs = OTP_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Send OTP to email
 * Calls HIOX PHP endpoint which handles OTP generation, storage, and email sending
 * @param {string} email - User's email address
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendOTP(email) {
    try {
        const response = await fetchWithTimeout(`${OTP_API_BASE}/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.toLowerCase().trim() })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            return {
                success: true,
                message: `OTP sent to ${email}`
            };
        } else {
            console.error("OTP Server Error:", result);
            return {
                success: false,
                message: result.message || 'Failed to send OTP'
            };
        }

    } catch (err) {
        console.error("Send OTP Error:", err);
        const isTimeout = err?.name === 'AbortError';
        return {
            success: false,
            message: isTimeout ? "OTP service timed out. Please retry." : "Network/server error. Please try again."
        };
    }
}

/**
 * Verify OTP entered by user
 * Calls HIOX PHP endpoint to validate OTP
 * @param {string} email - User's email address
 * @param {string} inputOTP - OTP entered by user
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifyOTP(email, inputOTP) {
    try {
        const response = await fetchWithTimeout(`${OTP_API_BASE}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email.toLowerCase().trim(),
                otp: inputOTP.trim()
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            return {
                success: true,
                message: "OTP verified successfully"
            };
        } else {
            return {
                success: false,
                message: result.message || "Invalid or expired OTP"
            };
        }

    } catch (err) {
        console.error("Verify OTP Error:", err);
        const isTimeout = err?.name === 'AbortError';
        return {
            success: false,
            message: isTimeout ? "OTP verification timed out. Please retry." : "Verification failed. Please try again."
        };
    }
}

// Expose functions globally
window.EmailOTP = {
    sendOTP,
    verifyOTP
};
