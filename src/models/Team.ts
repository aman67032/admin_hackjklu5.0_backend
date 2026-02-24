import mongoose, { Schema, Document } from 'mongoose';

export interface IMember {
    name: string;
    email: string;
    phone: string;
    college: string;
    batch: string;
    course: string;
    memberType: 'hosteller' | 'dayScholar';
    messFood: boolean;
    gender?: string;
    bio?: string;
    city?: string;
    education?: string;
    domainExpertise?: string;
    skills?: string[];
    resume?: string;
    github?: string;
    linkedin?: string;
    checkedIn: boolean;
    checkedInAt?: Date;
}

export interface ITeam extends Document {
    teamName: string;
    teamNumber?: number;
    roomNumber?: string;
    status: 'complete' | 'incomplete' | 'disqualified';

    // Leader info
    leaderName: string;
    leaderEmail: string;
    leaderPhone: string;
    leaderCollege: string;
    leaderBatch: string;
    leaderCourse: string;
    leaderType: 'hosteller' | 'dayScholar';
    leaderMessFood: boolean;
    leaderGender?: string;
    leaderBio?: string;
    leaderCity?: string;
    leaderEducation?: string;
    leaderDomainExpertise?: string;
    leaderSkills?: string[];
    leaderResume?: string;
    leaderGithub?: string;
    leaderLinkedin?: string;
    leaderCheckedIn: boolean;
    leaderCheckedInAt?: Date;

    // Team Metadata
    themes?: string[];

    // Members
    members: IMember[];

    // Devfolio reference
    devfolioId?: string;

    createdAt: Date;
    updatedAt: Date;
}

const MemberSchema = new Schema<IMember>({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    college: { type: String, default: '' },
    batch: { type: String, default: '' },
    course: { type: String, default: '' },
    memberType: { type: String, enum: ['hosteller', 'dayScholar'], default: 'dayScholar' },
    messFood: { type: Boolean, default: false },
    gender: { type: String },
    bio: { type: String },
    city: { type: String },
    education: { type: String },
    domainExpertise: { type: String },
    skills: [{ type: String }],
    resume: { type: String },
    github: { type: String },
    linkedin: { type: String },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date },
});

const TeamSchema = new Schema<ITeam>({
    teamName: { type: String, required: true },
    teamNumber: { type: Number },
    roomNumber: { type: String },
    status: { type: String, enum: ['complete', 'incomplete', 'disqualified'], default: 'incomplete' },

    leaderName: { type: String, required: true },
    leaderEmail: { type: String, required: true },
    leaderPhone: { type: String, default: '' },
    leaderCollege: { type: String, default: '' },
    leaderBatch: { type: String, default: '' },
    leaderCourse: { type: String, default: '' },
    leaderType: { type: String, enum: ['hosteller', 'dayScholar'], default: 'dayScholar' },
    leaderMessFood: { type: Boolean, default: false },
    leaderGender: { type: String },
    leaderBio: { type: String },
    leaderCity: { type: String },
    leaderEducation: { type: String },
    leaderDomainExpertise: { type: String },
    leaderSkills: [{ type: String }],
    leaderResume: { type: String },
    leaderGithub: { type: String },
    leaderLinkedin: { type: String },
    leaderCheckedIn: { type: Boolean, default: false },
    leaderCheckedInAt: { type: Date },

    themes: [{ type: String }],

    members: [MemberSchema],

    devfolioId: { type: String },
}, {
    timestamps: true,
});

// Indexes for common queries
TeamSchema.index({ teamName: 'text', leaderName: 'text', leaderEmail: 'text' });
TeamSchema.index({ leaderBatch: 1 });
TeamSchema.index({ leaderCourse: 1 });
TeamSchema.index({ status: 1 });
TeamSchema.index({ leaderCheckedIn: 1 });

export default mongoose.model<ITeam>('Team', TeamSchema);
