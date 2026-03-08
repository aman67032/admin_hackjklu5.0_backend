import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Team from '../models/Team';
import { CustomZone } from '../models/CustomZone';
import { isInsideCampus, getRestrictedZonePresent } from '../utils/geo';
import { authMiddleware, AuthRequest } from '../middleware/auth'; // For token parsing

const router = Router();

// Participant Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required.' });
            return;
        }

        // Find team by leader or member email
        const team = await Team.findOne({
            $or: [
                { leaderEmail: email.toLowerCase() },
                { 'members.email': email.toLowerCase() }
            ]
        });

        if (!team) {
            res.status(401).json({ error: 'Invalid credentials.' });
            return;
        }

        let isLeader = false;
        let passwordHashToCompare = null;

        if (team.leaderEmail.toLowerCase() === email.toLowerCase()) {
            isLeader = true;
            passwordHashToCompare = team.leaderPasswordHash;
        } else {
            const member = team.members.find((m: any) => m.email.toLowerCase() === email.toLowerCase());
            if (member) {
                passwordHashToCompare = member.passwordHash;
            }
        }

        if (!passwordHashToCompare) {
            // Password not generated yet
            res.status(401).json({ error: 'Invalid credentials.' });
            return;
        }

        const isMatch = await bcrypt.compare(password, passwordHashToCompare);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials.' });
            return;
        }

        // Generate participant JWT
        const token = jwt.sign(
            { id: team._id, email, isLeader, role: 'participant' },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '48h' }
        );

        res.json({ token, team: { id: team._id, name: team.teamName, email } });
    } catch (error) {
        console.error('Participant login error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

interface ParticipantToken {
    id: string; // Team ID
    email: string;
    isLeader: boolean;
    role: string;
}

// Participant Location Heartbeat
router.post('/location', async (req: Request, res: Response): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized.' });
            return;
        }

        const token = authHeader.split(' ')[1];
        let decoded: ParticipantToken;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as ParticipantToken;
        } catch (e) {
            res.status(401).json({ error: 'Invalid token.' });
            return;
        }

        if (decoded.role !== 'participant') {
            res.status(403).json({ error: 'Forbidden.' });
            return;
        }

        const { lat, lng } = req.body;
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            res.status(400).json({ error: 'Invalid location coordinates.' });
            return;
        }

        const team = await Team.findById(decoded.id);
        if (!team) {
            res.status(404).json({ error: 'Team not found.' });
            return;
        }

        if (team.status === 'disqualified') {
            res.status(403).json({ error: 'Disqualified teams cannot send location.' });
            return;
        }

        const now = new Date();
        const point = { lat, lng };

        // Determine who is sending
        let memberRef: any = null;
        let prevLocation: any = null;

        if (decoded.isLeader) {
            prevLocation = team.leaderLastLocation;
            team.leaderLastLocation = { lat, lng, timestamp: now };
            memberRef = 'leader';
        } else {
            const member = team.members.find((m: any) => m.email.toLowerCase() === decoded.email.toLowerCase());
            if (member) {
                prevLocation = member.lastLocation;
                member.lastLocation = { lat, lng, timestamp: now };
                memberRef = member;
            }
        }

        // --- GPS Spoofing Detection ---
        if (prevLocation && prevLocation.lat && prevLocation.lng && prevLocation.timestamp) {
            // Haversine formula
            const R = 6371e3; // Earth radius in meters
            const lat1 = prevLocation.lat * Math.PI / 180;
            const lat2 = lat * Math.PI / 180;
            const deltaLat = (lat - prevLocation.lat) * Math.PI / 180;
            const deltaLng = (lng - prevLocation.lng) * Math.PI / 180;

            const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            const timeDiff = (now.getTime() - new Date(prevLocation.timestamp).getTime()) / 1000; // in seconds

            if (timeDiff > 2) { // 2 second minimum
                const speed = distance / timeDiff; // m/s

                // > 15 m/s (~54 km/h) is impossible on foot. Ignore update.
                if (speed > 15) {
                    console.warn(`[SPOOFING] ${decoded.email} jumped ${distance.toFixed(0)}m in ${timeDiff.toFixed(0)}s`);
                    res.status(400).json({ error: 'Unrealistic movement detected. Please disable mock locations.' });
                    return;
                }
            }
        }

        // --- Geofencing Logic ---
        // Fetch zones
        const campusZones = (await CustomZone.find({ zoneType: 'campus' })).map(z => ({
            id: z.id, zoneType: z.zoneType, coordinates: z.coordinates as unknown as number[][]
        }));

        // "Restricted" zones or area that are forbidden. In your system, we'll check for zoneType === 'restricted'
        const restrictedZones = (await CustomZone.find({ zoneType: 'restricted' })).map(z => ({
            id: z.id, zoneType: z.zoneType, coordinates: z.coordinates as unknown as number[][]
        }));

        const inCampus = isInsideCampus(point, campusZones);
        const inRestricted = getRestrictedZonePresent(point, restrictedZones);

        const isViolating = !inCampus || inRestricted !== null;

        if (isViolating) {
            // Check if violation just started
            let entryTime: Date | null = null;
            if (memberRef === 'leader') {
                if (!team.leaderRestrictedAreaEntryTime) team.leaderRestrictedAreaEntryTime = now;
                entryTime = team.leaderRestrictedAreaEntryTime;
            } else if (memberRef) {
                if (!memberRef.restrictedAreaEntryTime) memberRef.restrictedAreaEntryTime = now;
                entryTime = memberRef.restrictedAreaEntryTime;
            }

            // If violating for > 10 mins
            if (entryTime && (now.getTime() - entryTime.getTime() > 10 * 60 * 1000)) {
                team.tracePassDetected = true;
            }
        } else {
            // Reset violation time if not violating
            if (memberRef === 'leader') {
                team.leaderRestrictedAreaEntryTime = undefined;
            } else if (memberRef) {
                memberRef.restrictedAreaEntryTime = undefined;
            }
        }

        await team.save();

        // Emit socket update to admins
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('location_update', {
                teamId: team._id,
                teamName: team.teamName,
                email: decoded.email,
                isLeader: decoded.isLeader,
                lat,
                lng,
                timestamp: now,
                violating: isViolating,
                status: team.status
            });
        }

        res.json({ success: true, tracePassDetected: team.tracePassDetected });
    } catch (error) {
        console.error('Location heartbeat error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
