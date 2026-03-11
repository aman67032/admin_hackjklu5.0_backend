import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
    registrationLocked: boolean;
    teamModificationLocked: boolean;
    leaderboardVisible: boolean;
    submissionLocked: boolean;
    checkinOpen: boolean;
    maxTeamSize: number;
    minTeamSize: number;
    updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>({
    registrationLocked: { type: Boolean, default: false },
    teamModificationLocked: { type: Boolean, default: false },
    leaderboardVisible: { type: Boolean, default: true },
    submissionLocked: { type: Boolean, default: false },
    checkinOpen: { type: Boolean, default: true },
    maxTeamSize: { type: Number, default: 5 },
    minTeamSize: { type: Number, default: 2 },
}, {
    timestamps: true,
});

export default mongoose.model<ISettings>('Settings', SettingsSchema);
