const mongoose = require('mongoose');

// Script Schema
const ScriptSchema = new mongoose.Schema({
    scriptId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    sourceCode: { type: String },
    obfuscatedCode: { type: String },
    createdAt: { type: Date, default: Date.now },
    buyerRoleId: { type: String },
    whitelist: [{
        userId: String,
        expiresAt: Date
    }],
    blacklist: [{
        userId: String,
        reason: String,
        date: { type: Date, default: Date.now }
    }]
});

// License Key Schema
const KeySchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    scriptId: { type: String, required: true },
    userId: { type: String, required: true },
    hwid: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
    hwidResetCount: { type: Number, default: 0 },
    lastHwidReset: { type: Date }
});

const Script = mongoose.model('Script', ScriptSchema);
const Key = mongoose.model('Key', KeySchema);

module.exports = { Script, Key };
