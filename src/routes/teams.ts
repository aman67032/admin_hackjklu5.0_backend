import { Router, Request, Response } from 'express';
import Team from '../models/Team';
import ActivityLog from '../models/ActivityLog';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
            res.status(404).json({ error: 'Team not found' });
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
            res.status(404).json({ error: 'Team not found' });
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

// POST /api/teams/import-devfolio — import teams from Devfolio CSV
router.post('/import-devfolio', requireRole('superadmin'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded.' });
            return;
        }

        const csvContent = req.file.buffer.toString('utf-8');
        const records: any[] = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });

        if (records.length === 0) {
            res.status(400).json({ error: 'CSV file is empty.' });
            return;
        }

        // Group by Team Name
        const teamsMap = new Map<string, any[]>();
        const individualMap = new Map<string, any>(); // Fallback for individuals with no team name

        for (const record of records) {
            // Flexible column names based on standard Devfolio exports
            const teamName = record['Team Name'] || record['Team'] || record['team_name'] || '';
            const email = record['Email'] || record['email'] || '';

            if (!email) continue; // Skip invalid rows

            if (teamName) {
                if (!teamsMap.has(teamName)) {
                    teamsMap.set(teamName, []);
                }
                teamsMap.get(teamName)!.push(record);
            } else {
                individualMap.set(email, record);
            }
        }

        let importedCount = 0;
        let updatedCount = 0;

        // Process teams
        for (const [teamName, members] of teamsMap.entries()) {
            if (members.length === 0) continue;

            // Sort members to put the "owner" or "leader" first if Devfolio has that info
            // Often there's a Role column: "Team Builder" vs "Team Member"
            members.sort((a, b) => {
                const roleA = (a['Role'] || '').toLowerCase();
                const roleB = (b['Role'] || '').toLowerCase();
                if (roleA.includes('builder') || roleA.includes('admin') || roleA.includes('leader')) return -1;
                if (roleB.includes('builder') || roleB.includes('admin') || roleB.includes('leader')) return 1;
                return 0; // Keep original order otherwise (first row becomes leader)
            });

            const leaderData = members[0];
            const leaderName = `${leaderData['First Name'] || leaderData['firstName'] || ''} ${leaderData['Last Name'] || leaderData['lastName'] || ''}`.trim() || leaderData['Name'] || 'Unknown';
            const leaderEmail = leaderData['Email'] || leaderData['email'] || '';
            const leaderPhone = leaderData['Phone Number'] || leaderData['Mobile'] || leaderData['phone'] || '';
            const leaderCollege = leaderData['College/University'] || leaderData['College'] || leaderData['University'] || leaderData['college'] || '';
            const leaderGender = leaderData['Gender'] || '';

            const memberDocs = [];
            for (let i = 1; i < members.length; i++) {
                const mData = members[i];
                const mName = `${mData['First Name'] || mData['firstName'] || ''} ${mData['Last Name'] || mData['lastName'] || ''}`.trim() || mData['Name'] || 'Unknown';
                memberDocs.push({
                    name: mName,
                    email: mData['Email'] || mData['email'] || '',
                    phone: mData['Phone Number'] || mData['Mobile'] || mData['phone'] || '',
                    college: mData['College/University'] || mData['College'] || mData['University'] || mData['college'] || '',
                    gender: mData['Gender'] || '',
                    checkedIn: false
                });
            }

            // Check if team exists (by name or leader email)
            let existingTeam = await Team.findOne({ $or: [{ teamName }, { leaderEmail }] });

            if (existingTeam) {
                // Update existing team
                existingTeam.leaderName = leaderName || existingTeam.leaderName;
                existingTeam.leaderEmail = leaderEmail || existingTeam.leaderEmail;
                existingTeam.leaderPhone = leaderPhone || existingTeam.leaderPhone;
                existingTeam.leaderCollege = leaderCollege || existingTeam.leaderCollege;
                existingTeam.leaderGender = leaderGender || existingTeam.leaderGender;

                // For members, we could sync them but replacing might overwrite custom edits. 
                // Let's safely update members count if there are missing ones
                for (const newM of memberDocs) {
                    if (!existingTeam.members.some(m => m.email === newM.email)) {
                        existingTeam.members.push(newM as any);
                    }
                }

                existingTeam.status = existingTeam.members.length + 1 >= 3 ? 'complete' : 'incomplete'; // Adjust basic status logic

                await existingTeam.save();
                updatedCount++;
            } else {
                // Create new team
                const newTeam = new Team({
                    teamName: teamName,
                    status: memberDocs.length + 1 >= 3 ? 'complete' : 'incomplete',
                    leaderName,
                    leaderEmail,
                    leaderPhone,
                    leaderCollege,
                    leaderGender,
                    leaderType: 'dayScholar', // Default
                    leaderCheckedIn: false,
                    members: memberDocs
                });
                await newTeam.save();
                importedCount++;
            }
        }

        // Process individuals (as solo teams)
        for (const [email, record] of individualMap.entries()) {
            const name = `${record['First Name'] || ''} ${record['Last Name'] || ''}`.trim() || record['Name'] || 'Unknown';
            const phone = record['Phone Number'] || record['Mobile'] || '';
            const college = record['College/University'] || record['College'] || '';
            const gender = record['Gender'] || '';

            // Check if user already exists as leader or member
            const existing = await Team.findOne({ leaderEmail: email });
            if (existing) continue; // Skip

            const newTeam = new Team({
                teamName: `${name}'s Team`,
                status: 'incomplete', // Solo teams are incomplete
                leaderName: name,
                leaderEmail: email,
                leaderPhone: phone,
                leaderCollege: college,
                leaderGender: gender,
                leaderType: 'dayScholar', // Default
                leaderCheckedIn: false,
                members: []
            });
            await newTeam.save();
            importedCount++;
        }

        await ActivityLog.create({
            action: 'import_devfolio',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'system',
            details: `Imported ${importedCount} teams and updated ${updatedCount} teams via Devfolio CSV`,
        });

        res.status(200).json({
            message: 'Devfolio import successful',
            imported: importedCount,
            updated: updatedCount
        });

    } catch (error) {
        console.error('Devfolio import error:', error);
        res.status(500).json({ error: 'Failed to process Devfolio CSV.' });
    }
});

export default router;
