# Google Calendar OAuth 2.0 Integration Setup Guide

The platform syncs confirmed medical appointments directly into Google Calendar via Google Calendar API v3.

---

## 1. Google Cloud Console Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named `MedPulse-AI-Calendar-Sync`.
3. Enable the **Google Calendar API**.
4. Go to **APIs & Services > Credentials**.
5. Click **Create Credentials > OAuth client ID**.
6. Set Application type to **Web application**.
7. Add Authorized redirect URI:
   `http://localhost:8001/api/auth/google/callback`
8. Copy the generated Client ID and Client Secret.

---

## 2. Environment Configuration

Add the credentials to your `.env` file:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8001/api/auth/google/callback
```

---

## 3. OAuth Flow Architecture & Fallback Mode

If no Google credentials are provided in `.env`, the system automatically enters **Simulation Mode**:
- Generating auth URL returns a simulated callback URL.
- Creating event logs a simulated calendar event ID (`sim_gcal_evt_...`).
- Deleting or updating events operates gracefully without raising network exceptions.
