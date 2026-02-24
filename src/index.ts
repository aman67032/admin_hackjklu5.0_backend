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

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet()); // Set security HTTP headers

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
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hackjklu5_admin')
    .then(() => {
        console.log('⚡ Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`🏛️  HackJKLU 5.0 Admin API running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    });

export default app;
