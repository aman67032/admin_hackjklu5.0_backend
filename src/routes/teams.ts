import { Router, Request, Response } from 'express';
import Team from '../models/Team';
import ActivityLog from '../models/ActivityLog';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

// Apply auth to all team routes
router.use(authMiddleware);

// GET /api/teams — list all teams with filters
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const {
            search,
            batch,
            course,
            status,
            checkedIn,
            memberType,
            page = '1',
            limit = '50',
        } = req.query;

        const filter: any = {};

        if (search) {
            filter.$or = [
                { teamName: { $regex: search, $options: 'i' } },
                { leaderName: { $regex: search, $options: 'i' } },
                { leaderEmail: { $regex: search, $options: 'i' } },
                { 'members.name': { $regex: search, $options: 'i' } },
                { 'members.email': { $regex: search, $options: 'i' } },
            ];
        }

        if (batch) filter.leaderBatch = batch;
        if (course) filter.leaderCourse = course;
        if (status) filter.status = status;
        if (checkedIn !== undefined) filter.leaderCheckedIn = checkedIn === 'true';
        if (memberType) filter.leaderType = memberType;

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;

        const [teams, total] = await Promise.all([
            Team.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
            Team.countDocuments(filter),
        ]);

        res.json({
            teams,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Get teams error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/teams/:id — single team
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const team = await Team.findById(req.params.id);
        if (!team) {
            res.status(404).json({ error: 'Team not found.' });
            return;
        }
        res.json(team);
    } catch (error) {
        console.error('Get team error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// PUT /api/teams/:id — update team
router.put('/:id', requireRole('superadmin', 'volunteer'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!team) {
            res.status(404).json({ error: 'Team not found.' });
            return;
        }

        await ActivityLog.create({
            action: 'update_team',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'team',
            targetId: team._id.toString(),
            details: `Updated team: ${team.teamName}`,
        });

        res.json(team);
    } catch (error) {
        console.error('Update team error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/teams/:id/checkin — check in leader or member
router.post('/:id/checkin', requireRole('superadmin', 'volunteer'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { target, memberIndex } = req.body; // target: 'leader' | 'member'
        const team = await Team.findById(req.params.id);

        if (!team) {
            res.status(404).json({ error: 'Team not found.' });
            return;
        }

        if (target === 'leader') {
            team.leaderCheckedIn = !team.leaderCheckedIn;
            team.leaderCheckedInAt = team.leaderCheckedIn ? new Date() : undefined;
        } else if (target === 'member' && memberIndex !== undefined) {
            if (memberIndex < 0 || memberIndex >= team.members.length) {
                res.status(400).json({ error: 'Invalid member index.' });
                return;
            }
            team.members[memberIndex].checkedIn = !team.members[memberIndex].checkedIn;
            team.members[memberIndex].checkedInAt = team.members[memberIndex].checkedIn ? new Date() : undefined;
        } else {
            res.status(400).json({ error: 'Invalid check-in target.' });
            return;
        }

        await team.save();

        const who = target === 'leader' ? team.leaderName : team.members[memberIndex].name;
        await ActivityLog.create({
            action: 'checkin_toggle',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'participant',
            targetId: team._id.toString(),
            details: `Toggled check-in for ${who} in team ${team.teamName}`,
        });

        res.json(team);
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/teams/swap — swap members between teams
router.post('/swap', requireRole('superadmin'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { fromTeamId, fromMemberIndex, toTeamId, toMemberIndex } = req.body;

        const fromTeam = await Team.findById(fromTeamId);
        const toTeam = await Team.findById(toTeamId);

        if (!fromTeam || !toTeam) {
            res.status(404).json({ error: 'One or both teams not found.' });
            return;
        }

        if (fromMemberIndex < 0 || fromMemberIndex >= fromTeam.members.length) {
            res.status(400).json({ error: 'Invalid source member index.' });
            return;
        }
        if (toMemberIndex < 0 || toMemberIndex >= toTeam.members.length) {
            res.status(400).json({ error: 'Invalid target member index.' });
            return;
        }

        // Swap
        const tempMember = JSON.parse(JSON.stringify(fromTeam.members[fromMemberIndex]));
        const targetMember = JSON.parse(JSON.stringify(toTeam.members[toMemberIndex]));
        fromTeam.members[fromMemberIndex] = targetMember;
        toTeam.members[toMemberIndex] = tempMember;

        await fromTeam.save();
        await toTeam.save();

        await ActivityLog.create({
            action: 'swap_members',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'team',
            targetId: `${fromTeamId} <-> ${toTeamId}`,
            details: `Swapped member ${fromMemberIndex} of ${fromTeam.teamName} with member ${toMemberIndex} of ${toTeam.teamName}`,
        });

        res.json({ fromTeam, toTeam });
    } catch (error) {
        console.error('Swap error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/teams/import — bulk import from JSON
router.post('/import', requireRole('superadmin'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { teams } = req.body;

        if (!Array.isArray(teams) || teams.length === 0) {
            res.status(400).json({ error: 'Teams array is required.' });
            return;
        }

        const result = await Team.insertMany(teams, { ordered: false });

        await ActivityLog.create({
            action: 'bulk_import',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'team',
            details: `Imported ${result.length} teams`,
        });

        res.status(201).json({ message: `Imported ${result.length} teams.`, count: result.length });
    } catch (error: any) {
        if (error.code === 11000) {
            res.status(409).json({ error: 'Duplicate entries found.', details: error.message });
            return;
        }
        console.error('Import error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// DELETE /api/teams/:id
router.delete('/:id', requireRole('superadmin'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const team = await Team.findByIdAndDelete(req.params.id);
        if (!team) {
            res.status(404).json({ error: 'Team not found.' });
            return;
        }

        await ActivityLog.create({
            action: 'delete_team',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'team',
            targetId: team._id.toString(),
            details: `Deleted team: ${team.teamName}`,
        });

        res.json({ message: 'Team deleted.' });
    } catch (error) {
        console.error('Delete team error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
