function injectHeader() {
    const headerEl = document.getElementById('app-header');
    if (!headerEl) return;

    const user = getSession();
    const masterData = JSON.parse(localStorage.getItem('rims_master_data') || '{}');

    const clientName = user.customerName || masterData.customerName || 'Select Client';
    const siteName = user.siteName || masterData.siteName || 'Select Site';
    const username = user.username || 'User';
    const isManager = user.userType === 'manager';

    const homeLink = resolveDashboardLink(isManager);
    const setupLink = resolveSetupLink();
    const setupBtn = isManager ? '<a href="' + setupLink + '" class="hdr-btn hdr-btn-setup">Setup</a>' : '';

    headerEl.innerHTML = `
        <header class="modern-header">
            <div class="hdr-top">
                <div class="hdr-title-group" style="text-align: center; display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-weight: 800; font-size: 1.5rem; color: #fff; line-height: 1.2;">DynaHaul X</div>
                    <div style="font-weight: 700; font-size: 1.2rem; color: #fff; line-height: 1.2;">Tipper Division</div>
                    <div style="font-weight: 400; font-size: 0.9rem; color: #fff; line-height: 1.1; font-style: italic; opacity: 0.8;">Digital Solution for On-Off Road Tyres fitted on Tippers</div>
                </div>
            </div>
            <div class="hdr-bottom">
                <div class="hdr-badges">
                    <div class="hdr-badge"><i class="fas fa-building"></i><div><span class="badge-lbl">Client</span><span class="badge-val">${clientName}</span></div></div>
                    <div class="hdr-badge"><i class="fas fa-map-marker-alt"></i><div><span class="badge-lbl">Site</span><span class="badge-val">${siteName}</span></div></div>
                </div>
                <div class="hdr-user">
                    <div class="hdr-user-pill">User: ${username}</div>
                    ${setupBtn}
                    <button onclick="logout()" class="hdr-btn hdr-btn-logout">Logout</button>
                    <a href="${homeLink}" class="hdr-btn hdr-btn-dash">Dashboard</a>
                </div>
            </div>
        </header>
        <style>
            .modern-header { 
                background: linear-gradient(135deg, #1a365d 0%, #2c5282 50%, #2b6cb0 100%); 
                box-shadow: 0 4px 25px rgba(0,0,0,0.25); 
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; 
                border-bottom: 2px solid rgba(255, 255, 255, 0.1);
            }
            .hdr-top { text-align: center; padding: 22px 40px 18px; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .hdr-bottom { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                padding: 15px 40px; 
                background: rgba(0,0,0,0.2); 
                flex-wrap: wrap; gap: 15px; 
            }
            .hdr-badges { display: flex; gap: 20px; flex-wrap: wrap; }
            .hdr-badge { 
                display: flex; align-items: center; gap: 12px; 
                background: rgba(255, 255, 255, 0.1); 
                padding: 10px 24px; border-radius: 50px; 
                border: 1px solid rgba(255, 255, 255, 0.15); 
                backdrop-filter: blur(4px);
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                transition: all 0.3s ease;
            }
            .hdr-badge:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.15); }
            .hdr-badge i { color: #f8c100; font-size: 1.1rem; }
            .hdr-badge div { display: flex; flex-direction: column; }
            .badge-lbl { color: rgba(255,255,255,0.7); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; line-height: 1; margin-bottom: 3px; }
            .badge-val { color: white; font-size: 1rem; font-weight: 700; }
            .hdr-user { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
            .hdr-user-pill {
                background: rgba(255, 255, 255, 0.08); 
                padding: 10px 20px;
                border-radius: 50px; 
                color: white;
                font-weight: 600; 
                font-size: 0.95rem;
                border: 1px solid rgba(255, 255, 255, 0.12);
            }
            .hdr-btn { 
                padding: 10px 24px; 
                border-radius: 50px; 
                font-size: 0.9rem; 
                font-weight: 700; 
                text-decoration: none; 
                border: none; 
                cursor: pointer; 
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }
            .hdr-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 15px rgba(0,0,0,0.3); }
            .hdr-btn-setup { background: #3182ce; color: white; border: 1px solid rgba(255,255,255,0.2); }
            .hdr-btn-setup:hover { background: #2b6cb0; }
            .hdr-btn-logout { background: #e53e3e; color: white; border: 1px solid rgba(255,255,255,0.2); }
            .hdr-btn-logout:hover { background: #c53030; }
            .hdr-btn-dash { background: #4a5568; color: white; border: 1px solid rgba(255,255,255,0.2); }
            .hdr-btn-dash:hover { background: #2d3748; }
            @media (max-width: 900px) { .hdr-bottom { flex-direction: column; padding: 15px 20px; } .hdr-badges, .hdr-user { justify-content: center; width: 100%; } }
        </style>
    `;
}
