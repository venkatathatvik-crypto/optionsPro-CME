import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/user.js';
import googleRoutes from './src/routes/google.js';
import { initFirebaseAdmin } from './src/firebaseAdmin.js';
import http from 'http';

// Explicit .env path for consistent ESM behavior
dotenv.config({ path: './.env' });

const app = express();

app.use(express.json({ limit: '1mb' }));

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

const PORT = Number(process.env.PORT) || 3001;
const MONGODB_URI = process.env.MONGODB_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || '';

// Basic env validation (required in this project)
if (!MONGODB_URI) {
  console.error('[startup] MONGODB_URI is required but not set. Set MONGODB_URI in backend-auth/.env');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('[startup] JWT_SECRET is required but not set. Set JWT_SECRET in backend-auth/.env');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });

// Initialize Firebase Admin (will throw if creds missing)
try {
  initFirebaseAdmin();
  console.log('Firebase Admin initialized successfully');
} catch (e) {
  console.warn('Firebase Admin not initialized:', e.message);
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/auth/google', googleRoutes);

// Robust port binding with retry on EADDRINUSE
async function listenWithRetry(startPort = PORT, maxAttempts = 10) {
  let port = startPort;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.once('error', (err) => {
          server.removeAllListeners();
          if (err && err.code === 'EADDRINUSE') {
            return reject(err);
          }
          return reject(err);
        });
        server.listen(port, () => {
          console.log(`Backend Auth Service Running on PORT: ${port}`);
          resolve();
        });
      });
      // success -> exit function
      return;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use. Retrying on ${port + 1} (attempt ${attempt}/${maxAttempts})...`);
        port += 1;
        continue;
      }
      // Non-EADDRINUSE error: rethrow
      throw err;
    }
  }
  console.error(`Failed to bind to a port after ${maxAttempts} attempts starting at ${startPort}.`);
  process.exit(1);
}

listenWithRetry().catch((e) => {
  console.error('Server failed to start:', e);
  process.exit(1);
});
