import express from 'express';
import { CustomZone } from '../models/CustomZone';

const router = express.Router();

// GET all custom zones
router.get('/', async (req, res) => {
    try {
        const zones = await CustomZone.find();
        res.json(zones);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch custom zones' });
    }
});

// POST save or update custom zones
router.post('/sync', async (req, res) => {
    try {
        const { zones } = req.body;

        if (!Array.isArray(zones)) {
            return res.status(400).json({ error: 'Expected an array of zones' });
        }

        // For simplicity, we'll iterate and update using upsert.
        // A full sync might involve deleting zones not in the request, but 
        // upsert ensures we don't accidentally wipe out database state 
        // without an explicit delete call.

        const bulkOps = zones.map(zone => ({
            updateOne: {
                filter: { id: zone.id },
                update: { $set: zone },
                upsert: true
            }
        }));

        if (bulkOps.length > 0) {
            await CustomZone.bulkWrite(bulkOps);
        }

        res.json({ success: true, message: `${zones.length} zones synced` });
    } catch (error) {
        console.error("Error syncing zones:", error);
        res.status(500).json({ error: 'Failed to sync custom zones' });
    }
});

// DELETE a custom zone
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await CustomZone.deleteOne({ id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete custom zone' });
    }
});

export default router;
