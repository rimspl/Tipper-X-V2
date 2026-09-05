(function initToastSystem() {
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);

        const style = document.createElement('style');
        style.textContent = `
            #toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 380px;
            }

            .toast-notification {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 18px;
                border-radius: 12px;
                background: white;
                box-shadow: 0 10px 40px rgba(0,0,0,0.15), 0 2px 10px rgba(0,0,0,0.1);
                animation: toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                position: relative;
                overflow: hidden;
            }

            .toast-notification.hiding {
                animation: toastSlideOut 0.3s ease forwards;
            }

            @keyframes toastSlideIn {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }

            @keyframes toastSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(120%); opacity: 0; }
            }

            .toast-icon {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1rem;
                flex-shrink: 0;
            }

            .toast-content {
                flex: 1;
            }

            .toast-title {
                font-weight: 600;
                font-size: 0.95rem;
                color: #1e293b;
                margin-bottom: 2px;
            }

            .toast-message {
                font-size: 0.85rem;
                color: #64748b;
            }

            .toast-close {
                background: none;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                font-size: 1.2rem;
                padding: 4px;
                margin-left: 8px;
            }

            .toast-close:hover { color: #475569; }

            .toast-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: currentColor;
                opacity: 0.3;
                animation: toastProgress 4s linear forwards;
            }

            @keyframes toastProgress {
                from { width: 100%; }
                to { width: 0%; }
            }

            .toast-success .toast-icon { background: #dcfce7; color: #16a34a; }
            .toast-success .toast-progress { color: #16a34a; }
            .toast-error .toast-icon { background: #fee2e2; color: #dc2626; }
            .toast-error .toast-progress { color: #dc2626; }
            .toast-info .toast-icon { background: #dbeafe; color: #2563eb; }
            .toast-info .toast-progress { color: #2563eb; }
            .toast-warning .toast-icon { background: #fef3c7; color: #d97706; }
            .toast-warning .toast-progress { color: #d97706; }

            @media (max-width: 480px) {
                #toast-container {
                    left: 10px;
                    right: 10px;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(style);
    }
})();

function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '\u2713',
        error: '\u2715',
        info: '\u2139',
        warning: '\u26A0'
    };

    const titles = {
        success: 'Success',
        error: 'Error',
        info: 'Info',
        warning: 'Warning'
    };

    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-' + type;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || '\u2713'}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type] || 'Notification'}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">\u00D7</button>
        <div class="toast-progress"></div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

window.showToast = showToast;
