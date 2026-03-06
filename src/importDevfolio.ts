/**
 * Standalone Devfolio CSV Import Script
 * 
 * Reads the HackJKLU CSV file and pushes team data to MongoDB.
 * 
 * Usage: npx ts-node src/importDevfolio.ts [path-to-csv]
 * Default CSV path: ../HackJKLU v5.0 (1).csv
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';
import Team from './models/Team';

dotenv.config();

// ── Helpers ──────────────────────────────────────────────────────────

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
        const parsed = JSON.parse(tracks.replace(/""/g, '"'));
        if (Array.isArray(parsed)) return parsed.filter((t: string) => t && t !== 'N/A');
    } catch { }
    return tracks.split(',').map((t: string) => t.trim()).filter((t: string) => t && t !== 'N/A');
};

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
    // Resolve CSV path
    const csvPath = process.argv[2] || path.resolve(__dirname, '..', '..', 'HackJKLU v5.0 (1).csv');

    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${csvPath}`);
        process.exit(1);
    }

    console.log(`📄 Reading CSV: ${csvPath}`);

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records: any[] = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
    });

    console.log(`📊 Total CSV records: ${records.length}`);

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hackjklu5_admin';
    console.log(`🔌 Connecting to MongoDB...`);
    await mongoose.connect(mongoUri);
    console.log(`⚡ Connected to MongoDB`);

    // ── Group by Team Name (case-insensitive) ──

    const teamsMap = new Map<string, { displayName: string; members: any[] }>();
    const individualMap = new Map<string, any>();
    let skippedNoEmail = 0;

    for (const record of records) {
        const teamName = getField(record, 'Team Name', 'Team', 'team_name');
        const email = getField(record, 'Email', 'email');

        if (!email) {
            skippedNoEmail++;
            continue;
        }

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

    console.log(`\n📋 Grouping Summary:`);
    console.log(`   Teams found:       ${teamsMap.size}`);
    console.log(`   Individuals:       ${individualMap.size}`);
    console.log(`   Skipped (no email):${skippedNoEmail}`);

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // ── Process Teams ──

    for (const [, teamData] of teamsMap.entries()) {
        const { displayName: teamName, members } = teamData;
        if (members.length === 0) continue;

        const leaderData = members[0];
        const leaderName = buildName(leaderData);
        const leaderEmail = getField(leaderData, 'Email', 'email');
        const leaderPhone = getField(leaderData, 'Phone Number', 'Mobile', 'phone') || 'N/A';
        const leaderCollege = getField(leaderData, 'College/University', 'College', 'University', 'college') || 'Unknown';
        const leaderGender = getField(leaderData, 'Gender');
        const leaderBio = getField(leaderData, 'Bio');
        const leaderCity = getField(leaderData, 'City');
        const leaderResume = getField(leaderData, 'Resume');
        const leaderLinkedin = getField(leaderData, 'LinkedIn');
        const devfolioProfile = extractDevfolioId(leaderData);
        const leaderStage = getField(leaderData, 'Stage', 'stage').toLowerCase();
        const leaderIsRsvp = leaderStage === 'rsvp' || leaderStage === 'rsvped';

        // Collect themes from all members
        const allThemes = new Set<string>();
        for (const m of members) {
            for (const t of parseThemes(m)) {
                allThemes.add(t);
            }
        }

        const memberDocs = [];
        let allMembersRsvp = true;

        for (let i = 1; i < members.length; i++) {
            const mData = members[i];
            const mStage = getField(mData, 'Stage', 'stage').toLowerCase();
            const mIsRsvp = mStage === 'rsvp' || mStage === 'rsvped';
            if (!mIsRsvp) allMembersRsvp = false;

            memberDocs.push({
                name: buildName(mData),
                email: getField(mData, 'Email', 'email'),
                phone: getField(mData, 'Phone Number', 'Mobile', 'phone') || 'N/A',
                college: getField(mData, 'College/University', 'College', 'University', 'college') || 'Unknown',
                batch: '',
                course: '',
                gender: getField(mData, 'Gender'),
                bio: getField(mData, 'Bio'),
                city: getField(mData, 'City'),
                resume: getField(mData, 'Resume'),
                linkedin: getField(mData, 'LinkedIn'),
                devfolioProfile: extractDevfolioId(mData),
                messFood: false,
                checkedIn: false,
                isRsvp: mIsRsvp,
            });
        }

        const teamFullyRsvp = leaderIsRsvp && allMembersRsvp;

        // Check if team already exists
        let existingTeam = await Team.findOne({
            $or: [
                { teamName: { $regex: `^${teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
                { leaderEmail },
            ],
        });

        if (existingTeam) {
            existingTeam.leaderName = leaderName || existingTeam.leaderName;
            existingTeam.leaderEmail = leaderEmail || existingTeam.leaderEmail;
            existingTeam.leaderPhone = leaderPhone !== 'N/A' ? leaderPhone : existingTeam.leaderPhone;
            existingTeam.leaderCollege = leaderCollege !== 'Unknown' ? leaderCollege : existingTeam.leaderCollege;
            existingTeam.leaderGender = leaderGender || existingTeam.leaderGender;
            existingTeam.leaderBio = leaderBio || existingTeam.leaderBio;
            existingTeam.leaderCity = leaderCity || existingTeam.leaderCity;
            existingTeam.leaderResume = leaderResume || existingTeam.leaderResume;
            existingTeam.leaderLinkedin = leaderLinkedin || existingTeam.leaderLinkedin;
            // Update RSVP status for leader
            (existingTeam as any).leaderIsRsvp = leaderIsRsvp;
            (existingTeam as any).teamFullyRsvp = teamFullyRsvp;

            if (devfolioProfile) existingTeam.devfolioProfile = devfolioProfile;
            if (allThemes.size > 0) existingTeam.themes = Array.from(allThemes);

            // Update existing members or add new ones
            for (const newM of memberDocs) {
                const existingMemberIndex = existingTeam.members.findIndex((m: any) => m.email.toLowerCase() === newM.email.toLowerCase());
                if (existingMemberIndex >= 0) {
                    // Update RSVP status for existing member
                    (existingTeam.members[existingMemberIndex] as any).isRsvp = newM.isRsvp;
                    if (newM.devfolioProfile) (existingTeam.members[existingMemberIndex] as any).devfolioProfile = newM.devfolioProfile;
                } else {
                    existingTeam.members.push(newM as any);
                }
            }

            existingTeam.status = existingTeam.members.length + 1 >= 3 ? 'complete' : 'incomplete';
            await existingTeam.save();
            updatedCount++;
        } else {
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
                leaderCheckedIn: false,
                leaderIsRsvp,
                teamFullyRsvp,
                devfolioProfile,
                themes: Array.from(allThemes),
                members: memberDocs,
            });
            await newTeam.save();
            importedCount++;
        }
    }

    // ── Process Individuals ──

    for (const [email, record] of individualMap.entries()) {
        const name = buildName(record);
        const phone = getField(record, 'Phone Number', 'Mobile', 'phone') || 'N/A';
        const college = getField(record, 'College/University', 'College', 'University', 'college') || 'Unknown';
        const gender = getField(record, 'Gender');
        const bio = getField(record, 'Bio');
        const city = getField(record, 'City');
        const resume = getField(record, 'Resume');
        const linkedin = getField(record, 'LinkedIn');
        const devfolioProfile = extractDevfolioId(record);
        const stage = getField(record, 'Stage', 'stage').toLowerCase();
        const isRsvp = stage === 'rsvp' || stage === 'rsvped';

        const existing = await Team.findOne({
            leaderEmail: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        });
        if (existing) {
            existing.leaderName = name || existing.leaderName;
            existing.leaderPhone = phone !== 'N/A' ? phone : existing.leaderPhone;
            existing.leaderCollege = college !== 'Unknown' ? college : existing.leaderCollege;
            existing.leaderGender = gender || existing.leaderGender;
            existing.leaderBio = bio || existing.leaderBio;
            existing.leaderCity = city || existing.leaderCity;
            existing.leaderResume = resume || existing.leaderResume;
            existing.leaderLinkedin = linkedin || existing.leaderLinkedin;
            if (devfolioProfile) existing.devfolioProfile = devfolioProfile;
            (existing as any).leaderIsRsvp = isRsvp;

            // For solo teams without members, if leader is RSVP, then team is fully rsvp
            if (existing.members.length === 0) {
                (existing as any).teamFullyRsvp = isRsvp;
            } else {
                let allMembersRsvp = true;
                for (const member of existing.members) {
                    if (!(member as any).isRsvp) allMembersRsvp = false;
                }
                (existing as any).teamFullyRsvp = isRsvp && allMembersRsvp;
            }

            await existing.save();
            updatedCount++;
            continue;
        }

        const newTeam = new Team({
            teamName: `${name}'s Team`,
            status: 'incomplete',
            leaderName: name,
            leaderEmail: email,
            leaderPhone: phone,
            leaderCollege: college,
            leaderBatch: '',
            leaderCourse: '',
            leaderMessFood: false,
            leaderGender: gender,
            leaderBio: bio,
            leaderCity: city,
            leaderResume: resume,
            leaderLinkedin: linkedin,
            leaderCheckedIn: false,
            leaderIsRsvp: isRsvp,
            teamFullyRsvp: isRsvp,
            devfolioProfile,
            members: [],
        });
        await newTeam.save();
        importedCount++;
    }

    // ── Summary ──

    console.log(`\n✅ Import Complete!`);
    console.log(`   New teams created: ${importedCount}`);
    console.log(`   Teams updated:     ${updatedCount}`);
    console.log(`   Skipped duplicates:${skippedCount}`);

    const totalTeams = await Team.countDocuments();
    console.log(`   Total teams in DB: ${totalTeams}`);

    await mongoose.disconnect();
    console.log(`\n🔌 Disconnected from MongoDB`);
}

main().catch((err) => {
    console.error('❌ Import failed:', err);
    process.exit(1);
});
