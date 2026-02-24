import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Admin from './models/Admin';
import Settings from './models/Settings';

dotenv.config();

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hackjklu5_admin');
        console.log('Connected to MongoDB');

        // Create default superadmin
        const existingAdmin = await Admin.findOne({ username: 'counciloftechnicalaffairs@jklu.edu.in' });
        if (!existingAdmin) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash('Asujam@67', salt);

            await Admin.create({
                username: 'counciloftechnicalaffairs@jklu.edu.in',
                passwordHash,
                role: 'superadmin',
            });
            console.log('✅ Default superadmin created (username: counciloftechnicalaffairs@jklu.edu.in)');
        } else {
            console.log('ℹ️  Superadmin already exists');
        }

        // Create default settings
        const existingSettings = await Settings.findOne();
        if (!existingSettings) {
            await Settings.create({
                registrationLocked: false,
                maxTeamSize: 4,
                minTeamSize: 2,
            });
            console.log('✅ Default settings created');
        } else {
            console.log('ℹ️  Settings already exist');
        }

        console.log('\n🏛️  Seed complete!');
        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
}

seed();
