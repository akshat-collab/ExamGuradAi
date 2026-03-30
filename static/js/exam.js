let video, canvas, ctx;
let monitoringInterval;
let tabSwitchCount = 0;
let screenshotAttempts = 0;

const TYPE_LABELS = { mcq: 'MCQ', short: 'Short answer', written: 'Written' };
const PRIVACY_KEY = 'examguard_privacy_accepted_v1';

const questions = [
    { id: 1, type: 'mcq', marks: 1, question: 'What is the capital of France?', options: { A: 'London', B: 'Paris', C: 'Berlin', D: 'Madrid' } },
    { id: 2, type: 'mcq', marks: 1, question: 'How many continents are there in the world?', options: { A: '5', B: '6', C: '7', D: '8' } },
    { id: 3, type: 'mcq', marks: 1, question: "Who wrote 'Romeo and Juliet'?", options: { A: 'Charles Dickens', B: 'William Shakespeare', C: 'Mark Twain', D: 'Jane Austen' } },
    { id: 4, type: 'mcq', marks: 1, question: 'What is the largest ocean on Earth?', options: { A: 'Pacific Ocean', B: 'Atlantic Ocean', C: 'Indian Ocean', D: 'Arctic Ocean' } },
    { id: 5, type: 'mcq', marks: 1, question: 'What is the capital of Australia?', options: { A: 'Sydney', B: 'Melbourne', C: 'Canberra', D: 'Brisbane' } },
    { id: 6, type: 'mcq', marks: 1, question: 'What is the chemical formula for water?', options: { A: 'CO₂', B: 'H₂O', C: 'NaCl', D: 'O₂' } },
    { id: 7, type: 'mcq', marks: 1, question: 'Which planet is known as the Red Planet?', options: { A: 'Mars', B: 'Venus', C: 'Jupiter', D: 'Saturn' } },
    { id: 8, type: 'mcq', marks: 1, question: 'What does CPU stand for?', options: { A: 'Central Program Unit', B: 'Central Processing Unit', C: 'Computer Personal Unit', D: 'Core Processing Utility' } },
    {
        id: 9,
        type: 'short',
        marks: 2,
        question: 'In 2–4 sentences, define photosynthesis and name one essential input and one output.',
        placeholder: 'Type your short answer here…',
        maxLength: 800,
        rows: 5
    },
    {
        id: 10,
        type: 'short',
        marks: 2,
        question: 'Briefly explain the difference between RAM and ROM (2–5 sentences).',
        placeholder: 'Type your short answer here…',
        maxLength: 800,
        rows: 5
    },
    {
        id: 11,
        type: 'written',
        marks: 5,
        question: 'Written response: Discuss why renewable energy matters for sustainable development. Include examples, challenges, and your own conclusion (aim for at least ~150 words).',
        placeholder: 'Write your full response here. This item is graded by your instructor, not automatically.',
        maxLength: 6000,
        rows: 14
    }
];

let currentQuestion = 0;
let answers = {};

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function isExamAnswerField(el) {
    return el && el.closest && el.closest('textarea.exam-text-input');
}

function isQuestionAnswered(q) {
    const a = answers[q.id];
    if (a === undefined || a === null) return false;
    if (q.type === 'mcq') return String(a).length > 0;
    return String(a).trim().length > 0;
}

function loadQuestion(index) {
    const q = questions[index];
    const content = document.getElementById('questionContent');
    const marksEl = document.querySelector('.q-marks');

    if (marksEl) {
        marksEl.textContent = q.type === 'mcq'
            ? `${q.marks} mark(s) · auto-graded`
            : `${q.marks} mark(s) · instructor review`;
    }

    if (q.type === 'mcq') {
        content.innerHTML = `
        <p class="question-text">${escapeHtml(q.question)}</p>
        <div class="options-grid">
            ${Object.entries(q.options).map(([key, value]) => `
                <label class="option-label">
                    <input type="radio" name="answer" value="${key}"
                           ${answers[q.id] === key ? 'checked' : ''}
                           onchange="saveAnswer(${q.id}, '${key}')">
                    <div class="option-box">
                        <div class="option-key">${key}</div>
                        <div class="option-text">${escapeHtml(value)}</div>
                    </div>
                </label>
            `).join('')}
        </div>
    `;
    } else {
        const cls = q.type === 'written' ? 'exam-text-input written-field' : 'exam-text-input';
        const hint = q.type === 'written'
            ? '<p class="text-hint">Structured paragraphs encouraged. Suggested minimum ≈150 words. Word count updates as you type.</p>'
            : '<p class="text-hint">Answer in a few clear sentences. Maximum length is enforced.</p>';
        const wc = q.type === 'written' ? '<p class="text-hint" id="wordCountLine">Words: 0</p>' : '';
        content.innerHTML = `
        <p class="question-text">${escapeHtml(q.question)}</p>
        ${hint}
        <textarea class="${cls}" id="textAnswerField" maxlength="${q.maxLength}" rows="${q.rows}" placeholder="${escapeAttr(q.placeholder)}"></textarea>
        ${wc}
    `;
        const ta = document.getElementById('textAnswerField');
        ta.value = answers[q.id] || '';
        const sync = () => {
            saveAnswer(q.id, ta.value);
            if (q.type === 'written') {
                const line = document.getElementById('wordCountLine');
                if (line) {
                    const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
                    line.textContent = `Words: ${n}`;
                }
            }
        };
        ta.addEventListener('input', sync);
        sync();
    }

    document.getElementById('qBadge').textContent = `${TYPE_LABELS[q.type]} · Q ${index + 1} / ${questions.length}`;
    document.getElementById('prevBtn').disabled = index === 0;
    document.getElementById('nextBtn').style.display = index === questions.length - 1 ? 'none' : 'inline-block';
    document.getElementById('submitBtn').style.display = index === questions.length - 1 ? 'inline-block' : 'none';

    document.querySelectorAll('.q-nav-btn').forEach((btn, i) => {
        btn.className = `q-nav-btn q-type-${questions[i].type}`;
        if (i === index) btn.classList.add('current');
        else if (isQuestionAnswered(questions[i])) btn.classList.add('answered');
    });

    updateProgress();
}

function buildNavigator() {
    const nav = document.getElementById('qNavigator');
    nav.innerHTML = questions.map((q, i) => `
        <button type="button" class="q-nav-btn q-type-${q.type} ${i === 0 ? 'current' : ''}"
                onclick="jumpTo(${i})" title="${TYPE_LABELS[q.type]}">${i + 1}</button>
    `).join('');
}

function jumpTo(index) {
    currentQuestion = index;
    loadQuestion(index);
}

function updateProgress() {
    const answered = questions.filter(isQuestionAnswered).length;
    document.getElementById('answeredCount').textContent = answered;
    document.getElementById('progressBar').style.width = `${(answered / questions.length) * 100}%`;
}

function clearAnswer() {
    const q = questions[currentQuestion];
    delete answers[q.id];
    loadQuestion(currentQuestion);
}

function saveAnswer(questionId, answer) {
    answers[questionId] = answer;
}

function nextQuestion() {
    if (currentQuestion < questions.length - 1) {
        currentQuestion++;
        loadQuestion(currentQuestion);
    }
}

function previousQuestion() {
    if (currentQuestion > 0) {
        currentQuestion--;
        loadQuestion(currentQuestion);
    }
}

async function submitExam(skipConfirm = false) {
    if (!skipConfirm && !confirm('Are you sure you want to submit the exam? You cannot change answers after submission.')) {
        return;
    }

    try {
        const response = await fetch('/submit_exam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });

        const result = await response.json();

        if (result.success) {
            localStorage.setItem('examResult', JSON.stringify(result));
            closeModal('submitModal');
            closeModal('endModal');
            window.location.href = '/result';
        } else {
            alert('Error submitting exam. Please try again.');
        }
    } catch (error) {
        console.error('Submit error:', error);
        alert('Error submitting exam. Please try again.');
    }
}

document.addEventListener('contextmenu', e => {
    if (isExamAnswerField(e.target)) return;
    e.preventDefault();
    logSecurityViolation('Right-click menu attempted');
    showWarning('Right-click is disabled during exam');
});

document.addEventListener('copy', e => {
    if (isExamAnswerField(e.target)) return;
    e.preventDefault();
    logSecurityViolation('Copy operation attempted');
    showWarning('Copying is disabled during exam');
});

document.addEventListener('paste', e => {
    if (isExamAnswerField(e.target)) return;
    e.preventDefault();
    logSecurityViolation('Paste operation attempted');
    showWarning('Pasting is disabled during exam');
});

document.addEventListener('cut', e => {
    if (isExamAnswerField(e.target)) return;
    e.preventDefault();
    logSecurityViolation('Cut operation attempted');
    showWarning('Cutting is disabled during exam');
});

document.addEventListener('keydown', e => {
    if (isExamAnswerField(e.target)) {
        if (e.ctrlKey && ['c', 'v', 'a', 'x', 's', 'p'].includes(e.key.toLowerCase())) return;
    }
    if (e.ctrlKey && ['c', 'v', 'a', 'x', 's', 'p'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        logSecurityViolation(`Keyboard shortcut attempted: Ctrl+${e.key.toUpperCase()}`);
        showWarning('Keyboard shortcuts are disabled');
    }

    if (e.key === 'PrintScreen' || e.key === 'F12') {
        e.preventDefault();
        screenshotAttempts++;
        logSecurityViolation('Screenshot attempt detected (PrintScreen key)');
        showWarning('Screenshots are not allowed');

        if (screenshotAttempts >= 2) {
            showAlert('Multiple screenshot attempts detected. This has been reported.');
        }
    }

    if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        logSecurityViolation('Alt+Tab pressed - attempted to switch windows');
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        tabSwitchCount++;
        logSecurityViolation(`Tab switching detected (Count: ${tabSwitchCount})`);
        showWarning('Tab switching detected! Stay on exam screen');

        if (tabSwitchCount >= 2) {
            showAlert('Multiple tab switches detected. Your activity has been reported to the administrator.');
        }
    }
});

window.addEventListener('blur', () => {
    logSecurityViolation('Window focus lost - student switched to another application');
    showWarning('Please stay focused on the exam window');
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        logSecurityViolation('Exited fullscreen mode');
        showWarning('Please remain in fullscreen mode');
    }
});

async function logSecurityViolation(violationType) {
    try {
        await fetch('/log_security_violation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ violation_type: violationType })
        });
    } catch (error) {
        console.error('Failed to log violation:', error);
    }
}

async function initWebcam() {
    try {
        video = document.getElementById('webcam');
        canvas = document.getElementById('canvas');
        ctx = canvas.getContext('2d');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });
        video.srcObject = stream;

        canvas.width = 640;
        canvas.height = 480;

        startMonitoring();
    } catch (error) {
        alert('Camera access required for exam');
    }
}

let consecutiveNoFace = 0;
let consecutiveMultipleFaces = 0;
let lastAlertTime = 0;

function startMonitoring() {
    monitoringInterval = setInterval(async () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg', 0.8);

        try {
            const response = await fetch('/detect_cheating', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frame: frameData })
            });

            const result = await response.json();

            document.getElementById('statFaces').textContent = result.faces ?? '—';
            document.getElementById('statPose').textContent = result.head_pose ? result.head_pose.replace('looking_', '') : '—';
            document.getElementById('statLight').textContent = result.lighting ?? '—';
            document.getElementById('statMask').textContent = result.wearing_mask ? 'Yes ⚠️' : 'No ✓';

            const overlay = document.getElementById('webcamOverlay');
            const badge = document.getElementById('detectionBadge');

            if (result.faces === 1 && !result.wearing_mask && result.head_pose === 'looking_forward') {
                overlay.className = 'webcam-overlay';
                badge.style.color = '#43e97b';
                badge.textContent = '✓ 1 Face — Normal';
            } else if (result.faces === 0) {
                overlay.className = 'webcam-overlay danger';
                badge.style.color = '#ff6584';
                badge.textContent = '⚠ No Face Detected';
            } else if (result.faces > 1) {
                overlay.className = 'webcam-overlay danger';
                badge.style.color = '#ff6584';
                badge.textContent = `⚠ ${result.faces} Faces Detected`;
            } else {
                overlay.className = 'webcam-overlay warning';
                badge.style.color = '#f7971e';
                badge.textContent = `⚠ ${result.head_pose || 'Check Pose'}`;
            }

            if (result.faces === 0) {
                consecutiveNoFace++;
                consecutiveMultipleFaces = 0;
                if (consecutiveNoFace >= 5) {
                    triggerAlert(result.type);
                    consecutiveNoFace = 0;
                }
            } else if (result.faces > 1) {
                consecutiveMultipleFaces++;
                consecutiveNoFace = 0;
                if (consecutiveMultipleFaces >= 4) {
                    triggerAlert(result.type);
                    consecutiveMultipleFaces = 0;
                }
            } else {
                consecutiveNoFace = 0;
                consecutiveMultipleFaces = 0;
            }
        } catch (error) {
            console.error('Monitoring error:', error);
        }
    }, 3000);
}

function triggerAlert(violationType) {
    const now = Date.now();
    if (now - lastAlertTime < 30000) return;
    lastAlertTime = now;
    showAlert(violationType);
}

function showWarning(message) {
    const banner = document.getElementById('warningBanner');
    banner.textContent = '⚠️ ' + message;
    banner.style.display = 'block';
    setTimeout(() => { banner.style.display = 'none'; }, 5000);
}

function showAlert(violationType) {
    document.getElementById('alertMessage').textContent =
        `${violationType}. Your activity has been recorded and reported to the administrator.`;
    document.getElementById('alertModal').classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function confirmSubmit() {
    document.getElementById('submitAnsweredCount').textContent = questions.filter(isQuestionAnswered).length;
    const st = document.getElementById('submitQTotal');
    if (st) st.textContent = questions.length;
    document.getElementById('submitModal').classList.add('active');
}

function confirmEndTest() {
    document.getElementById('endModal').classList.add('active');
}

let timeLeft = 3600;
function startTimer() {
    setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        document.getElementById('timer').textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const display = document.getElementById('timerDisplay');
        if (timeLeft <= 300) display.className = 'timer-display danger';
        else if (timeLeft <= 600) display.className = 'timer-display warning';

        if (timeLeft <= 0) submitExam(true);
    }, 1000);
}

function updatePrivacyBeginState() {
    const ids = ['privacy-cam', 'privacy-ai', 'privacy-behaviour', 'privacy-answers', 'privacy-accurate'];
    const all = ids.every(id => document.getElementById(id).checked);
    document.getElementById('btnBeginExam').disabled = !all;
}

function startExamSession() {
    document.getElementById('privacyGate').style.display = 'none';
    document.getElementById('examShell').style.display = 'block';

    const qt = document.getElementById('qTotal');
    if (qt) qt.textContent = questions.length;
    buildNavigator();
    loadQuestion(0);
    initWebcam();
    startTimer();
}

function setupPrivacyGate() {
    if (sessionStorage.getItem(PRIVACY_KEY) === '1') {
        startExamSession();
        return;
    }

    const ids = ['privacy-cam', 'privacy-ai', 'privacy-behaviour', 'privacy-answers', 'privacy-accurate'];
    ids.forEach(id => {
        document.getElementById(id).addEventListener('change', updatePrivacyBeginState);
    });

    document.getElementById('btnBeginExam').addEventListener('click', () => {
        sessionStorage.setItem(PRIVACY_KEY, '1');
        startExamSession();
    });
}

window.onload = () => {
    setupPrivacyGate();
};
