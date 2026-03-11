import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function cleanupFields() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            console.error('No database connection');
            process.exit(1);
        }
        
        const teamsCollection = db.collection('teams');

        // Remove resume and messFood from all team documents
        const result = await teamsCollection.updateMany(
            {},
            {
                $unset: {
                    leaderResume: '',
                    leaderMessFood: '',
                    'members.$[].resume': '',
                    'members.$[].messFood': ''
                }
            }
        );

        console.log(`Updated ${result.modifiedCount} documents. Removed leaderResume, leaderMessFood, members.resume, members.messFood.`);

        await mongoose.disconnect();
        console.log('Done.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

cleanupFields();
