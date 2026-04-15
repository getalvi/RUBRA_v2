# RUBRA v5 — Complete Setup Guide

## Folder Structure
```
rubra-final/
├── backend/
│   ├── app.py          ← ENTIRE backend in ONE file (run this)
│   ├── requirements.txt
│   └── start.bat       ← Windows double-click launch
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── start.bat       ← Windows double-click launch
    └── src/
        ├── main.jsx
        ├── index.css
        ├── App.jsx
        ├── api/client.js
        ├── hooks/useChat.js
        └── components/
            ├── TopBar.jsx
            ├── Sidebar.jsx
            ├── ChatArea.jsx
            ├── Message.jsx
            └── InputBar.jsx
```

## Quick Start

### Step 1 — Install backend deps
```cmd
cd backend
pip install -r requirements.txt
```

### Step 2 — Start backend
```cmd
python app.py
```
You should see:
```
==================================================
  RUBRA v5 — Backend
  API  : http://localhost:8000
  Docs : http://localhost:8000/docs
==================================================
INFO: Application startup complete.
```

### Step 3 — Install frontend deps
```cmd
cd frontend
rmdir /s /q node_modules
del package-lock.json
npm install
```

### Step 4 — Start frontend
```cmd
npm run dev
```

### Step 5 — Open browser
```
http://localhost:3000
```

---

## What RUBRA can do

| Ask naturally... | Agent | Model |
|---|---|---|
| "weather in tokyo" | SearchAgent | GLM-4.7 + Open-Meteo |
| "bitcoin price" | SearchAgent | GLM-4.7 + CoinGecko |
| "write python scraper" | CodingAgent | GLM-4.7 coding endpoint |
| "explain transformers" | GeneralAgent | GLM-4.7 + Wikipedia |
| "research papers on LLMs" | SearchAgent | GLM-4.7 + arXiv |
| upload PDF/Excel/CSV | FileAgent | GLM-4.7 |
| "hello!" | FastChatAgent | GLM-4.7-flash |

All powered by Z.AI GLM-4.7 with Groq fallback.