const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Obfuscator = require('./obfuscator');
const { Script, Key } = require('./database');
require('dotenv').config();

const client = new Client({
    intents: 3276799
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/luarmor';
mongoose.connect(MONGODB_URI).then(() => console.log('✅ Database connected')).catch(err => console.log('❌ DB Error:', err));

const commands = [
    { name: 'createscript', description: 'Create a new protected script', options: [{ name: 'name', description: 'Script name', type: 3, required: true }] },
    { name: 'addsource', description: 'Add source code to your script', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }, { name: 'code', description: 'Your Lua code', type: 3, required: true }] },
    { name: 'whitelist', description: 'Whitelist a user', options: [{ name: 'user', description: 'User ID', type: 3, required: true }, { name: 'days', description: 'Days', type: 4, required: true }] },
    { name: 'blacklist', description: 'Blacklist a user', options: [{ name: 'user', description: 'User ID', type: 3, required: true }, { name: 'reason', description: 'Reason', type: 3, required: false }] },
    { name: 'genkey', description: 'Generate a license key', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }, { name: 'days', description: 'Days valid', type: 4, required: true }] },
    { name: 'setbuyerrole', description: 'Set buyer role', options: [{ name: 'roleid', description: 'Role ID', type: 3, required: true }] },
    { name: 'hwidresetcd', description: 'Reset HWID cooldown', options: [{ name: 'userid', description: 'User ID', type: 3, required: true }] },
    { name: 'stats', description: 'View your script stats', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }] },
    { name: 'myscripts', description: 'View all your scripts' }
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
        
        const obfuscated = Obfuscator.obfuscate(code);
        script.sourceCode = code;
        script.obfuscatedCode = obfuscated;
        await script.save();
        
        await interaction.reply({ content: `✅ Code added and obfuscated!\nLoadstring: \`${Obfuscator.generateLoadstring(obfuscated)}\``, ephemeral: true });
    }

    else if (commandName === 'whitelist') {
        const targetId = options.getString('user');
        const days = options.getNumber('days');
        const script = await Script.findOne({ ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ No script found! Use /createscript first', ephemeral: true });
        
        const expiresAt = new Date(Date.now() + days * 86400000);
        script.whitelist.push({ userId: targetId, expiresAt });
        await script.save();
        await interaction.reply({ content: `✅ User <@${targetId}> whitelisted for ${days} days!\nExpires: ${expiresAt.toLocaleString()}`, ephemeral: true });
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
        if (!script) return interaction.reply({ content: '❌ Script not found or not yours!', ephemeral: true });
        
        const key = crypto.randomBytes(16).toString('hex').toUpperCase();
        const expiresAt = new Date(Date.now() + days * 86400000);
        const license = new Key({ key, scriptId, userId: user.id, expiresAt });
        await license.save();
        await interaction.reply({ content: `🔑 License Key Generated!\nKey: \`${key}\`\nExpires: ${expiresAt.toLocaleString()}\nScript: ${script.name}`, ephemeral: true });
    }

    else if (commandName === 'setbuyerrole') {
        const roleId = options.getString('roleid');
        const script = await Script.findOne({ ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ No script found!', ephemeral: true });
        
        script.buyerRoleId = roleId;
        await script.save();
        await interaction.reply({ content: `✅ Buyer role set to <@&${roleId}> for script ${script.name}`, ephemeral: true });
    }

    else if (commandName === 'hwidresetcd') {
        const targetId = options.getString('userid');
        await Key.updateMany({ userId: targetId }, { hwidResetCount: 0, lastHwidReset: new Date() });
        await interaction.reply({ content: `✅ HWID reset cooldown cleared for <@${targetId}>`, ephemeral: true });
    }

    else if (commandName === 'stats') {
        const scriptId = options.getString('scriptid');
        const script = await Script.findOne({ scriptId });
        if (!script) return interaction.reply({ content: '❌ Script not found!', ephemeral: true });
        
        const userWhitelist = script.whitelist.find(w => w.userId === user.id);
        const isBlacklisted = script.blacklist.find(b => b.userId === user.id);
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${script.name}`)
            .setColor(0x0099ff)
            .addFields(
                { name: 'Script ID', value: script.scriptId, inline: true },
                { name: 'Owner', value: `<@${script.ownerId}>`, inline: true },
                { name: 'Created', value: script.createdAt.toLocaleDateString(), inline: true },
                { name: 'Whitelisted Users', value: script.whitelist.length.toString(), inline: true },
                { name: 'Blacklisted Users', value: script.blacklist.length.toString(), inline: true }
            );
        
        if (userWhitelist) {
            embed.addFields({ name: '✅ Your Whitelist Status', value: `Expires: ${new Date(userWhitelist.expiresAt).toLocaleString()}`, inline: false });
        } else if (isBlacklisted) {
            embed.addFields({ name: '❌ Your Status', value: `Blacklisted\nReason: ${isBlacklisted.reason}`, inline: false });
        } else {
            embed.addFields({ name: 'ℹ️ Your Status', value: 'Not whitelisted', inline: false });
        }
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'myscripts') {
        const userScripts = await Script.find({ ownerId: user.id });
        
        if (userScripts.length === 0) {
            return interaction.reply({ content: '❌ You don\'t have any scripts! Use /createscript to make one.', ephemeral: true });
        }
        
        let description = '';
        for (const script of userScripts) {
            description += `**${script.name}**\n`;
            description += `ID: \`${script.scriptId}\`\n`;
            description += `Whitelisted: ${script.whitelist.length} users\n`;
            description += `Blacklisted: ${script.blacklist.length} users\n`;
            description += `Created: ${script.createdAt.toLocaleDateString()}\n\n`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📝 Your Scripts')
            .setDescription(description)
            .setColor(0x00ff00);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
