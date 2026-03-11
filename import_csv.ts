import mongoose from 'mongoose';
import fs from 'fs';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';
dotenv.config();

async function importCSV() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) { console.error('No db'); process.exit(1); }

        const csvPath = 'F:\\hackjklu_admin\\HackJKLU v5.0 (4).csv';
        const csvContent = fs.readFileSync(csvPath, 'utf-8');

        const records: any[] = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_quotes: true,
            relax_column_count: true,
        });

        console.log(`Parsed ${records.length} records from CSV`);

        const getField = (record: any, ...keys: string[]): string => {
            for (const key of keys) {
                if (record[key] && record[key].trim()) return record[key].trim();
            }
            return '';
        };

        const buildName = (record: any): string => {
            const first = getField(record, 'First Name', 'firstName');
            const last = getField(record, 'Last Name', 'lastName');
            return `${first} ${last}`.trim() || getField(record, 'Name') || 'Unknown';
        };

        const extractDevfolioId = (record: any): string => {
            const url = getField(record, 'Devfolio', 'devfolio');
            if (!url) return '';
            const match = url.match(/devfolio\.co\/@([^\/\s]+)/);
            return match ? match[1] : url;
        };

        const parseThemes = (record: any): string[] => {
            const tracks = getField(record, 'Project Tracks', 'Project Tracks (With Reason)');
            if (!tracks || tracks === 'N/A') return [];
            try {
                const parsed = JSON.parse(tracks.replace(/\"\"/g, '"'));
                if (Array.isArray(parsed)) return parsed.filter((t: string) => t && t !== 'N/A');
            } catch { }
            return tracks.split(',').map((t: string) => t.trim()).filter((t: string) => t && t !== 'N/A');
        };

        // Group by Team Name
        const teamsMap = new Map<string, { displayName: string; members: any[] }>();
        const individualMap = new Map<string, any>();

        for (const record of records) {
            const teamName = getField(record, 'Team Name', 'Team', 'team_name');
            const email = getField(record, 'Email', 'email');
            if (!email) continue;

            if (teamName && teamName !== 'N/A') {
                const normalizedKey = teamName.toLowerCase();
                if (!teamsMap.has(normalizedKey)) {
                    teamsMap.set(normalizedKey, { displayName: teamName, members: [] });
                }
                teamsMap.get(normalizedKey)!.members.push(record);
            } else {
                individualMap.set(email, record);
            }
        }

        console.log(`Found ${teamsMap.size} teams and ${individualMap.size} individuals`);

        const teamsCollection = db.collection('teams');
        let importedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        for (const [, teamData] of teamsMap.entries()) {
            const { displayName: teamName, members } = teamData;
            if (members.length === 0) continue;

            const leaderData = members[0];
            const leaderName = buildName(leaderData);
            const leaderEmail = getField(leaderData, 'Email', 'email');
            const leaderPhone = getField(leaderData, 'Phone Number', 'Mobile', 'phone');
            const leaderCollege = getField(leaderData, 'College/University', 'College', 'University', 'college');
            const leaderGender = getField(leaderData, 'Gender');
            const leaderBio = getField(leaderData, 'Bio');
            const leaderCity = getField(leaderData, 'City');
            const leaderLinkedin = getField(leaderData, 'LinkedIn');
            const devfolioId = extractDevfolioId(leaderData);
            const stage = getField(leaderData, 'Stage');
            const isRsvp = stage === 'rsvp';

            const allThemes = new Set<string>();
            for (const m of members) {
                for (const t of parseThemes(m)) allThemes.add(t);
            }

            const memberDocs = [];
            for (let i = 1; i < members.length; i++) {
                const mData = members[i];
                const mStage = getField(mData, 'Stage');
                memberDocs.push({
                    name: buildName(mData),
                    email: getField(mData, 'Email', 'email'),
                    phone: getField(mData, 'Phone Number', 'Mobile', 'phone'),
                    college: getField(mData, 'College/University', 'College', 'University', 'college'),
                    batch: '',
                    course: '',
                    gender: getField(mData, 'Gender'),
                    bio: getField(mData, 'Bio'),
                    city: getField(mData, 'City'),
                    linkedin: getField(mData, 'LinkedIn'),
                    devfolioProfile: extractDevfolioId(mData),
                    isRsvp: mStage === 'rsvp',
                    checkedIn: false,
                });
            }

            // Check if team exists
            const escapedName = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existingTeam = await teamsCollection.findOne({
                $or: [
                    { teamName: { $regex: `^${escapedName}$`, $options: 'i' } },
                    { leaderEmail },
                ],
            });

            if (existingTeam) {
                // Update existing
                const existingMemberEmails = (existingTeam.members || []).map((m: any) => m.email?.toLowerCase());
                const newMembers = memberDocs.filter(m => !existingMemberEmails.includes(m.email.toLowerCase()));

                const updateOps: any = {
                    $set: {
                        leaderName: leaderName || existingTeam.leaderName,
                        leaderEmail: leaderEmail || existingTeam.leaderEmail,
                        leaderPhone: leaderPhone || existingTeam.leaderPhone,
                        leaderCollege: leaderCollege || existingTeam.leaderCollege,
                        leaderGender: leaderGender || existingTeam.leaderGender,
                        leaderBio: leaderBio || existingTeam.leaderBio,
                        leaderCity: leaderCity || existingTeam.leaderCity,
                        leaderLinkedin: leaderLinkedin || existingTeam.leaderLinkedin,
                        leaderIsRsvp: isRsvp,
                    }
                };
                if (devfolioId) updateOps.$set.devfolioProfile = devfolioId;
                if (allThemes.size > 0) updateOps.$set.themes = Array.from(allThemes);

                if (newMembers.length > 0) {
                    updateOps.$push = { members: { $each: newMembers } };
                }

                // Recalculate status
                const totalMembers = (existingTeam.members || []).length + newMembers.length + 1;
                updateOps.$set.status = totalMembers >= 3 ? 'complete' : 'incomplete';

                // Check if all are rsvp
                const allRsvp = isRsvp && memberDocs.every(m => m.isRsvp);
                updateOps.$set.teamFullyRsvp = allRsvp;

                await teamsCollection.updateOne({ _id: existingTeam._id }, updateOps);
                updatedCount++;
            } else {
                // Create new team
                const totalMembers = memberDocs.length + 1;
                const allRsvp = isRsvp && memberDocs.every(m => m.isRsvp);
                
                await teamsCollection.insertOne({
                    teamName,
                    status: totalMembers >= 3 ? 'complete' : 'incomplete',
                    leaderName,
                    leaderEmail,
                    leaderPhone,
                    leaderCollege,
                    leaderBatch: '',
                    leaderCourse: '',
                    leaderGender,
                    leaderBio,
                    leaderCity,
                    leaderLinkedin,
                    leaderIsRsvp: isRsvp,
                    teamFullyRsvp: allRsvp,
                    checkedIn: false,
                    devfolioProfile: devfolioId,
                    themes: Array.from(allThemes),
                    members: memberDocs,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                importedCount++;
            }
        }

        // Process individuals (no team name or N/A)
        for (const [email, record] of individualMap.entries()) {
            const name = buildName(record);
            const existing = await teamsCollection.findOne({
                leaderEmail: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
            });
            if (existing) { skippedCount++; continue; }

            const stage = getField(record, 'Stage');
            await teamsCollection.insertOne({
                teamName: `${name}'s Team`,
                status: 'incomplete',
                leaderName: name,
                leaderEmail: email,
                leaderPhone: getField(record, 'Phone Number', 'Mobile', 'phone'),
                leaderCollege: getField(record, 'College/University', 'College', 'University', 'college'),
                leaderBatch: '',
                leaderCourse: '',
                leaderGender: getField(record, 'Gender'),
                leaderBio: getField(record, 'Bio'),
                leaderCity: getField(record, 'City'),
                leaderLinkedin: getField(record, 'LinkedIn'),
                leaderIsRsvp: stage === 'rsvp',
                teamFullyRsvp: stage === 'rsvp',
                checkedIn: false,
                devfolioProfile: extractDevfolioId(record),
                themes: [],
                members: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            importedCount++;
        }

        console.log(`Import complete: ${importedCount} new, ${updatedCount} updated, ${skippedCount} skipped`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Import error:', error);
        process.exit(1);
    }
}

importCSV();
