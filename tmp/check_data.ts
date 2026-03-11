import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

import Team from '../src/models/Team';

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hackjklu5_admin');
        console.log('Connected to MongoDB');

        const collections = await mongoose.connection.db?.listCollections().toArray();
        console.log('Collections:', collections?.map(c => c.name));

        const teamsCount = await Team.countDocuments();
        console.log('Total teams in "teams" collection:', teamsCount);

        const badTeams = await Team.find({
            $or: [
                { members: { $exists: false } },
                { members: null },
                { members: { $not: { $type: 'array' } } }
            ]
        });

        console.log('Teams with bad members field:', badTeams.length);
        if (badTeams.length > 0) {
            console.log('Sample IDs:', badTeams.slice(0, 5).map(t => t._id));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
