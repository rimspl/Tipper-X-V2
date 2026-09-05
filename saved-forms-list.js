/**
 * saved-forms-list.js
 * Logic for the Manager Repository View
 */

const PAGE_CONFIG = {
    // Map URL 'type' param to the actual HTML filename
    fileMap: {
        'tyre-card': 'forms/tyre-card.html',
        'pressure-check': 'forms/pressure-check.html',
        'tyre-removal': 'forms/tyre-removal.html',      // New File
        'removal-fitment': 'forms/tyre-removal.html',   // Redirect old link
        'tyre-inspection': 'forms/tyre-inspection.html',
        'observation': 'forms/observation.html'
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    // Allow 'removal-fitment' to map to 'tyre-removal' logic
    let formType = urlParams.get('type');
    if (formType === 'removal-fitment') formType = 'tyre-removal';

    if (!formType || !DB_MANAGER.formTypes[formType]) {
        console.warn("Unknown form type:", formType);
        // Don't redirect immediately, just show empty to debug
    }

    // Set Header
    const friendlyName = DB_MANAGER.formTypes[formType] || 'Records';
    document.getElementById('page-title').textContent = `${friendlyName} Repository`;

    // Fetch
    console.log("Fetching...", formType);
    let forms = await DB_MANAGER.getForms(formType);

    // Global Access for Excel Export
    window.CURRENT_FORMS = forms;

    renderTable(forms, formType);
});

function renderTable(forms, formType) {
    const tbody = document.getElementById('forms-body');
    const theadRow = document.querySelector('#forms-table thead tr');

    tbody.innerHTML = '';

    if (!forms || forms.length === 0) {
        document.getElementById('no-data-msg').style.display = 'block';
        return;
    }
    document.getElementById('no-data-msg').style.display = 'none';

    // 1. DYNAMIC HEADERS
    if (formType === 'pressure-check') {
        theadRow.innerHTML = `<th>Date</th><th>Truck</th><th>Tyre</th><th>Found (PSI)</th><th>Corrected</th><th>Remarks</th><th>User</th>`;
    } else if (formType === 'tyre-removal') {
        theadRow.innerHTML = `<th>Date</th><th>Truck</th><th>Position</th><th>Tyre</th><th>RTD1</th><th>Reading</th><th>Remarks</th>`;
    } else if (formType === 'tyre-inspection') {
        theadRow.innerHTML = `<th>Date</th><th>Truck</th><th>Tyre</th><th>Pos</th><th>RTD1</th><th>Remarks</th><th>User</th>`;
    } else if (formType === 'observation') {
        theadRow.innerHTML = `<th>Date</th><th>Truck</th><th>Category</th><th>Observation</th><th>User</th>`;
    } else {
        // Default (Tyre Card / Fitment)
        theadRow.innerHTML = `<th>Date</th><th>Truck</th><th>Tyre</th><th>Action</th><th>Pos</th><th>Reading</th>`;
    }

    // 2. RENDER ROWS
    forms.forEach(form => {
        const d = form.data || {};
        const tr = document.createElement('tr');
        const user = form.user?.username || '-';

        if (formType === 'pressure-check') {
            tr.innerHTML = `
                <td>${d.date}</td><td><strong>${d.truck}</strong></td><td>${d.tyre}</td>
                <td><span style="color:${d.found < 100 ? 'red' : 'green'}">${d.found}</span></td>
                <td>${d.corrected}</td><td>${d.remarks || '-'}</td><td>${user}</td>
            `;
        } else if (formType === 'tyre-removal') {
            tr.innerHTML = `
                <td>${d.date}</td><td><strong>${d.truck}</strong></td><td>${d.pos}</td>
                <td>${d.tyre}</td><td>${d.rtd1 || '-'}</td><td>${d.reading}</td>
                <td>${d.remarks || '-'}</td>
            `;
        } else if (formType === 'tyre-inspection') {
            tr.innerHTML = `
                <td>${d.date}</td><td><strong>${d.truck}</strong></td><td>${d.tyre}</td>
                <td>${d.pos}</td><td>${d.rtd1 || '-'}</td><td>${d.remarks || '-'}</td><td>${user}</td>
            `;
        } else if (formType === 'observation') {
            tr.innerHTML = `
                <td>${form.timestamp.split('T')[0]}</td><td><strong>${d.truck}</strong></td>
                <td>${d.category}</td><td>${d.observation}</td><td>${user}</td>
            `;
        } else {
            // Default
            tr.innerHTML = `
                <td>${d.date}</td><td>${d.truck}</td><td><strong>${d.tyre}</strong></td>
                <td>${d.action}</td><td>${d.pos}</td><td>${d.reading}</td>
            `;
        }

        tbody.appendChild(tr);
    });
}
