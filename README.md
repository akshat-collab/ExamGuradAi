# AI-Based Online Exam Malpractice Detection System

A comprehensive exam monitoring platform with AI-powered cheating detection, security controls, and automated alerting.

## Features

- Student login with registration tracking
- Real-time AI monitoring using computer vision
- Multiple face detection
- Tab switching detection
- Copy/paste/screenshot blocking
- Automated email alerts to administrators
- Admin dashboard with violation logs
- Professional, responsive UI

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. **Email alerts (optional):** copy `.env.example` to **`.env`** in the project root (`.env` is gitignored). You can use either naming style:

```env
SENDER_EMAIL=your@gmail.com
SENDER_PASSWORD=your-gmail-app-password
RECEIVER_EMAIL=admin@gmail.com
SECRET_KEY=long-random-string-for-sessions
```

Or the `EXAMGUARD_EMAIL`, `EXAMGUARD_EMAIL_PASSWORD`, and `EXAMGUARD_ALERT_EMAIL` variables instead.

Alternatively, `export` those variables in your shell before `python app.py`.

Use a [Google App Password](https://myaccount.google.com/apppasswords) (requires 2-Step Verification). Normal Gmail passwords usually fail SMTP login.

## Running the Application

```bash
python app.py
```

Access the application:
- Student Login: http://localhost:5000
- Admin Dashboard: http://localhost:5000/admin

## Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Flask (Python)
- AI: MediaPipe, OpenCV
- Database: SQLite
- Email: SMTP

## Security Features

- Disabled copy/paste/cut operations
- Right-click menu blocked
- Keyboard shortcuts disabled
- Tab switching detection
- Screenshot prevention
- Window focus monitoring

## AI Monitoring

The system detects:
- Multiple faces in frame
- No face detected
- Student leaving camera view
- Suspicious behavior patterns

## Admin Features

- Real-time violation monitoring
- Student activity logs
- Evidence storage
- Email notifications
