// index.js - Main Luarmor Discord Bot
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Database Schemas
const ScriptSchema = new mongoose.Schema({
    scriptId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    ownerName: { type: String },
    originalSource: { type: String },
    obfuscatedSource: { type: String },
    loadstringUrl: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    whitelist: [{ userId: String, expiresAt: Date }],
    blacklist: [{ userId: String, reason: String }],
    buyerRoleId: { type: String }
});

const KeySchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    scriptId: { type: String, required: true },
    userId: { type: String, required: true },
    hwid: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
    hwidResetCount: { type: Number, default: 0 },
    lastHwidReset: { type: Date }
});

const Script = mongoose.model('Script', ScriptSchema);
const Key = mongoose.model('Key', KeySchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/luarmor', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ Database connected'))
  .catch(err => console.error('Database error:', err));

// Obfuscation Engine
class Obfuscator {
    static obfuscate(source, level = 'medium') {
        let obfuscated = source;
        
        // Remove comments
        obfuscated = obfuscated.replace(/--\[\[[\s\S]*?\]\]/g, '');
        obfuscated = obfuscated.replace(/--.*$/gm, '');
        
        // Minify
        obfuscated = obfuscated.replace(/\s+/g, ' ');
        obfuscated = obfuscated.replace(/;\s*;/g, ';');
        
        // String encryption
        const stringPattern = /(["'])(?:(?=(\\?))\2.)*?\1/g;
        let stringIndex = 0;
        const stringStore = {};
        
        obfuscated = obfuscated.replace(stringPattern, (match) => {
            const encoded = Buffer.from(match.slice(1, -1)).toString('base64');
            const varName = `_S${stringIndex++}`;
            stringStore[varName] = encoded;
            return varName;
        });
        
        // Variable renaming
        const varPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        const reservedWords = ['if', 'then', 'else', 'elseif', 'end', 'function', 'local', 'return', 'for', 'while', 'do', 'break', 'nil', 'true', 'false', 'and', 'or', 'not', 'in', 'repeat', 'until'];
        const varMap = new Map();
        let varCounter = 0;
        
        obfuscated = obfuscated.replace(varPattern, (match) => {
            if (reservedWords.includes(match) || match.startsWith('_S') || match.startsWith('_V')) return match;
            if (!varMap.has(match)) {
                varMap.set(match, `_V${varCounter++}`);
            }
            return varMap.get(match);
        });
        
        // Build final script
        let finalScript = `-- Luarmor Protected Script\n-- Generated: ${new Date().toISOString()}\n\n`;
        
        // Add decoder
        finalScript += `local function _D(s) local t={} for i=1,#s,2 do t[#t+1]=string.char(tonumber(s:sub(i,i+1),16)) end return table.concat(t) end\n\n`;
        
        // Add string table
        finalScript += `local _S={}\n`;
        for (const [varName, value] of Object.entries(stringStore)) {
            finalScript += `_S.${varName}=_D("${Buffer.from(value).toString('hex')}")\n`;
        }
        finalScript += `\n`;
        
        // Add main code
        finalScript += obfuscated;
        
        return finalScript;
    }
    
    static generateLoadstring(obfuscatedCode) {
        const encoded = Buffer.from(obfuscatedCode).toString('base64');
        return `loadstring(game:HttpGet("https://your-domain.com/raw/${Buffer.from(encoded).toString('base64').slice(0, 20)}"))()`;
    }
}

// Slash Commands
const commands = [
    {
        name: 'createscript',
        description: 'Create a new protected script',
        options: [
            {
                name: 'name',
                description: 'Name of your script',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'whitelist',
        description: 'Whitelist a user for your script',
        options: [
            {
                name: 'user',
                description: 'User to whitelist',
                type: 6,
                required: true
            },
            {
                name: 'days',
                description: 'Number of days to whitelist',
                type: 4,
                required: true
            }
        ]
    },
    {
        name: 'blacklist',
        description: 'Blacklist a user from your script',
        options: [
            {
                name: 'user',
                description: 'User to blacklist',
                type: 6,
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for blacklist',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'genkey',
        description: 'Generate a license key for your script',
        options: [
            {
                name: 'script',
                description: 'Script name or ID',
                type: 3,
                required: true
            },
            {
                name: 'days',
                description: 'Days until key expires',
                type: 4,
                required: true
            }
        ]
    },
    {
        name: 'setbuyerrole',
        description: 'Set the buyer role for your script',
        options: [
            {
                name: 'script',
                description: 'Script name or ID',
                type: 3,
                required: true
            },
            {
                name: 'role',
                description: 'Role to set as buyer role',
                type: 8,
                required: true
            }
        ]
    },
    {
        name: 'hwidresetcd',
        description: 'Reset HWID cooldown for a user',
        options: [
            {
                name: 'user',
                description: 'User to reset HWID for',
                type: 6,
                required: true
            }
        ]
    },
    {
        name: 'stats',
        description: 'View your script statistics',
        options: [
            {
                name: 'script',
                description: 'Script name or ID',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'myscripts',
        description: 'View all your scripts'
    }
];

// Register commands when ready
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Slash commands registered');
    } catch (error) {
        console.error(error);
    }
});

// Command handlers
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const { commandName, user, options } = interaction;
    
    switch (commandName) {
        case 'createscript':
            const scriptName = options.getString('name');
            const scriptId = crypto.randomBytes(8).toString('hex');
            
            const newScript = new Script({
                scriptId: scriptId,
                name: scriptName,
                ownerId: user.id,
                ownerName: user.username,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
            });
            
            await newScript.save();
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Script Created!')
                .setDescription(`**Name:** ${scriptName}\n**Script ID:** \`${scriptId}\`\n\nUse the dashboard to add your source code:\n**Dashboard:** ${process.env.DASHBOARD_URL}/script/${scriptId}`)
                .setColor(0x00ff00);
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
            
        case 'whitelist':
            const targetUser = options.getUser('user');
            const days = options.getNumber('days');
            const scriptToWhitelist = await Script.findOne({ ownerId: user.id });
            
            if (!scriptToWhitelist) {
                return interaction.reply({ content: '❌ You don\'t have any scripts! Use /createscript first.', ephemeral: true });
            }
            
            const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
            
            scriptToWhitelist.whitelist.push({
                userId: targetUser.id,
                expiresAt: expiresAt
            });
            
            await scriptToWhitelist.save();
            
            const whitelistEmbed = new EmbedBuilder()
                .setTitle('✅ User Whitelisted')
                .setDescription(`${targetUser.tag} has been whitelisted for ${days} days`)
                .addFields({ name: 'Expires', value: expiresAt.toLocaleString() })
                .setColor(0x00ff00);
            
            await interaction.reply({ embeds: [whitelistEmbed], ephemeral: true });
            break;
            
        case 'blacklist':
            const blacklistUser = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            const scriptToBlacklist = await Script.findOne({ ownerId: user.id });
            
            if (!scriptToBlacklist) {
                return interaction.reply({ content: '❌ You don\'t have any scripts!', ephemeral: true });
            }
            
            scriptToBlacklist.blacklist.push({
                userId: blacklistUser.id,
                reason: reason
            });
            
            await scriptToBlacklist.save();
            
            const blacklistEmbed = new EmbedBuilder()
                .setTitle('⛔ User Blacklisted')
                .setDescription(`${blacklistUser.tag} has been blacklisted`)
                .addFields({ name: 'Reason', value: reason })
                .setColor(0xff0000);
            
            await interaction.reply({ embeds: [blacklistEmbed], ephemeral: true });
            break;
            
        case 'genkey':
            const scriptForKey = options.getString('script');
            const keyDays = options.getNumber('days');
            const keyScript = await Script.findOne({ 
                $or: [
                    { scriptId: scriptForKey },
                    { name: scriptForKey, ownerId: user.id }
                ]
            });
            
            if (!keyScript || keyScript.ownerId !== user.id) {
                return interaction.reply({ content: '❌ Script not found or you don\'t own it!', ephemeral: true });
            }
            
            const licenseKey = crypto.randomBytes(16).toString('hex').toUpperCase();
            const keyExpiresAt = new Date(Date.now() + keyDays * 24 * 60 * 60 * 1000);
            
            const newKey = new Key({
                key: licenseKey,
                scriptId: keyScript.scriptId,
                userId: user.id,
                expiresAt: keyExpiresAt
            });
            
            await newKey.save();
            
            const keyEmbed = new EmbedBuilder()
                .setTitle('🔑 License Key Generated')
                .setDescription(`**Key:** \`${licenseKey}\`\n**Expires:** ${keyExpiresAt.toLocaleString()}`)
                .addFields({ name: 'Script', value: keyScript.name })
                .setColor(0x00ff00);
            
            await interaction.reply({ embeds: [keyEmbed], ephemeral: true });
            break;
            
        case 'setbuyerrole':
            const buyerScript = options.getString('script');
            const buyerRole = options.getRole('role');
            const targetScript = await Script.findOne({ 
                $or: [
                    { scriptId: buyerScript },
                    { name: buyerScript, ownerId: user.id }
                ]
            });
            
            if (!targetScript || targetScript.ownerId !== user.id) {
                return interaction.reply({ content: '❌ Script not found or you don\'t own it!', ephemeral: true });
            }
            
            targetScript.buyerRoleId = buyerRole.id;
            await targetScript.save();
            
            await interaction.reply({ content: `✅ Buyer role set to ${buyerRole.name} for script ${targetScript.name}`, ephemeral: true });
            break;
            
        case 'hwidresetcd':
            const resetUser = options.getUser('user');
            const userKeys = await Key.find({ userId: resetUser.id });
            
            for (const key of userKeys) {
                key.hwidResetCount = 0;
                key.lastHwidReset = new Date();
                await key.save();
            }
            
            await interaction.reply({ content: `✅ HWID reset cooldown reset for ${resetUser.tag}`, ephemeral: true });
            break;
            
        case 'stats':
            const statScript = options.getString('script');
            const statsScript = await Script.findOne({ 
                $or: [
                    { scriptId: statScript },
                    { name: statScript, ownerId: user.id }
                ]
            });
            
            if (!statsScript) {
                return interaction.reply({ content: '❌ Script not found!', ephemeral: true });
            }
            
            // Find user's whitelist entry
            const userWhitelist = statsScript.whitelist.find(w => w.userId === user.id);
            
            const statsEmbed = new EmbedBuilder()
                .setTitle(`📊 Statistics for ${statsScript.name}`)
                .addFields(
                    { name: 'Script ID', value: statsScript.scriptId, inline: true },
                    { name: 'Whitelisted Users', value: statsScript.whitelist.length.toString(), inline: true },
                    { name: 'Blacklisted Users', value: statsScript.blacklist.length.toString(), inline: true },
                    { name: 'Created', value: statsScript.createdAt.toLocaleDateString(), inline: true },
                    { name: 'Expires', value: statsScript.expiresAt ? statsScript.expiresAt.toLocaleDateString() : 'Never', inline: true }
                );
            
            if (userWhitelist) {
                statsEmbed.addFields({ name: 'Your Whitelist Status', value: `Expires: ${userWhitelist.expiresAt.toLocaleString()}`, inline: false });
            }
            
            await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
            break;
            
        case 'myscripts':
            const userScripts = await Script.find({ ownerId: user.id });
            
            if (userScripts.length === 0) {
                return interaction.reply({ content: '❌ You don\'t have any scripts! Use /createscript to make one.', ephemeral: true });
            }
            
            let description = '';
            for (const script of userScripts) {
                description += `**${script.name}**\nID: \`${script.scriptId}\`\nWhitelisted: ${script.whitelist.length} users\n\n`;
            }
            
            const myScriptsEmbed = new EmbedBuilder()
                .setTitle('📝 Your Scripts')
                .setDescription(description)
                .setColor(0x0099ff);
            
            await interaction.reply({ embeds: [myScriptsEmbed], ephemeral: true });
            break;
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
