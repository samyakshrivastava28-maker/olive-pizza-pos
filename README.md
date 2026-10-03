# 🍕 Olive Pizza POS — High-Speed Restaurant Billing & Thermal Printing Terminal

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Electron](https://img.shields.io/badge/Electron-33.4-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7.6-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![IndexedDB](https://img.shields.io/badge/IndexedDB-Offline_Resilient-FFA000?logo=databricks&logoColor=white)]()
[![ESC/POS](https://img.shields.io/badge/ESC%2FPOS-Thermal%20Printing-000000?logo=print&logoColor=white)]()
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

> **Olive Pizza POS** is an ultra-fast, touch-optimized billing terminal designed for restaurant cashiers and front-desk operators. Runs on Web (Port 5178), Desktop (Electron with native USB/network printer support), and Mobile/Tablet (Capacitor).

---

## 🌟 Key Features & Systems

### ⚡ 1. Ultra-Fast Touch Billing & Dynamic Catalog
* **Dynamic Menu & Zero Hardcoded Prices**: All product prices, size variants, crust choices, and toppings are loaded dynamically from the branch catalog. Zero hardcoded numbers or fake fallback pricing.
* **Multi-Mode Order Processing**:
  - **Dine-In**: Interactive table selection, cover counts, table transfers, and split bills.
  - **Takeaway / Counter Pickup**: Fast phone lookup, customer name tagging, and packaging charge automation.
  - **Direct Counter Delivery**: Manual address and rider assignment for offline walk-in orders.

### 💾 2. Offline-First IndexedDB Engine (`PosIndexedDbService.ts`)
* **Persistent Catalog Cache**: Stores the complete branch product catalog in IndexedDB (`catalog_cache`), allowing the POS terminal to boot, browse categories, customize items, and issue bills even when completely disconnected from the internet or after browser restarts.
* **Crash-Resilient Offline Bill Queue**:
  - Every offline-settled bill is atomically saved to IndexedDB (`offline_bills`) with a cryptographic idempotency key and status (`PENDING`).
  - Cashiers continue billing uninterrupted during internet outages.
* **Background Auto-Synchronization**:
  - As soon as network connectivity is restored, the synchronizer flushes pending bills to the backend API (`/api/pos/bills/sync-offline`).
  - The backend recalculates server-authoritative totals and atomically commits them to PostgreSQL `canonical_orders` and `canonical_bills`.

### 🖨️ 3. ESC/POS Thermal Receipt Engine
* **Universal Hardware Compatibility**: Supports 80mm and 58mm standard thermal printers via USB, Network (TCP/IP), and Bluetooth.
* **GST-Compliant Formatting**:
  - Store branch name, address, GSTIN, FSSAI license number.
  - Itemized lines with sizes, crusts, add-on pricing, and tax breakdown (2.5% CGST + 2.5% SGST).
  - Dynamic UPI QR Code for instant scan-and-pay at the counter.

### 🧾 4. Perpetual Transactional Billing System (#1, #2, #3...)
* **Unbroken Monotonic Numbering**: Every completed POS bill receives an atomic, perpetual sequential bill number (`#1, #2, #3...`) generated via `BillingNumberService` and PostgreSQL sequence.
* **Zero Disconnect Resets**: Bill numbers never reset on date changes or terminal restarts, ensuring 100% accounting and tax audit compliance.
* **Source Separation**: Tagged explicitly with `source: 'POS'`, terminal ID, and cashier ID, distinct from online customer orders.

### 💼 5. Cash Drawer & Shift Management
* **Opening Float Entry**: Cashier logs starting cash in drawer at shift commencement.
* **Real-Time Shift Analytics**: Live tracking of cash collected, UPI transactions, card payments, refunds, and petty cash payouts.
* **Z-Report & Shift Closure**: End-of-day reconciliation summary printing with automated discrepancy auditing.

---

## 🏗️ Technical Architecture & Stack

- **Frontend Core**: React 19, TypeScript, Vite 6, Tailwind CSS v4
- **State Management**: Zustand
- **Local Storage**: IndexedDB (`PosIndexedDbService.ts`), LocalStorage fallback
- **Desktop Runtime**: Electron 33, `electron-builder`
- **Mobile Container**: Capacitor 7 (Android / iOS)
- **Backend & Database**: Canonical Central Backend (Port 5000), PostgreSQL, Firestore
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

### 3. Running Locally
```bash
# Start Vite web dev server on port 5178
npm run dev

# Or start Electron desktop application in development
npm run desktop
```

---

## 📜 License

Proprietary © Olive Pizza. All rights reserved.
