import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';

// Import routes
import authRoutes from './routes/auth';
import teamRoutes from './routes/teams';
import statsRoutes from './routes/stats';
import exportRoutes from './routes/exports';
import settingsRoutes from './routes/settings';
import geographyRoutes from './routes/geography';
import mapZonesRoutes from './routes/mapZones';
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 5000;

// Trust First Proxy (needed for Vercel/Rate Limiting)
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet()); // Set security HTTP headers
app.disable('etag'); // Disable ETags to prevent info leak

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per `window` (here, per 15 minutes)
    message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api', limiter); // Apply rate limiting to API routes

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// General Middleware
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://admin-hackjklu5-0-frontend.vercel.app',
    'https://admin-hackjklu5-0.vercel.app', // Correct production URL
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
const connectDB = async () => {
    try {
        if (mongoose.connection.readyState >= 1) {
            return;
        }
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hackjklu5_admin');
        console.log('⚡ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        // Do not process.exit(1) here as it will kill the Vercel serverless function
    }
};

// Ensure DB connection before handling requests (Serverless optimization)
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/geography', geographyRoutes);
app.use('/api/map-zones', mapZonesRoutes);

// Root route
app.get('/', (req, res) => {
    res.send('HackJKLU 5.0 Admin API is running! ⚡');
});

// Health check
app.get('/api/health', authMiddleware, (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), dbState: mongoose.connection.readyState });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`Status: ${err.status || 500} | Error: ${err.message}`);

    // Don't leak stack trace in production
    const response = {
        error: err.message || 'Server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    };

    res.status(err.status || 500).json(response);
});

// Start server locally (Vercel uses the exported app)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    // We only connect here explicitly for local dev to see the initial console log
    connectDB().then(() => {
        app.listen(PORT, () => {
            console.log(`🏛️  HackJKLU 5.0 Admin API running on port ${PORT}`);
        });
    });
}

export default app;
