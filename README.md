# 🍕 Olive Pizza POS — High-Speed Restaurant Billing & Thermal Printing Terminal

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Electron](https://img.shields.io/badge/Electron-33.4-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7.6-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![ESC/POS](https://img.shields.io/badge/ESC%2FPOS-Thermal%20Printing-000000?logo=print&logoColor=white)]()
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

> **Olive Pizza POS** is an ultra-fast, touch-optimized billing terminal designed for restaurant cashiers and front-desk operators. Runs on Web (Port 5178), Desktop (Electron with native USB/network printer support), and Mobile/Tablet (Capacitor).

---

## 🌟 Key Features & Systems

### ⚡ 1. Ultra-Fast Touch Billing
* **High-Speed Ordering**: Category tabs and quick-add grids optimized for fast counter throughput during peak rush hours.
* **Multi-Mode Order Processing**:
  - **Dine-In**: Interactive table selection, cover counts, table transfers, and split bills.
  - **Takeaway / Counter Pickup**: Fast phone lookup, customer name tagging, and packaging charge automation.
  - **Direct Counter Delivery**: Manual address and rider assignment for offline walk-in orders.

### 💾 2. Dual-Persistence Storage & Outage Resilience
* **Sub-100ms Firestore Commit**: Every bill is committed instantly to Firestore (`orders`, `pos_bills`), returning `BILL SUCCESS` in under 100ms.
* **Asynchronous Google Sheets Sync**: Non-blocking worker queues bills and pushes them to monthly franchise financial workbooks (13 structured tabs).
* **Offline Idempotency**: If the store's internet connection drops or Google Sheets rate limits, bills are safely stored locally with `SYNC_PENDING` status and automatically synced upon reconnection. Sales are never interrupted.

### 🖨️ 3. ESC/POS Thermal Receipt Engine
* **Universal Hardware Compatibility**: Supports 80mm and 58mm standard thermal printers via USB, Network (TCP/IP), and Bluetooth.
* **GST-Compliant Formatting**:
  - Store branch name, address, GSTIN, FSSAI license number.
  - Itemized lines with sizes, crusts, add-on pricing, and tax breakdown (CGST + SGST).
  - Dynamic UPI QR Code for instant scan-and-pay at the counter.

### 💼 4. Cash Drawer & Shift Management
* **Opening Float Entry**: Cashier logs starting cash in drawer at shift commencement.
* **Real-Time Shift Analytics**: Live tracking of cash collected, UPI transactions, card payments, refunds, and petty cash payouts.
* **Z-Report & Shift Closure**: End-of-day reconciliation summary printing with automated discrepancy auditing.

### 🔔 5. WebSocket Alert Replay & Order Notifications
* Subscribes to the canonical backend WebSocket server (`ws://localhost:5000/ws`).
* Registers terminal ID and branch ID for scoped notification delivery.
* Replays missed incoming order events upon network recovery using monotonic sequence numbers.

### 🧾 6. Perpetual Transactional Billing System (#1, #2, #3...)
* **Unbroken Monotonic Numbering**: Every completed POS bill receives an atomic, perpetual sequential bill number (`#1, #2, #3...`) generated via `billing.repository.ts`.
* **Zero Disconnect Resets**: Bill numbers never reset on date changes or terminal restarts, ensuring 100% accounting and tax audit compliance.
* **Source Separation**: Tagged explicitly with `source: 'POS'`, terminal ID, and cashier ID, distinct from online customer orders.


---

## 🏗️ Technical Architecture & Stack

- **Frontend Core**: React 19, TypeScript, Vite 6, Tailwind CSS v4
- **State Management**: Zustand
- **Desktop Runtime**: Electron 33, `electron-builder`
- **Mobile Container**: Capacitor 7 (Android / iOS)
- **Database & Sync**: Firestore, Google Sheets API v4 (via backend worker)
- **Icons & UI**: Lucide React, React Hot Toast

---

## ⚡ Getting Started

### 1. Prerequisites
- Node.js `v20+` or `v22+`
- Central Backend running on `http://localhost:5000` (or configured production backend)

### 2. Installation
```bash
cd olive-pizza-pos
npm install
```

### 3. Environment Configuration
Create a `.env` file in the project root:
```env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000/ws
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=olive-pizza-08.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=olive-pizza-08
VITE_FIREBASE_STORAGE_BUCKET=olive-pizza-08.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Running Locally
```bash
# Start Vite web dev server on port 5178
npm run dev

# Or start Electron desktop application in development
npm run desktop
```

### 5. Building for Production
```bash
# Web application build
npm run build

# Windows desktop installer (.exe)
npm run build:win

# macOS desktop installer (.dmg)
npm run build:mac

# Android / iOS Capacitor sync
npx cap sync
```

---

## 📄 License

Proprietary Software — All rights reserved by **Olive Pizza**, Rajnandgaon, Chhattisgarh, India.
