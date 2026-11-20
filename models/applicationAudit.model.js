import mongoose from 'mongoose';

const applicationAuditSchema = new mongoose.Schema({
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'RestaurantApplication', required: true, index: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['SUBMITTED','UPDATED','RESUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','SUSPENDED','REACTIVATED'], required: true },
  notes: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.models.ApplicationAudit || mongoose.model('ApplicationAudit', applicationAuditSchema);
