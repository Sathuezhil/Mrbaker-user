# MR Baker - Desktop Application

A desktop application built with Electron.js for browsing products, adding to cart, and generating bills. Uses external API for authentication and products.

## Features

- 🔐 User Login (via external API: `https://api.mr-bakers.com/api/login`)
- 🛍️ Product Browsing Page (from external API: `https://api.mr-bakers.com/api/foods/branch-id`)
- 🛒 Shopping Cart Functionality (stored in localStorage)
- 🧾 Bill Generation and Printing
- 💾 Local storage for cart and orders

## Prerequisites

- Node.js (v14 or higher)

## Installation

### 1. Frontend Setup

```bash
npm install
```

## Running the Application

### Step 1: Start Electron App

In the main directory:
```bash
npm start
```

For development mode (with DevTools):
```bash
npm run dev
```

## Usage

1. **Login**: Enter your username and password (authenticated via external API)
2. **Browse Products**: View available products loaded from external API using branch-id
3. **Add to Cart**: Click "Add to Cart" on any product
4. **View Cart**: Click the cart button in the navigation bar
5. **Purchase**: Click "Purchase & Print Bill" to create order and generate bill
6. **Print**: Use the print button or browser print (Ctrl+P) to print the bill

## API Endpoints Used

- **Login**: `POST https://api.mr-bakers.com/api/login`
- **Products**: `GET https://api.mr-bakers.com/api/foods/{branch-id}`

## Project Structure

```
Mrbaker-user/
├── main.js              # Electron main process
├── index.html           # Login page
├── product.html         # Product browsing page
├── cart.html            # Cart and bill page
├── scripts/             # Frontend JavaScript files
│   ├── api.js           # API helper functions (external API + localStorage)
│   ├── login.js         # Login functionality
│   ├── product.js       # Product display
│   └── cart.js          # Cart management
└── styles/              # CSS files
    ├── login.css
    ├── product.css
    └── cart.css
```

## Notes

- Login uses external API: `https://api.mr-bakers.com/api/login`
- Products are fetched from external API using branch-id from login response
- Cart and orders are stored in localStorage (browser local storage)
- No local backend required - all data stored locally in browser
- Bills can be printed locally
