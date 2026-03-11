import mongoose, { Schema, Document } from 'mongoose';

export interface IMember {
    name: string;
    email: string;
    phone: string;
    college: string;
    batch: string;
    course: string;
    gender?: string;
    bio?: string;
    city?: string;
    education?: string;
    domainExpertise?: string;
    skills?: string[];
    github?: string;
    linkedin?: string;
    devfolioProfile?: string;
    isRsvp?: boolean;
}

export interface ITeam extends Document {
    teamName: string;
    teamNumber?: number;
    roomNumber?: string;
    extensionBoard?: boolean;
    domain?: string;
    status: 'complete' | 'incomplete' | 'disqualified';

    // Leader info
    leaderName: string;
    leaderEmail: string;
    leaderPhone: string;
    leaderCollege: string;
    leaderBatch: string;
    leaderCourse: string;
    leaderGender?: string;
    leaderBio?: string;
    leaderCity?: string;
    leaderEducation?: string;
    leaderDomainExpertise?: string;
    leaderSkills?: string[];
    leaderGithub?: string;
    leaderLinkedin?: string;
    leaderIsRsvp?: boolean;
    teamFullyRsvp?: boolean;
    checkedIn: boolean;
    checkedInAt?: Date;

    // Team Metadata
    themes?: string[];

    // Members
    members: IMember[];

    // Devfolio reference
    devfolioProfile?: string;

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
    gender: { type: String },
    bio: { type: String },
    city: { type: String },
    education: { type: String },
    domainExpertise: { type: String },
    skills: [{ type: String }],
    github: { type: String },
    linkedin: { type: String },
    devfolioProfile: { type: String },
    isRsvp: { type: Boolean, default: false },
});

const TeamSchema = new Schema<ITeam>({
    teamName: { type: String, required: true },
    teamNumber: { type: Number },
    roomNumber: { type: String },
    extensionBoard: { type: Boolean, default: false },
    domain: { type: String },
    status: { type: String, enum: ['complete', 'incomplete', 'disqualified'], default: 'incomplete' },

    leaderName: { type: String, required: true },
    leaderEmail: { type: String, required: true },
    leaderPhone: { type: String, default: '' },
    leaderCollege: { type: String, default: '' },
    leaderBatch: { type: String, default: '' },
    leaderCourse: { type: String, default: '' },
    leaderGender: { type: String },
    leaderBio: { type: String },
    leaderCity: { type: String },
    leaderEducation: { type: String },
    leaderDomainExpertise: { type: String },
    leaderSkills: [{ type: String }],
    leaderGithub: { type: String },
    leaderLinkedin: { type: String },
    leaderIsRsvp: { type: Boolean, default: false },
    teamFullyRsvp: { type: Boolean, default: false },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date },

    themes: [{ type: String }],

    members: [MemberSchema],

    devfolioProfile: { type: String },
}, {
    timestamps: true,
});

// Indexes for common queries
TeamSchema.index({ teamName: 'text', leaderName: 'text', leaderEmail: 'text' });
TeamSchema.index({ leaderBatch: 1 });
TeamSchema.index({ leaderCourse: 1 });
TeamSchema.index({ status: 1 });
TeamSchema.index({ checkedIn: 1 });

export default mongoose.models.Team || mongoose.model<ITeam>('Team', TeamSchema);
