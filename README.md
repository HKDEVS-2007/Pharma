# PHARMA – Pharmacy Management System

A complete desktop pharmacy management application built with **Electron + Node.js + SQLite**.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or higher: https://nodejs.org/
- **npm** (comes with Node.js)

### Installation

1. **Extract** this ZIP to a folder.
2. Open a **terminal / command prompt** inside that folder.
3. Run:

```bash
npm install
```

> ⚠️ This will install Electron and better-sqlite3. It may take a few minutes on first run.

4. **Start the app**:

```bash
npm start
```

---

## 🔑 Default Login

| Field    | Value     |
|----------|-----------|
| Username | `admin`   |
| Password | `admin123`|

You can add more users in **Settings → User Management**.

---

## 📁 Features

| Module             | Description                                      |
|--------------------|--------------------------------------------------|
| **Login**          | Secure user authentication                       |
| **Dashboard**      | Quick navigation + sales chart                   |
| **Categories**     | Add/Edit/Delete medicine categories              |
| **Suppliers**      | Manage suppliers                                 |
| **Medicines**      | Full medicine inventory management               |
| **Sale**           | Create sale bills with medicine picker           |
| **Sale Summary**   | View/filter all sale records                     |
| **Return**         | Process customer returns                         |
| **Return Summary** | View/filter return records                       |
| **Purchase**       | Record purchases from suppliers                  |
| **Purchase Summary**| View/filter purchase records                   |
| **Reports**        | Daily & monthly financial reports with charts    |
| **Expiry Alert**   | Monitor medicines near expiry                    |
| **Out of Stock**   | View medicines with zero quantity                |
| **Settings**       | Pharmacy info, logo, receipt config, users       |

---

## 💊 How to Use – Sale Bill

1. Go to **Sale** from Dashboard.
2. Fill in Customer Name (optional) and Date.
3. Click **Add Row** or press **Enter** in the Qty field → Medicine picker opens.
4. Search medicine by name / batch no / scan barcode → press **Enter** to select.
5. Enter **Quantity**.
6. Add more items as needed.
7. Enter **Discount** (optional).
8. Press **Save Bill** → choose to print or not.

---

## 🗄️ Database

- SQLite database is stored at:
  - **Windows**: `%APPDATA%\pharma\pharma.db`
  - **Mac**: `~/Library/Application Support/pharma/pharma.db`
  - **Linux**: `~/.config/pharma/pharma.db`

---

## 🛠️ Build Executable (Optional)

To create a standalone `.exe` installer:

```bash
npm run build
```

Output will be in the `dist/` folder.

---

## 📞 Support

Configure your pharmacy details in **Settings** before first use:
- Upload your pharmacy logo
- Set pharmacy name and address
- Configure receipt footer text
