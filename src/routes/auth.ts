import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required.' });
            return;
        }

        const admin = await Admin.findOne({ username });
        if (!admin) {
            res.status(401).json({ error: 'Invalid credentials.' });
            return;
        }

        const isMatch = await bcrypt.compare(password, admin.passwordHash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials.' });
            return;
        }

        const token = jwt.sign(
            { id: admin._id, username: admin.username, role: admin.role },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            admin: {
                id: admin._id,
                username: admin.username,
                role: admin.role,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const admin = await Admin.findById(req.admin?.id).select('-passwordHash');
        if (!admin) {
            res.status(404).json({ error: 'Admin not found.' });
            return;
        }
        res.json(admin);
    } catch (error) {
        console.error('Auth me error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/auth/create — create admin (superadmin only)
router.post('/create', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (req.admin?.role !== 'superadmin') {
            res.status(403).json({ error: 'Only superadmin can create admins.' });
            return;
        }

        const { username, password, role } = req.body;

        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required.' });
            return;
        }

        const existing = await Admin.findOne({ username });
        if (existing) {
            res.status(409).json({ error: 'Username already exists.' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const admin = new Admin({
            username,
            passwordHash,
            role: role || 'viewer',
        });

        await admin.save();
        res.status(201).json({ message: 'Admin created.', admin: { id: admin._id, username, role: admin.role } });
    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
