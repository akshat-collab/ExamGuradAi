# Email Configuration Guide

## How to Enable Automated Email Alerts

The system sends automated emails to `amey4046@gmail.com` when cheating is detected.

### Step 1: Get Gmail App Password

1. Go to your Google Account: https://myaccount.google.com/
2. Click on **Security** (left sidebar)
3. Enable **2-Step Verification** if not already enabled
4. Scroll down to **App passwords**
5. Click **App passwords**
6. Select app: **Mail**
7. Select device: **Windows Computer** (or Other)
8. Click **Generate**
9. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### Step 2: Update app.py

Open `app.py` and find lines 91-93:

```python
sender_email = "your-email@gmail.com"  # Your Gmail address
sender_password = "your-app-password"  # Gmail App Password
receiver_email = "amey4046@gmail.com"
```

Replace with your actual values:

```python
sender_email = "youremail@gmail.com"  # Your actual Gmail
sender_password = "abcdefghijklmnop"  # The 16-char app password (no spaces)
receiver_email = "amey4046@gmail.com"  # Already correct
```

### Step 3: Restart the Server

Stop the server (Ctrl+C) and run again:
```bash
python app.py
```

### Testing Email

When a violation is detected, you'll see in the console:
- ✅ Email sent successfully to amey4046@gmail.com
- OR ❌ Email error: [error message]

### Troubleshooting

**Error: "Username and Password not accepted"**
- Make sure you're using App Password, not your regular Gmail password
- Remove any spaces from the app password

**Error: "SMTPAuthenticationError"**
- Enable 2-Step Verification first
- Generate a new App Password

**No email received**
- Check spam/junk folder
- Verify sender_email is correct
- Check console for error messages
