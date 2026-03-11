import { Router, Response } from 'express';
import Team from '../models/Team';
import ActivityLog from '../models/ActivityLog';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/exports/teams — export teams as CSV
router.get('/teams', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { batch, course, status, checkedIn, city, college, teamSize } = req.query;

        const filter: any = {};
        if (batch) filter.leaderBatch = batch;
        if (course) filter.leaderCourse = course;
        if (status) filter.status = status;
        if (checkedIn !== undefined) filter.checkedIn = checkedIn === 'true';
        if (city) filter.leaderCity = city;
        if (college) filter.leaderCollege = college;
        if (teamSize) {
            const sizeNum = parseInt(teamSize as string, 10);
            if (!isNaN(sizeNum) && sizeNum >= 1 && sizeNum <= 5) {
                filter.members = { $size: sizeNum - 1 };
            }
        }

        const teams = await Team.find(filter).sort({ teamNumber: 1, createdAt: -1 });

        const headers = [
            'Team Name', 'Team Number', 'Room Number', 'Status', 'Themes',
            'Leader Name', 'Leader Email', 'Leader Phone', 'Leader College',
            'Leader Checked In', 'Leader Gender', 'Leader City', 'Leader Domain', 'Leader GitHub', 'Leader LinkedIn',
            'Member 1 Name', 'Member 1 Email', 'Member 1 Phone', 'Member 1 Checked In', 'Member 1 Gender', 'Member 1 City', 'Member 1 Domain', 'Member 1 GitHub', 'Member 1 LinkedIn',
            'Member 2 Name', 'Member 2 Email', 'Member 2 Phone', 'Member 2 Checked In', 'Member 2 Gender', 'Member 2 City', 'Member 2 Domain', 'Member 2 GitHub', 'Member 2 LinkedIn',
            'Member 3 Name', 'Member 3 Email', 'Member 3 Phone', 'Member 3 Checked In', 'Member 3 Gender', 'Member 3 City', 'Member 3 Domain', 'Member 3 GitHub', 'Member 3 LinkedIn',
            'Member 4 Name', 'Member 4 Email', 'Member 4 Phone', 'Member 4 Checked In', 'Member 4 Gender', 'Member 4 City', 'Member 4 Domain', 'Member 4 GitHub', 'Member 4 LinkedIn',
            'Member 5 Name', 'Member 5 Email', 'Member 5 Phone', 'Member 5 Checked In', 'Member 5 Gender', 'Member 5 City', 'Member 5 Domain', 'Member 5 GitHub', 'Member 5 LinkedIn',
        ];

        const rows = teams.map((team: any) => {
            const row: string[] = [
                team.teamName, String(team.teamNumber || ''), team.roomNumber || '', team.status, (team.themes || []).join('; '),
                team.leaderName, team.leaderEmail, team.leaderPhone, team.leaderCollege,
                team.leaderBatch, team.leaderCourse, team.devfolioProfile || '', String(team.checkedIn),
                team.leaderGender || '', team.leaderCity || '', team.leaderBio || '', team.leaderEducation || '', team.leaderDomainExpertise || '', (team.leaderSkills || []).join('; '), team.leaderGithub || '', team.leaderLinkedin || ''
            ];

            for (let i = 0; i < 5; i++) {
                const member = team.members?.[i];
                if (member) {
                    row.push(member.name, member.email, member.phone, member.batch, member.course, member.devfolioProfile || '', String(member.checkedIn), member.gender || '', member.city || '', member.bio || '', member.education || '', member.domainExpertise || '', (member.skills || []).join('; '), member.github || '', member.linkedin || '');
                } else {
                    row.push(...Array(15).fill(''));
                }
            }

            return row.map((v: string) => `"${(v || '').replace(/"/g, '""')}"`).join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');

        await ActivityLog.create({
            action: 'export_teams_csv',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'export',
            details: `Exported ${teams.length} teams as CSV`,
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=hackjklu5_teams_${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Export teams error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/exports/participants — export individual participants as CSV
router.get('/participants', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { batch, course, checkedIn, city, college } = req.query;

        const teams = await Team.find().sort({ teamNumber: 1, createdAt: -1 });

        interface ParticipantRow {
            teamName: string;
            teamNumber: string;
            name: string;
            email: string;
            phone: string;
            college: string;
            batch: string;
            course: string;
            devfolio: string;
            checkedIn: string;
            role: string;
            gender: string;
            city: string;
            bio: string;
            education: string;
            domainExpertise: string;
            skills: string;
            github: string;
            linkedin: string;
        }

        const participants: ParticipantRow[] = [];

        teams.forEach((team: any) => {
            // Leader
            participants.push({
                teamName: team.teamName,
                teamNumber: String(team.teamNumber || ''),
                name: team.leaderName,
                email: team.leaderEmail,
                phone: team.leaderPhone,
                college: team.leaderCollege,
                batch: team.leaderBatch,
                course: team.leaderCourse,
                devfolio: team.devfolioProfile || '',
                checkedIn: String(team.checkedIn),
                role: 'Leader',
                gender: team.leaderGender || '',
                city: team.leaderCity || '',
                bio: team.leaderBio || '',
                education: team.leaderEducation || '',
                domainExpertise: team.leaderDomainExpertise || '',
                skills: (team.leaderSkills || []).join('; '),
                github: team.leaderGithub || '',
                linkedin: team.leaderLinkedin || ''
            });

            // Members
            (team.members || []).forEach((member: any) => {
                participants.push({
                    teamName: team.teamName,
                    teamNumber: String(team.teamNumber || ''),
                    name: member.name,
                    email: member.email,
                    phone: member.phone,
                    college: member.college || '',
                    batch: member.batch,
                    course: member.course,
                    devfolio: member.devfolioProfile || '',
                    checkedIn: String(member.checkedIn),
                    role: 'Member',
                    gender: member.gender || '',
                    city: member.city || '',
                    bio: member.bio || '',
                    education: member.education || '',
                    domainExpertise: member.domainExpertise || '',
                    skills: (member.skills || []).join('; '),
                    github: member.github || '',
                    linkedin: member.linkedin || ''
                });
            });
        });

        // Apply filters
        let filtered = participants;
        if (batch) filtered = filtered.filter(p => p.batch === batch);
        if (course) filtered = filtered.filter(p => p.course === course);
        if (checkedIn !== undefined) filtered = filtered.filter(p => p.checkedIn === String(checkedIn === 'true'));
        if (city) filtered = filtered.filter(p => p.city === city);
        if (college) filtered = filtered.filter(p => p.college === college);

        const headers = ['Team Name', 'Team Number', 'Name', 'Email', 'Phone', 'College', 'Batch', 'Course', 'Devfolio', 'Checked In', 'Role', 'Gender', 'City', 'Bio', 'Education', 'Domain Expertise', 'Skills', 'GitHub', 'LinkedIn'];
        const rows = filtered.map(p => {
            return Object.values(p).map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');

        await ActivityLog.create({
            action: 'export_participants_csv',
            performedBy: req.admin?.username || 'unknown',
            targetType: 'export',
            details: `Exported ${filtered.length} participants as CSV`,
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=hackjklu5_participants_${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Export participants error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
