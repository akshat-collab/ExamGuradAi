let violationsTimer = null;
const chartInstances = {};

function $(id) {
    return document.getElementById(id);
}

function setTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === `panel-${name}`);
    });
    if (violationsTimer) {
        clearInterval(violationsTimer);
        violationsTimer = null;
    }
    if (name === 'violations') {
        loadViolations();
        violationsTimer = setInterval(loadViolations, 5000);
    }
    if (name === 'overview') {
        loadOverview();
    }
}

async function loadDashboard() {
    try {
        const r = await fetch('/api/dashboard');
        const d = await r.json();
        $('dashStudents').textContent = d.students ?? '0';
        $('dashViolations').textContent = d.violations ?? '0';
        $('dashSubmissions').textContent = d.exam_submissions ?? '0';
        $('dashAvg').textContent = d.avg_score != null ? d.avg_score : '—';
        $('dashMax').textContent = d.max_score != null ? d.max_score : '—';
        $('dashMin').textContent = d.min_score != null ? d.min_score : '—';
    } catch (e) {
        console.error('Dashboard error', e);
    }
}

function destroyCharts() {
    Object.keys(chartInstances).forEach(k => {
        try {
            chartInstances[k].destroy();
        } catch (e) { /* noop */ }
        delete chartInstances[k];
    });
}

function chartDefaults() {
    if (typeof Chart === 'undefined') return;
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    Chart.defaults.color = light ? '#5c6378' : '#8B92A8';
    Chart.defaults.borderColor = light ? 'rgba(26,29,46,0.1)' : 'rgba(255,255,255,0.08)';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
}

async function loadAnalyticsCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded');
        return;
    }
    chartDefaults();
    destroyCharts();

    let data;
    try {
        const r = await fetch('/api/admin/analytics');
        data = await r.json();
    } catch (e) {
        console.error(e);
        return;
    }

    const labels = (data.violations_by_day || []).map(x => {
        const d = x.date || '';
        return d.slice(5).replace('-', '/');
    });
    const vCounts = (data.violations_by_day || []).map(x => x.count);
    const sCounts = (data.submissions_by_day || []).map(x => x.count);

    const ctxV = $('chartViolations');
    if (ctxV) {
        chartInstances.v = new Chart(ctxV, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Violations',
                    data: vCounts,
                    fill: true,
                    tension: 0.35,
                    borderColor: '#A29BFE',
                    backgroundColor: 'rgba(162, 155, 254, 0.15)',
                    pointBackgroundColor: '#6C5CE7',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    const ctxS = $('chartSubmissions');
    if (ctxS) {
        chartInstances.s = new Chart(ctxS, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Submissions',
                    data: sCounts,
                    borderRadius: 6,
                    backgroundColor: 'rgba(0, 206, 201, 0.55)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    const buckets = data.score_buckets || {};
    const bLabels = Object.keys(buckets);
    const bVals = bLabels.map(k => buckets[k]);

    const ctxSc = $('chartScores');
    if (ctxSc) {
        chartInstances.sc = new Chart(ctxSc, {
            type: 'doughnut',
            data: {
                labels: bLabels,
                datasets: [{
                    data: bVals,
                    backgroundColor: [
                        'rgba(255,101,132,0.75)',
                        'rgba(247,151,30,0.75)',
                        'rgba(162,155,254,0.85)',
                        'rgba(0,206,201,0.85)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12 } }
                }
            }
        });
    }

    const types = data.violation_types || [];
    const tLabels = types.map(t => (t.type || '').length > 28 ? (t.type || '').slice(0, 26) + '…' : (t.type || ''));
    const tCounts = types.map(t => t.count);

    const ctxT = $('chartTypes');
    if (ctxT) {
        chartInstances.t = new Chart(ctxT, {
            type: 'bar',
            data: {
                labels: tLabels.length ? tLabels : ['No data'],
                datasets: [{
                    label: 'Count',
                    data: tCounts.length ? tCounts : [0],
                    indexAxis: 'y',
                    borderRadius: 6,
                    backgroundColor: 'rgba(108,92,231,0.65)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1 } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
}

async function loadOverview() {
    await loadDashboard();
    await loadAnalyticsCharts();
}

function violationChip(type) {
    const t = type || '';
    let chipClass = 'security';
    let icon = '⚠️';
    if (/face|Face|mask|lighting|violation/i.test(t)) {
        chipClass = 'ai';
        icon = '🤖';
    } else if (/Tab|window|fullscreen/i.test(t)) {
        chipClass = 'tab';
        icon = '🔀';
    }
    return `<span class="violation-chip ${chipClass}">${icon} ${escapeHtml(t)}</span>`;
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

async function apiDelete(url) {
    const r = await fetch(url, { method: 'DELETE' });
    return r.json();
}

async function loadViolations() {
    try {
        const response = await fetch('/admin/violations');
        const violations = await response.json();
        const tbody = $('violationsTable');

        if (violations.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <div class="icon">✅</div>
                            <p>No violations recorded</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = violations.map(v => {
            const hasEvidence = v.evidence_file;
            const evidenceCell = hasEvidence
                ? `<a class="link-evidence" href="/admin/evidence/${encodeURIComponent(v.evidence_file)}" target="_blank" rel="noopener">View image</a>`
                : `<span style="color: var(--text-muted); font-size: 13px;">—</span>`;

            return `
                <tr>
                    <td style="color: var(--text-muted);">${v.id}</td>
                    <td style="font-weight: 600; color: white;">${escapeHtml(v.student_name || '')}</td>
                    <td style="font-family: monospace; color: #a78bfa;">${escapeHtml(v.registration_number || '')}</td>
                    <td>${violationChip(v.violation_type)}</td>
                    <td style="color: var(--text-muted); font-size: 13px;">
                        ${v.timestamp ? new Date(v.timestamp).toLocaleString() : '—'}
                    </td>
                    <td>${evidenceCell}</td>
                    <td><button type="button" class="btn-danger-sm" data-delete-violation="${v.id}">Delete</button></td>
                </tr>`;
        }).join('');
    } catch (error) {
        console.error('Violations error:', error);
    }
}

async function loadStudents() {
    const tbody = $('studentsTable');
    try {
        const r = await fetch('/api/students');
        const rows = await r.json();
        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="empty-state">
                            <div class="icon">👥</div>
                            <p>No students yet</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }
        tbody.innerHTML = rows.map(s => `
            <tr>
                <td style="color: var(--text-muted);">${s.id}</td>
                <td style="font-weight: 600; color: white;">${escapeHtml(s.name)}</td>
                <td style="font-family: monospace; color: #a78bfa;">${escapeHtml(s.registration_number)}</td>
                <td style="color: var(--text-muted); font-size: 13px;">
                    ${s.login_time ? new Date(s.login_time).toLocaleString() : '—'}
                </td>
                <td><button type="button" class="btn-danger-sm" data-delete-student="${s.id}">Delete</button></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Failed to load students</td></tr>';
    }
}

async function loadResults() {
    const tbody = $('resultsTable');
    try {
        const r = await fetch('/api/results');
        const rows = await r.json();
        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <div class="icon">📝</div>
                            <p>No submissions yet</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }
        tbody.innerHTML = rows.map(x => `
            <tr>
                <td style="color: var(--text-muted);">${x.id}</td>
                <td style="font-weight: 600; color: white;">${escapeHtml(x.student_name)}</td>
                <td style="font-family: monospace; color: #a78bfa;">${escapeHtml(x.registration_number)}</td>
                <td class="score-pill">${x.score} / ${x.total}</td>
                <td style="color: var(--text-muted);">${x.percentage}%</td>
                <td style="color: var(--text-muted); font-size: 13px;">
                    ${x.submit_time ? new Date(x.submit_time).toLocaleString() : '—'}
                </td>
                <td><button type="button" class="btn-danger-sm" data-delete-result="${x.id}">Delete</button></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load results</td></tr>';
    }
}

async function refreshAll() {
    await loadOverview();
    await loadStudents();
    await loadResults();
    const active = document.querySelector('.tab-btn.active');
    if (active && active.dataset.tab === 'violations') {
        await loadViolations();
    }
}

document.querySelector('.admin-body').addEventListener('click', async (e) => {
    const bv = e.target.closest('[data-delete-violation]');
    if (bv) {
        const id = bv.getAttribute('data-delete-violation');
        if (!confirm(`Delete violation #${id}? Evidence file will be removed if present.`)) return;
        const j = await apiDelete(`/api/admin/violations/${id}`);
        if (j.success) await loadViolations();
        else alert('Delete failed');
        await loadOverview();
        return;
    }
    const bs = e.target.closest('[data-delete-student]');
    if (bs) {
        const id = bs.getAttribute('data-delete-student');
        if (!confirm(`Delete student #${id}?`)) return;
        const j = await apiDelete(`/api/admin/students/${id}`);
        if (j.success) await loadStudents();
        else alert('Delete failed');
        await loadOverview();
        return;
    }
    const br = e.target.closest('[data-delete-result]');
    if (br) {
        const id = br.getAttribute('data-delete-result');
        if (!confirm(`Delete exam result #${id}?`)) return;
        const j = await apiDelete(`/api/admin/results/${id}`);
        if (j.success) await loadResults();
        else alert('Delete failed');
        await loadOverview();
        return;
    }
});

async function postClear(url, confirmKey, promptMsg) {
    const typed = prompt(promptMsg);
    if (typed !== confirmKey) {
        if (typed != null) alert('Confirmation text did not match. No changes made.');
        return;
    }
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmKey })
    });
    const j = await r.json();
    if (!j.success) {
        alert(j.message || 'Request failed');
        return;
    }
    await refreshAll();
    if (violationsTimer) {
        await loadViolations();
    }
}

function wireClearButtons() {
    $('btnClearViolations')?.addEventListener('click', () => {
        postClear('/api/admin/violations/clear', 'CLEAR_ALL_VIOLATIONS',
            'Type CLEAR_ALL_VIOLATIONS to delete every violation and evidence files:');
    });
    $('btnViolationsClearAll')?.addEventListener('click', () => {
        postClear('/api/admin/violations/clear', 'CLEAR_ALL_VIOLATIONS',
            'Type CLEAR_ALL_VIOLATIONS to delete every violation and evidence files:');
    });
    $('btnClearStudents')?.addEventListener('click', () => {
        postClear('/api/admin/students/clear', 'CLEAR_ALL_STUDENTS',
            'Type CLEAR_ALL_STUDENTS to remove all student records:');
    });
    $('btnStudentsClearAll')?.addEventListener('click', () => {
        postClear('/api/admin/students/clear', 'CLEAR_ALL_STUDENTS',
            'Type CLEAR_ALL_STUDENTS to remove all student records:');
    });
    $('btnClearResults')?.addEventListener('click', () => {
        postClear('/api/admin/results/clear', 'CLEAR_ALL_RESULTS',
            'Type CLEAR_ALL_RESULTS to remove all exam submissions:');
    });
    $('btnResultsClearAll')?.addEventListener('click', () => {
        postClear('/api/admin/results/clear', 'CLEAR_ALL_RESULTS',
            'Type CLEAR_ALL_RESULTS to remove all exam submissions:');
    });
    $('btnPurgeAll')?.addEventListener('click', () => {
        postClear('/api/admin/purge', 'PURGE_ALL_EXAMGUARD_DATA',
            'Type PURGE_ALL_EXAMGUARD_DATA to wipe students, results, violations, and evidence:');
    });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        setTab(tab);
        if (tab === 'students') loadStudents();
        if (tab === 'results') loadResults();
    });
});

$('btnRefresh').addEventListener('click', () => {
    refreshAll();
});

wireClearButtons();

window.addEventListener('examguard-theme', () => {
    const ov = document.getElementById('panel-overview');
    if (ov && ov.classList.contains('active')) {
        loadOverview();
    }
});

loadOverview();
setTab('overview');
