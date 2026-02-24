import { Router, Response } from 'express';
import Settings from '../models/Settings';
import ActivityLog from '../models/ActivityLog';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/settings
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        res.json(settings);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// PUT /api/settings
router.put('/', requireRole('superadmin'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }

        const { registrationLocked, maxTeamSize, minTeamSize } = req.body;

        if (registrationLocked !== undefined) settings.registrationLocked = registrationLocked;
        if (maxTeamSize !== undefined) settings.maxTeamSize = maxTeamSize;
        if (minTeamSize !== undefined) settings.minTeamSize = minTeamSize;

        await settings.save();

        await ActivityLog.create({
            action: 'update_settings',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'settings',
            details: `Updated settings: ${JSON.stringify(req.body)}`,
        });

        res.json(settings);
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/settings/logs — activity logs
router.get('/logs', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { page = '1', limit = '50' } = req.query;
        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;

        const [logs, total] = await Promise.all([
            ActivityLog.find().sort({ timestamp: -1 }).skip(skip).limit(limitNum),
            ActivityLog.countDocuments(),
        ]);

        res.json({
            logs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
