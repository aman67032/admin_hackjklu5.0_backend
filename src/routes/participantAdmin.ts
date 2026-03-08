import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Team from '../models/Team';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Generate a 9 character password
function generatePassword(): string {
    return crypto.randomBytes(5).toString('hex').slice(0, 9); // e.g. 'a1b2c3d4e'
}

// POST /generate-passwords
// Iterates through all teams and members, generates password for those without one
router.post('/generate-passwords', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.admin || (req.admin.role !== 'superadmin' && req.admin.role !== 'volunteer')) {
            res.status(403).json({ error: 'Permission denied.' });
            return;
        }

        const teams = await Team.find({});
        let generatedCount = 0;

        for (const team of teams) {
            let updated = false;

            // Check Leader
            if (!team.leaderPasskey) {
                const pass = generatePassword();
                const hash = await bcrypt.hash(pass, 10);
                team.leaderPasskey = pass;
                team.leaderPasswordHash = hash;
                updated = true;
                generatedCount++;
            }

            // Check Members
            let idx = 0;
            for (const member of team.members) {
                if (!member.passkey) {
                    const pass = generatePassword();
                    const hash = await bcrypt.hash(pass, 10);
                    // member needs to be handled individually
                    team.members[idx].passkey = pass;
                    team.members[idx].passwordHash = hash;
                    updated = true;
                    generatedCount++;
                }
                idx++;
            }

            if (updated) {
                await team.save();
            }
        }

        res.json({ success: true, generated: generatedCount });
    } catch (error) {
        console.error('Error generating passwords:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /send-emails
// (Mocked for now)
router.post('/send-emails', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.admin || (req.admin.role !== 'superadmin' && req.admin.role !== 'volunteer')) {
            res.status(403).json({ error: 'Permission denied.' });
            return;
        }

        const teams = await Team.find({
            $or: [
                { leaderPasskey: { $exists: true } },
                { 'members.passkey': { $exists: true } }
            ]
        });

        // E.g., setup nodemailer here to loop and send
        console.log(`Sending credentials to ${teams.length} teams... (Mocked)`);

        res.json({ success: true, message: `Dispatched emails to participants.` });
    } catch (error) {
        console.error('Error sending emails:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /locations
// Returns all participants location data to the Admin Tracker Map
router.get('/locations', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.admin) {
            res.status(401).json({ error: 'Unauthorized.' });
            return;
        }

        const teams = await Team.find({}).select('teamName status leaderEmail leaderLastLocation members.email members.lastLocation tracePassDetected leaderRestrictedAreaEntryTime members.restrictedAreaEntryTime');

        const activeLocations: any[] = [];
        const violations: any[] = [];

        for (const team of teams) {
            // Include leader
            if (team.leaderLastLocation?.lat) {
                const loc = {
                    teamId: team._id,
                    teamName: team.teamName,
                    email: team.leaderEmail,
                    isLeader: true,
                    lat: team.leaderLastLocation.lat,
                    lng: team.leaderLastLocation.lng,
                    timestamp: team.leaderLastLocation.timestamp,
                    violating: !!team.tracePassDetected,
                    status: team.status
                };
                activeLocations.push(loc);
                if (team.tracePassDetected && !violations.find(v => v.teamId === team._id.toString())) {
                    violations.push(loc);
                }
            }

            // Include members
            for (const member of team.members) {
                if (member.lastLocation?.lat) {
                    const loc = {
                        teamId: team._id,
                        teamName: team.teamName,
                        email: member.email,
                        isLeader: false,
                        lat: member.lastLocation.lat,
                        lng: member.lastLocation.lng,
                        timestamp: member.lastLocation.timestamp,
                        violating: !!team.tracePassDetected,
                        status: team.status
                    };
                    activeLocations.push(loc);
                    if (team.tracePassDetected && !violations.find(v => v.teamId === team._id.toString())) {
                        violations.push(loc);
                    }
                }
            }
        }

        res.json({ locations: activeLocations, violations });
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /disqualify/:teamId
router.post('/disqualify/:teamId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.admin || req.admin.role !== 'superadmin') {
            res.status(403).json({ error: 'Permission denied. Only Superadmin can disqualify.' });
            return;
        }

        const { teamId } = req.params;
        const team = await Team.findById(teamId);
        if (!team) {
            res.status(404).json({ error: 'Team not found' });
            return;
        }

        team.status = 'disqualified';
        await team.save();

        res.json({ success: true, message: `Team ${team.teamName} has been disqualified.` });
    } catch (error) {
        console.error('Error disqualifying team:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
