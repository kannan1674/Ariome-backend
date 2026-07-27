/**
 * Set a user's role by phone (E.164) or email.
 * Usage: node scripts/setRole.js <phone-or-email> <user|teacher|admin>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'config', 'config.env') });
const mongoose = require('mongoose');
const authModel = require('../models/authModel');

const ROLES = ['user', 'teacher', 'admin'];

async function main() {
    const identifier = String(process.argv[2] || '').trim();
    const role = String(process.argv[3] || '').trim().toLowerCase();

    if (!identifier || !ROLES.includes(role)) {
        console.error('Usage: node scripts/setRole.js <phone-or-email> <user|teacher|admin>');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    const query = identifier.includes('@')
        ? { email: identifier.toLowerCase() }
        : { phone: identifier.startsWith('+') ? identifier : `+${identifier.replace(/\D/g, '')}` };

    const user = await authModel.findOne(query);
    if (!user) {
        console.error('User not found:', identifier);
        process.exit(1);
    }

    user.role = role;
    await user.save();
    console.log(`Updated ${user.firstName} ${user.lastName} → role: ${role}`);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
