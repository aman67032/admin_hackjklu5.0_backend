import { Router, Response } from 'express';
import Team from '../models/Team';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/stats — dashboard statistics
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [
            totalTeams,
            completeTeams,
            incompleteTeams,
            allTeams,
        ] = await Promise.all([
            Team.countDocuments(),
            Team.countDocuments({ status: 'complete' }),
            Team.countDocuments({ status: 'incomplete' }),
            Team.find().select('leaderBatch leaderCourse leaderType leaderMessFood leaderCheckedIn members'),
        ]);

        // Calculate participant counts
        let totalParticipants = 0;
        let checkedInCount = 0;
        const batchBreakdown: Record<string, number> = {};
        const courseBreakdown: Record<string, number> = {};
        let hostellerCount = 0;
        let dayScholarCount = 0;
        let messFoodCount = 0;

        allTeams.forEach(team => {
            // Count leader
            totalParticipants++;
            if (team.leaderCheckedIn) checkedInCount++;

            const leaderBatch = team.leaderBatch || 'Unknown';
            batchBreakdown[leaderBatch] = (batchBreakdown[leaderBatch] || 0) + 1;

            const leaderCourse = team.leaderCourse || 'Unknown';
            courseBreakdown[leaderCourse] = (courseBreakdown[leaderCourse] || 0) + 1;

            if (team.leaderType === 'hosteller') hostellerCount++;
            else dayScholarCount++;

            if (team.leaderMessFood) messFoodCount++;

            // Count members
            team.members.forEach(member => {
                totalParticipants++;
                if (member.checkedIn) checkedInCount++;

                const memberBatch = member.batch || 'Unknown';
                batchBreakdown[memberBatch] = (batchBreakdown[memberBatch] || 0) + 1;

                const memberCourse = member.course || 'Unknown';
                courseBreakdown[memberCourse] = (courseBreakdown[memberCourse] || 0) + 1;

                if (member.memberType === 'hosteller') hostellerCount++;
                else dayScholarCount++;

                if (member.messFood) messFoodCount++;
            });
        });

        res.json({
            teams: {
                total: totalTeams,
                complete: completeTeams,
                incomplete: incompleteTeams,
            },
            participants: {
                total: totalParticipants,
                checkedIn: checkedInCount,
                notCheckedIn: totalParticipants - checkedInCount,
            },
            batchBreakdown,
            courseBreakdown,
            typeBreakdown: {
                hosteller: hostellerCount,
                dayScholar: dayScholarCount,
            },
            messFoodCount,
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
