import mongoose, { Schema, Document } from 'mongoose';

export interface IAdmin extends Document {
    username: string;
    passwordHash: string;
    role: 'superadmin' | 'volunteer' | 'viewer';
    createdAt: Date;
}

const AdminSchema = new Schema<IAdmin>({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'volunteer', 'viewer'], default: 'viewer' },
}, {
    timestamps: true,
});

export default mongoose.model<IAdmin>('Admin', AdminSchema);
