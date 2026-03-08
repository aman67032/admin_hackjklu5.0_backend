import mongoose from 'mongoose';

const CustomZoneSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    parentBuildingId: { type: String, required: true },
    floorLevel: { type: String, required: true },
    zoneType: { type: String, required: true },
    coordinates: {
        type: [[Number]],
        required: true
    },
    color: { type: String, required: true },
    fillColor: { type: String, required: true }
}, {
    timestamps: true
});

export const CustomZone = mongoose.model('CustomZone', CustomZoneSchema);
