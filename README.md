# CityMart Phase 3

Full-stack grocery commerce application built with React, Node.js/Express, and PostgreSQL.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
- Cloud Media: AWS S3 (pre-signed uploads)
- AI: OpenAI API (review summarization)

## Core Features

- Branch-based product browsing with inventory visibility
- Order placement with stock validation and automatic inventory updates
- Order cancellation with stock restoration
- Customer review creation and listing
- Product media upload workflow:
  - Backend generates S3 pre-signed upload URL
  - Client uploads image/video directly to S3
  - Backend stores media metadata in PostgreSQL
- AI-generated summary of product reviews using OpenAI

## Backend Setup

1. Create `.env` in `backend/` using `backend/.env.example`.
2. Install dependencies:

```bash
cd backend
npm install
```

3. Run backend:

```bash
npm run dev
```

The server creates `product_media` table automatically on startup if it does not exist.

## New API Endpoints

- `POST /api/products/:productId/media/presign-upload`
- `POST /api/products/:productId/media`
- `GET /api/products/:productId/media`
- `POST /api/ai/reviews/summary`
