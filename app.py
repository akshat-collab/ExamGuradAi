import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(_ROOT / '.env')
except ImportError:
    pass

from flask import Flask, render_template, request, jsonify, session, send_file, redirect, abort, Response
from flask_cors import CORS
import cv2
import numpy as np
import base64
import json
import csv
import io
from datetime import datetime, timedelta
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import sqlite3
import threading
from werkzeug.utils import secure_filename
from advanced_detector import get_detector

app = Flask(__name__)
app.secret_key = (
    os.environ.get('EXAMGUARD_SECRET_KEY')
    or os.environ.get('SECRET_KEY')
    or 'dev-only-change-in-production'
)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exam_system.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS students
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  registration_number TEXT UNIQUE NOT NULL,
                  login_time TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS violations
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  student_name TEXT,
                  registration_number TEXT,
                  violation_type TEXT,
                  timestamp TIMESTAMP,
                  video_path TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS exam_results
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  student_name TEXT,
                  registration_number TEXT,
                  score INTEGER,
                  total INTEGER,
                  answers TEXT,
                  submit_time TIMESTAMP)''')
    conn.commit()
    conn.close()


init_db()

# Answer key — keep in sync with static/js/exam.js
CORRECT_ANSWERS = {
    '1': 'B', '2': 'C', '3': 'B', '4': 'A', '5': 'C',
    '6': 'B', '7': 'A', '8': 'B',
}


def _email_config():
    sender = (
        os.environ.get('EXAMGUARD_EMAIL')
        or os.environ.get('SENDER_EMAIL')
        or ''
    ).strip()
    password = (
        os.environ.get('EXAMGUARD_EMAIL_PASSWORD')
        or os.environ.get('SENDER_PASSWORD')
        or ''
    ).strip()
    receiver = (
        os.environ.get('EXAMGUARD_ALERT_EMAIL')
        or os.environ.get('RECEIVER_EMAIL')
        or sender
    ).strip()
    return sender, password, receiver


def _send_email(msg, sender_email, sender_password):
    if not sender_email or not sender_password:
        print(
            'Email skipped: add .env with SENDER_EMAIL / SENDER_PASSWORD '
            '(or EXAMGUARD_EMAIL / EXAMGUARD_EMAIL_PASSWORD), then restart.'
        )
        return
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(sender_email, sender_password)
    server.send_message(msg)
    server.quit()


_se, _pw, _ = _email_config()
if not _se or not _pw:
    print(
        '[ExamGuard] Email alerts are OFF. Create .env with SENDER_EMAIL and '
        'SENDER_PASSWORD (Gmail app password), or use EXAMGUARD_* names — see .env.example.'
    )


def _delete_evidence_file(video_path):
    if not video_path or video_path == 'N/A':
        return
    fn = secure_filename(os.path.basename(str(video_path)))
    if not fn:
        return
    base = os.path.abspath('violations')
    full = os.path.abspath(os.path.join(base, fn))
    if full.startswith(base) and os.path.isfile(full):
        try:
            os.remove(full)
        except OSError:
            pass


@app.route('/')
def index():
    return render_template('home.html')


@app.route('/student')
def student_login_page():
    return render_template('login.html')


@app.route('/test')
def test_detection():
    return render_template('test_detection.html')


@app.route('/login', methods=['POST'])
def login():
    data = request.json
    name = data.get('name')
    reg_number = data.get('registration_number')

    if not name or not reg_number:
        return jsonify({'success': False, 'message': 'All fields required'})

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT * FROM students WHERE registration_number = ?', (reg_number,))
    existing_student = c.fetchone()

    if existing_student:
        c.execute('UPDATE students SET name = ?, login_time = ? WHERE registration_number = ?',
                  (name, datetime.now(), reg_number))
        conn.commit()
        session['student_name'] = name
        session['registration_number'] = reg_number
        conn.close()
        return jsonify({'success': True, 'message': 'Welcome back!'})
    try:
        c.execute('INSERT INTO students (name, registration_number, login_time) VALUES (?, ?, ?)',
                  (name, reg_number, datetime.now()))
        conn.commit()
        session['student_name'] = name
        session['registration_number'] = reg_number
        conn.close()
        return jsonify({'success': True})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'message': 'Database error. Please try again.'})


@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/exam')
def exam():
    if 'student_name' not in session:
        return redirect('/student')
    return render_template('exam.html')


@app.route('/detect_cheating', methods=['POST'])
def detect_cheating():
    data = request.json
    frame_data = data.get('frame')

    if not frame_data:
        return jsonify({'cheating': False, 'faces': 1})

    try:
        img_data = base64.b64decode(frame_data.split(',')[1])
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        detector = get_detector()
        results = detector.comprehensive_check(frame)

        cheating_detected = len(results['violations']) > 0
        violation_type = ' | '.join(results['violations']) if results['violations'] else None

        print(f"[DETECTION] Faces: {results['face_count']}, "
              f"Pose: {results['head_pose']}, "
              f"Lighting: {results['lighting']}, "
              f"Mask: {results['wearing_mask']}")

        if cheating_detected:
            print(f"[VIOLATION] {violation_type}")
            log_violation(
                session.get('student_name'),
                session.get('registration_number'),
                violation_type,
                frame
            )

        return jsonify({
            'cheating': cheating_detected,
            'type': violation_type,
            'faces': results['face_count'],
            'head_pose': results['head_pose'],
            'lighting': results['lighting'],
            'wearing_mask': results['wearing_mask'],
            'details': results
        })
    except Exception as e:
        print(f"[ERROR] Detection error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'cheating': False, 'faces': 1, 'error': str(e)})


def log_violation(name, reg_number, violation_type, frame):
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    video_dir = 'violations'
    os.makedirs(video_dir, exist_ok=True)

    video_path = f'{video_dir}/{reg_number}_{timestamp}.jpg'
    cv2.imwrite(video_path, frame)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'INSERT INTO violations (student_name, registration_number, violation_type, timestamp, video_path) VALUES (?, ?, ?, ?, ?)',
        (name, reg_number, violation_type, datetime.now(), video_path))
    conn.commit()
    conn.close()

    threading.Thread(
        target=send_alert_email,
        args=(name, reg_number, violation_type, timestamp, video_path)
    ).start()


def send_alert_email(name, reg_number, violation_type, timestamp, video_path):
    try:
        sender_email, sender_password, receiver_email = _email_config()
        if not receiver_email:
            print('Email skipped: set EXAMGUARD_ALERT_EMAIL or EXAMGUARD_EMAIL')
            return

        msg = MIMEMultipart()
        msg['From'] = sender_email or 'noreply@examguard.local'
        msg['To'] = receiver_email
        msg['Subject'] = f'EXAM ALERT: Cheating Detected - {reg_number}'

        body = f"""
Cheating alert — review required

Student Name: {name}
Registration Number: {reg_number}
Violation Type: {violation_type}
Timestamp: {timestamp}

Evidence is attached if email is configured.

---
ExamGuard AI
"""
        msg.attach(MIMEText(body, 'plain'))

        if os.path.exists(video_path):
            with open(video_path, 'rb') as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename={os.path.basename(video_path)}'
                )
                msg.attach(part)

        _send_email(msg, sender_email, sender_password)
        print(f'Alert email sent to {receiver_email}')
    except Exception as e:
        print(f'Email error: {e}')


@app.route('/submit_exam', methods=['POST'])
def submit_exam():
    data = request.json
    answers = data.get('answers', {})

    name = session.get('student_name', 'Unknown')
    reg_number = session.get('registration_number', 'Unknown')

    total = len(CORRECT_ANSWERS)
    score = 0
    for q_id, correct in CORRECT_ANSWERS.items():
        if answers.get(q_id) == correct:
            score += 1

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'INSERT INTO exam_results (student_name, registration_number, score, total, answers, submit_time) VALUES (?, ?, ?, ?, ?, ?)',
        (name, reg_number, score, total, json.dumps(answers), datetime.now()))
    conn.commit()
    conn.close()

    pct = round((score / total) * 100, 2) if total else 0
    mcq_ids = set(CORRECT_ANSWERS.keys())
    has_open_ended = any(
        (k not in mcq_ids) and str(answers.get(k, '')).strip()
        for k in answers
    )
    return jsonify({
        'success': True,
        'score': score,
        'total': total,
        'percentage': pct,
        'has_open_ended': bool(has_open_ended),
    })


@app.route('/result')
def result():
    if 'student_name' not in session:
        return redirect('/student')
    return render_template('result.html')


@app.route('/admin')
def admin_page():
    return render_template('admin.html')


@app.route('/api/health')
def api_health():
    ok_db = os.path.isfile(DB_PATH)
    return jsonify({
        'status': 'ok' if ok_db else 'degraded',
        'service': 'ExamGuard AI',
        'database': ok_db,
        'time': datetime.utcnow().isoformat() + 'Z',
    })


@app.route('/api/dashboard')
def api_dashboard():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM students')
    n_students = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM violations')
    n_violations = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM exam_results')
    n_results = c.fetchone()[0]
    c.execute('SELECT AVG(score), MAX(score), MIN(score) FROM exam_results')
    row = c.fetchone()
    avg_score = round(row[0], 2) if row[0] is not None else None
    conn.close()
    return jsonify({
        'students': n_students,
        'violations': n_violations,
        'exam_submissions': n_results,
        'avg_score': avg_score,
        'max_score': row[1],
        'min_score': row[2],
    })


@app.route('/api/students')
def api_students():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id, name, registration_number, login_time FROM students ORDER BY login_time DESC')
    rows = c.fetchall()
    conn.close()
    return jsonify([
        {
            'id': r[0],
            'name': r[1],
            'registration_number': r[2],
            'login_time': r[3],
        }
        for r in rows
    ])


@app.route('/api/results')
def api_results():
    conn = get_db()
    c = conn.cursor()
    c.execute(
        'SELECT id, student_name, registration_number, score, total, submit_time FROM exam_results ORDER BY submit_time DESC LIMIT 200'
    )
    rows = c.fetchall()
    conn.close()
    out = []
    for r in rows:
        pct = round((r[3] / r[4]) * 100, 2) if r[4] else 0
        out.append({
            'id': r[0],
            'student_name': r[1],
            'registration_number': r[2],
            'score': r[3],
            'total': r[4],
            'percentage': pct,
            'submit_time': r[5],
        })
    return jsonify(out)


@app.route('/api/admin/analytics')
def api_admin_analytics():
    conn = get_db()
    c = conn.cursor()
    end = datetime.utcnow().date()
    start = end - timedelta(days=13)
    days = [(start + timedelta(days=i)).isoformat() for i in range(14)]

    v_daily = {d: 0 for d in days}
    c.execute('SELECT timestamp FROM violations')
    for row in c.fetchall():
        ts = row[0]
        if not ts:
            continue
        d = str(ts)[:10]
        if d in v_daily:
            v_daily[d] += 1

    s_daily = {d: 0 for d in days}
    c.execute('SELECT submit_time FROM exam_results')
    for row in c.fetchall():
        ts = row[0]
        if not ts:
            continue
        d = str(ts)[:10]
        if d in s_daily:
            s_daily[d] += 1

    violations_series = [{'date': d, 'count': v_daily[d]} for d in days]
    submissions_series = [{'date': d, 'count': s_daily[d]} for d in days]

    c.execute('SELECT score, total FROM exam_results')
    buckets = {'0–25%': 0, '26–50%': 0, '51–75%': 0, '76–100%': 0}
    for score, total in c.fetchall():
        if not total:
            continue
        p = (score / total) * 100
        if p <= 25:
            buckets['0–25%'] += 1
        elif p <= 50:
            buckets['26–50%'] += 1
        elif p <= 75:
            buckets['51–75%'] += 1
        else:
            buckets['76–100%'] += 1

    c.execute(
        'SELECT violation_type, COUNT(*) FROM violations GROUP BY violation_type ORDER BY COUNT(*) DESC LIMIT 12'
    )
    top_types = [{'type': (t or 'Unknown')[:80], 'count': n} for t, n in c.fetchall()]
    conn.close()

    return jsonify({
        'violations_by_day': violations_series,
        'submissions_by_day': submissions_series,
        'score_buckets': buckets,
        'violation_types': top_types,
    })


@app.route('/api/admin/students/<int:row_id>', methods=['DELETE'])
def admin_delete_student(row_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM students WHERE id = ?', (row_id,))
    conn.commit()
    n = c.rowcount
    conn.close()
    return jsonify({'success': n > 0})


@app.route('/api/admin/results/<int:row_id>', methods=['DELETE'])
def admin_delete_result(row_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM exam_results WHERE id = ?', (row_id,))
    conn.commit()
    n = c.rowcount
    conn.close()
    return jsonify({'success': n > 0})


@app.route('/api/admin/violations/<int:row_id>', methods=['DELETE'])
def admin_delete_violation(row_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT video_path FROM violations WHERE id = ?', (row_id,))
    row = c.fetchone()
    if row and row[0]:
        _delete_evidence_file(row[0])
    c.execute('DELETE FROM violations WHERE id = ?', (row_id,))
    conn.commit()
    n = c.rowcount
    conn.close()
    return jsonify({'success': n > 0})


@app.route('/api/admin/purge', methods=['POST'])
def admin_purge_all():
    data = request.json or {}
    if data.get('confirm') != 'PURGE_ALL_EXAMGUARD_DATA':
        return jsonify({'success': False, 'message': 'Invalid confirmation string'}), 400
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT DISTINCT video_path FROM violations')
    for (vp,) in c.fetchall():
        _delete_evidence_file(vp)
    c.execute('DELETE FROM violations')
    c.execute('DELETE FROM exam_results')
    c.execute('DELETE FROM students')
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/admin/violations/clear', methods=['POST'])
def admin_clear_violations_table():
    if (request.json or {}).get('confirm') != 'CLEAR_ALL_VIOLATIONS':
        return jsonify({'success': False, 'message': 'Invalid confirmation'}), 400
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT DISTINCT video_path FROM violations')
    for (vp,) in c.fetchall():
        _delete_evidence_file(vp)
    c.execute('DELETE FROM violations')
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/admin/students/clear', methods=['POST'])
def admin_clear_students_table():
    if (request.json or {}).get('confirm') != 'CLEAR_ALL_STUDENTS':
        return jsonify({'success': False, 'message': 'Invalid confirmation'}), 400
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM students')
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/admin/results/clear', methods=['POST'])
def admin_clear_results_table():
    if (request.json or {}).get('confirm') != 'CLEAR_ALL_RESULTS':
        return jsonify({'success': False, 'message': 'Invalid confirmation'}), 400
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM exam_results')
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/admin/violations')
def get_violations():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT * FROM violations ORDER BY timestamp DESC')
    violations = c.fetchall()
    conn.close()

    def evidence_name(path):
        if not path or path == 'N/A':
            return None
        return os.path.basename(path)

    return jsonify([{
        'id': v[0],
        'student_name': v[1],
        'registration_number': v[2],
        'violation_type': v[3],
        'timestamp': v[4],
        'video_path': v[5],
        'evidence_file': evidence_name(v[5]),
    } for v in violations])


@app.route('/admin/evidence/<filename>')
def admin_evidence(filename):
    fn = secure_filename(filename)
    if not fn:
        abort(404)
    base = os.path.abspath('violations')
    full = os.path.abspath(os.path.join(base, fn))
    if not full.startswith(base) or not os.path.isfile(full):
        abort(404)
    return send_file(full, mimetype='image/jpeg')


@app.route('/api/export/violations.csv')
def export_violations_csv():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, student_name, registration_number, violation_type, timestamp, video_path FROM violations ORDER BY timestamp DESC')
    rows = c.fetchall()
    conn.close()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['id', 'student_name', 'registration_number', 'violation_type', 'timestamp', 'video_path'])
    w.writerows(rows)
    return Response(
        buf.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=violations_export.csv'}
    )


@app.route('/log_security_violation', methods=['POST'])
def log_security_violation():
    data = request.json
    violation_type = data.get('violation_type')

    if not violation_type:
        return jsonify({'success': False})

    name = session.get('student_name', 'Unknown')
    reg_number = session.get('registration_number', 'Unknown')

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'INSERT INTO violations (student_name, registration_number, violation_type, timestamp, video_path) VALUES (?, ?, ?, ?, ?)',
        (name, reg_number, violation_type, datetime.now(), 'N/A'))
    conn.commit()
    conn.close()

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    threading.Thread(
        target=send_security_alert_email,
        args=(name, reg_number, violation_type, timestamp)
    ).start()

    print(f"[SECURITY VIOLATION] {name} ({reg_number}): {violation_type}")

    return jsonify({'success': True})


def send_security_alert_email(name, reg_number, violation_type, timestamp):
    try:
        sender_email, sender_password, receiver_email = _email_config()
        if not receiver_email:
            return

        msg = MIMEMultipart()
        msg['From'] = sender_email or 'noreply@examguard.local'
        msg['To'] = receiver_email
        msg['Subject'] = f'SECURITY ALERT: {violation_type} - {reg_number}'

        body = f"""
Security violation detected

Student Name: {name}
Registration Number: {reg_number}
Violation Type: {violation_type}
Timestamp: {timestamp}

---
ExamGuard AI
"""
        msg.attach(MIMEText(body, 'plain'))
        _send_email(msg, sender_email, sender_password)
        print(f'Security alert email sent to {receiver_email}')
    except Exception as e:
        print(f'Email error: {e}')


@app.route('/api/session/ping', methods=['POST'])
def session_ping():
    """Lightweight heartbeat for future live-presence features."""
    if 'student_name' not in session:
        return jsonify({'ok': False}), 401
    return jsonify({'ok': True, 'registration_number': session.get('registration_number')})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
