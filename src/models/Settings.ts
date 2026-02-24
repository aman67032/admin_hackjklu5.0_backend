import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
    registrationLocked: boolean;
    maxTeamSize: number;
    minTeamSize: number;
    updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>({
    registrationLocked: { type: Boolean, default: false },
    maxTeamSize: { type: Number, default: 5 },
    minTeamSize: { type: Number, default: 2 },
}, {
    timestamps: true,
});

export default mongoose.model<ISettings>('Settings', SettingsSchema);
