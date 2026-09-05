(function initConfirmModal() {
    const modalHTML = `
        <div id="confirm-modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10002; justify-content:center; align-items:center;">
            <div id="confirm-modal" style="background:white; padding:25px 30px; border-radius:12px; text-align:center; max-width:380px; width:90%; box-shadow:0 10px 40px rgba(0,0,0,0.25); animation:confirmSlideIn 0.3s ease;">
                <div id="confirm-title" style="font-size:1.2rem; font-weight:700; color:#1e293b; margin-bottom:12px;">Confirm Action</div>
                <div id="confirm-message" style="color:#334155; margin-bottom:25px; line-height:1.5; font-weight:600; font-size:1rem;"></div>
                <div style="display:flex; gap:12px; justify-content:center;">
                    <button id="confirm-cancel-btn" style="background:#e2e8f0; color:#475569; border:none; padding:10px 24px; border-radius:6px; font-size:0.95rem; cursor:pointer; font-weight:600; transition:all 0.2s;">Cancel</button>
                    <button id="confirm-ok-btn" style="background:linear-gradient(135deg,#1b365d,#3182ce); color:white; border:none; padding:10px 24px; border-radius:6px; font-size:0.95rem; cursor:pointer; font-weight:600; transition:all 0.2s;">Confirm</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes confirmSlideIn {
                from { transform: translateY(-20px) scale(0.95); opacity: 0; }
                to { transform: translateY(0) scale(1); opacity: 1; }
            }
            #confirm-cancel-btn:hover { background: #cbd5e1; }
            #confirm-ok-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(49, 130, 206, 0.4); }
        </style>
    `;

    document.addEventListener('DOMContentLoaded', () => {
        const div = document.createElement('div');
        div.innerHTML = modalHTML;
        document.body.appendChild(div.firstElementChild);

        const styleEl = div.querySelector('style');
        if (styleEl) document.head.appendChild(styleEl);
    });
})();

function showConfirm(message, title = 'Confirm Action') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-modal-overlay');
        const msgEl = document.getElementById('confirm-message');
        const titleEl = document.getElementById('confirm-title');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        if (!overlay) {
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        overlay.style.display = 'flex';

        const cleanup = () => {
            overlay.style.display = 'none';
            okBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        okBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

window.showConfirm = showConfirm;
