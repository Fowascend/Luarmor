const mongoose = require('mongoose');

const ScriptSchema = new mongoose.Schema({
    scriptId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    sourceCode: { type: String },
    obfuscatedCode: { type: String },
    createdAt: { type: Date, default: Date.now },
    whitelist: [{ userId: String, expiresAt: Date }],
    blacklist: [{ userId: String, reason: String }]
});

const KeySchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    scriptId: { type: String, required: true },
    userId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false }
});

const Script = mongoose.model('Script', ScriptSchema);
const Key = mongoose.model('Key', KeySchema);

module.exports = { Script, Key };
