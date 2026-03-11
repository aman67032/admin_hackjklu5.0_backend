import { Router, Request, Response } from 'express';
import Team from '../models/Team';
import Settings from '../models/Settings';
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
            city,
            college,
            status,
            checkedIn,
            teamSize,
            page = '1',
            limit = '50',
        } = req.query;

        const filter: any = {};
        const andConditions: any[] = [];

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const searchConditions: any[] = [
                { teamName: searchRegex },
                { leaderName: searchRegex },
                { leaderEmail: searchRegex },
                { leaderCity: searchRegex },
                { leaderCollege: searchRegex },
                { roomNumber: searchRegex },
                { domain: searchRegex },
                { 'members.name': searchRegex },
                { 'members.email': searchRegex },
                { 'members.city': searchRegex },
                { 'members.college': searchRegex },
            ];

            // If search is a number, also search by teamNumber
            const searchNum = parseInt(search as string, 10);
            if (!isNaN(searchNum)) {
                searchConditions.push({ teamNumber: searchNum });
            }

            andConditions.push({ $or: searchConditions });
        }

        if (city) {
            andConditions.push({
                $or: [
                    { leaderCity: { $regex: city, $options: 'i' } },
                    { 'members.city': { $regex: city, $options: 'i' } },
                ]
            });
        }

        if (college) {
            andConditions.push({
                $or: [
                    { leaderCollege: { $regex: college, $options: 'i' } },
                    { 'members.college': { $regex: college, $options: 'i' } },
                ]
            });
        }

        if (status) filter.status = status;
        if (checkedIn !== undefined) filter.checkedIn = checkedIn === 'true';

        if (teamSize) {
            const sizeNum = parseInt(teamSize as string, 10);
            if (!isNaN(sizeNum) && sizeNum >= 2 && sizeNum <= 5) {
                // team size = 1 leader + N members. So members array length = sizeNum - 1
                filter.members = { $size: sizeNum - 1 };
            }
        }

        if (andConditions.length > 0) {
            filter.$and = andConditions;
        }

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
    } catch (error: any) {
        console.error('Get teams error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
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

// GET /api/teams/metadata — get unique cities and colleges for filters
router.get('/metadata', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [cities, colleges, sizeCountsData] = await Promise.all([
            Team.aggregate([
                { $project: { vals: { $concatArrays: [['$leaderCity'], '$members.city'] } } },
                { $unwind: '$vals' },
                { $match: { vals: { $nin: [null, ''] } } },
                { $group: { _id: '$vals' } },
                { $sort: { _id: 1 } }
            ]),
            Team.aggregate([
                { $project: { vals: { $concatArrays: [['$leaderCollege'], '$members.college'] } } },
                { $unwind: '$vals' },
                { $match: { vals: { $nin: [null, ''] } } },
                { $group: { _id: '$vals' } },
                { $sort: { _id: 1 } }
            ]),
            Team.aggregate([
                { $project: { size: { $add: [1, { $size: "$members" }] } } },
                { $group: { _id: "$size", count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ])
        ]);

        const sizeCounts: Record<number, number> = {};
        sizeCountsData.forEach((item: any) => {
            sizeCounts[item._id] = item.count;
        });

        res.json({
            cities: cities.map(c => c._id),
            colleges: colleges.map(c => c._id),
            sizeCounts
        });
    } catch (error: any) {
        console.error('Get metadata error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

router.put('/:id', requireRole('superadmin', 'volunteer'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Enforce Team Modification Lock
        if (req.admin?.role !== 'superadmin') {
            const settings = await Settings.findOne();
            if (settings?.teamModificationLocked) {
                res.status(403).json({ error: 'Team modification is currently locked by central command.' });
                return;
            }
        }

        const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!team) {
            res.status(404).json({ error: 'Team not found' });
            return;
        }

        // Emit live update
        const io = req.app.get('io');
        if (io) {
            io.emit('team_updated', team);
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

// POST /api/teams/:id/checkin — check in entire team
router.post('/:id/checkin', requireRole('superadmin', 'volunteer'), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Enforce Check-in Open setting
        if (req.admin?.role !== 'superadmin') {
            const settings = await Settings.findOne();
            if (!settings?.checkinOpen) {
                res.status(403).json({ error: 'Check-in is currently closed by central command.' });
                return;
            }
        }

        const team = await Team.findById(req.params.id);

        if (!team) {
            res.status(404).json({ error: 'Team not found.' });
            return;
        }

        team.checkedIn = !team.checkedIn;
        team.checkedInAt = team.checkedIn ? new Date() : undefined;

        await team.save();

        // Emit live update
        const io = req.app.get('io');
        if (io) {
            io.emit('team_updated', team);
        }

        await ActivityLog.create({
            action: 'team_checkin_toggle',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'team',
            targetId: team._id.toString(),
            details: `Toggled team-wide check-in for ${team.teamName} (${team.checkedIn ? 'IN' : 'OUT'})`,
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
            relax_quotes: true,
            relax_column_count: true,
        });

        if (records.length === 0) {
            res.status(400).json({ error: 'CSV file is empty.' });
            return;
        }

        // Helper to extract a field from a record with multiple possible column names
        const getField = (record: any, ...keys: string[]): string => {
            for (const key of keys) {
                if (record[key] && record[key].trim()) return record[key].trim();
            }
            return '';
        };

        // Helper to build full name
        const buildName = (record: any): string => {
            const first = getField(record, 'First Name', 'firstName');
            const last = getField(record, 'Last Name', 'lastName');
            return `${first} ${last}`.trim() || getField(record, 'Name') || 'Unknown';
        };

        // Helper to extract devfolio username from URL
        const extractDevfolioId = (record: any): string => {
            const url = getField(record, 'Devfolio', 'devfolio');
            if (!url) return '';
            const match = url.match(/devfolio\.co\/@([^\/\s]+)/);
            return match ? match[1] : url;
        };

        // Helper to parse themes/tracks
        const parseThemes = (record: any): string[] => {
            const tracks = getField(record, 'Project Tracks', 'Project Tracks (With Reason)');
            if (!tracks || tracks === 'N/A') return [];
            // Handle JSON-like format: ["track1","track2"] or comma-separated
            try {
                const parsed = JSON.parse(tracks.replace(/\"\"/g, '"'));
                if (Array.isArray(parsed)) return parsed.filter((t: string) => t && t !== 'N/A');
            } catch { }
            return tracks.split(',').map((t: string) => t.trim()).filter((t: string) => t && t !== 'N/A');
        };

        // Group by Team Name (case-insensitive)
        const teamsMap = new Map<string, { displayName: string; members: any[] }>();
        const individualMap = new Map<string, any>();

        for (const record of records) {
            const teamName = getField(record, 'Team Name', 'Team', 'team_name');
            const email = getField(record, 'Email', 'email');

            if (!email) continue; // Skip invalid rows

            if (teamName) {
                const normalizedKey = teamName.toLowerCase();
                if (!teamsMap.has(normalizedKey)) {
                    teamsMap.set(normalizedKey, { displayName: teamName, members: [] });
                }
                teamsMap.get(normalizedKey)!.members.push(record);
            } else {
                individualMap.set(email, record);
            }
        }

        let importedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        // Process teams
        for (const [, teamData] of teamsMap.entries()) {
            const { displayName: teamName, members } = teamData;
            if (members.length === 0) continue;

            // First person in the group becomes leader (no Role column in this CSV)
            const leaderData = members[0];
            const leaderName = buildName(leaderData);
            const leaderEmail = getField(leaderData, 'Email', 'email');
            const leaderPhone = getField(leaderData, 'Phone Number', 'Mobile', 'phone');
            const leaderCollege = getField(leaderData, 'College/University', 'College', 'University', 'college');
            const leaderGender = getField(leaderData, 'Gender');
            const leaderBio = getField(leaderData, 'Bio');
            const leaderCity = getField(leaderData, 'City');
            const leaderResume = getField(leaderData, 'Resume');
            const leaderLinkedin = getField(leaderData, 'LinkedIn');
            const devfolioId = extractDevfolioId(leaderData);

            // Collect themes from all members' Project Tracks
            const allThemes = new Set<string>();
            for (const m of members) {
                for (const t of parseThemes(m)) {
                    allThemes.add(t);
                }
            }

            const memberDocs = [];
            for (let i = 1; i < members.length; i++) {
                const mData = members[i];
                memberDocs.push({
                    name: buildName(mData),
                    email: getField(mData, 'Email', 'email'),
                    phone: getField(mData, 'Phone Number', 'Mobile', 'phone'),
                    college: getField(mData, 'College/University', 'College', 'University', 'college'),
                    gender: getField(mData, 'Gender'),
                    bio: getField(mData, 'Bio'),
                    city: getField(mData, 'City'),
                    resume: getField(mData, 'Resume'),
                    linkedin: getField(mData, 'LinkedIn'),
                    checkedIn: false,
                });
            }

            // Check if team exists (case-insensitive name match or leader email)
            let existingTeam = await Team.findOne({
                $or: [
                    { teamName: { $regex: `^${teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
                    { leaderEmail },
                ],
            });

            if (existingTeam) {
                // Update existing team with new data
                existingTeam.leaderName = leaderName || existingTeam.leaderName;
                existingTeam.leaderEmail = leaderEmail || existingTeam.leaderEmail;
                existingTeam.leaderPhone = leaderPhone || existingTeam.leaderPhone;
                existingTeam.leaderCollege = leaderCollege || existingTeam.leaderCollege;
                existingTeam.leaderGender = leaderGender || existingTeam.leaderGender;
                existingTeam.leaderBio = leaderBio || existingTeam.leaderBio;
                existingTeam.leaderCity = leaderCity || existingTeam.leaderCity;
                existingTeam.leaderResume = leaderResume || existingTeam.leaderResume;
                existingTeam.leaderLinkedin = leaderLinkedin || existingTeam.leaderLinkedin;
                if (devfolioId) existingTeam.devfolioProfile = devfolioId;
                if (allThemes.size > 0) existingTeam.themes = Array.from(allThemes);

                // Safely add only new members (don't overwrite existing edits)
                for (const newM of memberDocs) {
                    if (!existingTeam.members.some((m: any) => m.email.toLowerCase() === newM.email.toLowerCase())) {
                        existingTeam.members.push(newM as any);
                    }
                }

                existingTeam.status = existingTeam.members.length + 1 >= 3 ? 'complete' : 'incomplete';
                await existingTeam.save();
                updatedCount++;
            } else {
                // Create new team
                const newTeam = new Team({
                    teamName,
                    status: memberDocs.length + 1 >= 3 ? 'complete' : 'incomplete',
                    leaderName,
                    leaderEmail,
                    leaderPhone,
                    leaderCollege,
                    leaderBatch: '',
                    leaderCourse: '',
                    leaderMessFood: false,
                    leaderGender,
                    leaderBio,
                    leaderCity,
                    leaderResume,
                    leaderLinkedin,
                    checkedIn: false,
                    devfolioProfile: devfolioId,
                    themes: Array.from(allThemes),
                    members: memberDocs,
                });
                await newTeam.save();
                importedCount++;
            }
        }

        // Process individuals (as solo teams)
        for (const [email, record] of individualMap.entries()) {
            const name = buildName(record);
            const phone = getField(record, 'Phone Number', 'Mobile', 'phone');
            const college = getField(record, 'College/University', 'College', 'University', 'college');
            const gender = getField(record, 'Gender');
            const bio = getField(record, 'Bio');
            const city = getField(record, 'City');
            const resume = getField(record, 'Resume');
            const linkedin = getField(record, 'LinkedIn');
            const devfolioId = extractDevfolioId(record);

            // Check if user already exists as leader
            const existing = await Team.findOne({ leaderEmail: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
            if (existing) {
                skippedCount++;
                continue;
            }

            const newTeam = new Team({
                teamName: `${name}'s Team`,
                status: 'incomplete',
                leaderName: name,
                leaderEmail: email,
                leaderPhone: phone,
                leaderCollege: college,
                leaderGender: gender,
                leaderBio: bio,
                leaderCity: city,
                leaderResume: resume,
                leaderLinkedin: linkedin,
                leaderType: 'dayScholar',
                checkedIn: false,
                devfolioId,
                members: [],
            });
            await newTeam.save();
            importedCount++;
        }

        await ActivityLog.create({
            action: 'import_devfolio',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'system',
            details: `Imported ${importedCount} new teams, updated ${updatedCount} teams, skipped ${skippedCount} duplicates via Devfolio CSV (${records.length} total records)`,
        });

        res.status(200).json({
            message: 'Devfolio import successful',
            totalRecords: records.length,
            imported: importedCount,
            updated: updatedCount,
            skipped: skippedCount,
        });

    } catch (error) {
        console.error('Devfolio import error:', error);
        res.status(500).json({ error: 'Failed to process Devfolio CSV.' });
    }
});

export default router;
