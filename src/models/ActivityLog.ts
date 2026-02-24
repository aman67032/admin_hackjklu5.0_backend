import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
    action: string;
    performedBy: string;
    targetType: 'team' | 'participant' | 'settings' | 'export';
    targetId?: string;
    details: string;
    timestamp: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>({
    action: { type: String, required: true },
    performedBy: { type: String, required: true },
    targetType: { type: String, enum: ['team', 'participant', 'settings', 'export'], required: true },
    targetId: { type: String },
    details: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
});

ActivityLogSchema.index({ timestamp: -1 });
ActivityLogSchema.index({ performedBy: 1 });

export default mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);
