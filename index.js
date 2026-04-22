const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/luarmor';
mongoose.connect(MONGODB_URI).then(() => console.log('✅ Database connected')).catch(err => console.log('❌ DB Error:', err));

// Simple obfuscation
function obfuscateCode(source) {
    let obfuscated = source;
    obfuscated = obfuscated.replace(/--.*$/gm, '');
    obfuscated = obfuscated.replace(/\s+/g, ' ');
    const encoded = Buffer.from(obfuscated).toString('base64');
    return `loadstring(game:HttpGet("https://raw.githubusercontent.com/luarmor/raw/main/${encoded.substring(0, 30)}"))()`;
}

// Database Schemas
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

// Slash Commands
const commands = [
    { name: 'createscript', description: 'Create a new protected script', options: [{ name: 'name', description: 'Script name', type: 3, required: true }] },
    { name: 'addsource', description: 'Add source code to your script', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }, { name: 'code', description: 'Your Lua code', type: 3, required: true }] },
    { name: 'whitelist', description: 'Whitelist a user', options: [{ name: 'user', description: 'User ID', type: 3, required: true }, { name: 'days', description: 'Days', type: 4, required: true }] },
    { name: 'blacklist', description: 'Blacklist a user', options: [{ name: 'user', description: 'User ID', type: 3, required: true }, { name: 'reason', description: 'Reason', type: 3, required: false }] },
    { name: 'genkey', description: 'Generate a license key', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }, { name: 'days', description: 'Days valid', type: 4, required: true }] },
    { name: 'stats', description: 'View your script stats', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }] }
];

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commands registered');
    } catch (error) { console.error(error); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    const { commandName, options, user } = interaction;

    if (commandName === 'createscript') {
        const name = options.getString('name');
        const scriptId = crypto.randomBytes(8).toString('hex');
        const script = new Script({ scriptId, name, ownerId: user.id, createdAt: new Date() });
        await script.save();
        await interaction.reply({ content: `✅ Script created!\nID: \`${scriptId}\`\nUse /addsource to add your code.`, ephemeral: true });
    }

    else if (commandName === 'addsource') {
        const scriptId = options.getString('scriptid');
        const code = options.getString('code');
        const script = await Script.findOne({ scriptId, ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ Script not found or not yours!', ephemeral: true });
        
        const obfuscated = obfuscateCode(code);
        script.sourceCode = code;
        script.obfuscatedCode = obfuscated;
        await script.save();
        
        await interaction.reply({ content: `✅ Code added and obfuscated!\nLoadstring: \`${obfuscated}\``, ephemeral: true });
    }

    else if (commandName === 'whitelist') {
        const targetId = options.getString('user');
        const days = options.getNumber('days');
        const script = await Script.findOne({ ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ No script found! First use /createscript', ephemeral: true });
        
        const expiresAt = new Date(Date.now() + days * 86400000);
        script.whitelist.push({ userId: targetId, expiresAt });
        await script.save();
        await interaction.reply({ content: `✅ User <@${targetId}> whitelisted for ${days} days!`, ephemeral: true });
    }

    else if (commandName === 'blacklist') {
        const targetId = options.getString('user');
        const reason = options.getString('reason') || 'No reason';
        const script = await Script.findOne({ ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ No script found!', ephemeral: true });
        
        script.blacklist.push({ userId: targetId, reason });
        await script.save();
        await interaction.reply({ content: `⛔ User <@${targetId}> blacklisted!\nReason: ${reason}`, ephemeral: true });
    }

    else if (commandName === 'genkey') {
        const scriptId = options.getString('scriptid');
        const days = options.getNumber('days');
        const script = await Script.findOne({ scriptId, ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ Script not found!', ephemeral: true });
        
        const key = crypto.randomBytes(16).toString('hex').toUpperCase();
        const expiresAt = new Date(Date.now() + days * 86400000);
        const license = new Key({ key, scriptId, userId: user.id, expiresAt });
        await license.save();
        await interaction.reply({ content: `🔑 License Key: \`${key}\`\nExpires in ${days} days`, ephemeral: true });
    }

    else if (commandName === 'stats') {
        const scriptId = options.getString('scriptid');
        const script = await Script.findOne({ scriptId });
        if (!script) return interaction.reply({ content: '❌ Script not found!', ephemeral: true });
        
        const userWhitelist = script.whitelist.find(w => w.userId === user.id);
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${script.name}`)
            .addFields(
                { name: 'Script ID', value: script.scriptId, inline: true },
                { name: 'Whitelisted', value: script.whitelist.length.toString(), inline: true },
                { name: 'Blacklisted', value: script.blacklist.length.toString(), inline: true }
            );
        if (userWhitelist) embed.addFields({ name: 'Your Whitelist', value: `Expires: ${new Date(userWhitelist.expiresAt).toLocaleString()}`, inline: false });
        else embed.addFields({ name: 'Your Status', value: 'Not whitelisted', inline: false });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
