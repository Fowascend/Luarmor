const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    { name: 'whitelist', description: 'Whitelist a user', options: [{ name: 'user', description: 'User', type: 6, required: true }, { name: 'days', description: 'Days', type: 4, required: true }] },
    { name: 'blacklist', description: 'Blacklist a user', options: [{ name: 'user', description: 'User', type: 6, required: true }, { name: 'reason', description: 'Reason', type: 3, required: false }] },
    { name: 'genkey', description: 'Generate a license key', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }, { name: 'days', description: 'Days valid', type: 4, required: true }] },
    { name: 'setbuyerrole', description: 'Set buyer role', options: [{ name: 'role', description: 'Role', type: 8, required: true }] },
    { name: 'hwidresetcd', description: 'Reset HWID cooldown', options: [{ name: 'user', description: 'User', type: 6, required: true }] },
    { name: 'stats', description: 'View your script stats', options: [{ name: 'scriptid', description: 'Script ID', type: 3, required: true }] },
    { name: 'myscripts', description: 'View all your scripts' },
    { name: 'panel', description: 'Create a control panel for your script', options: [{ name: 'scriptid', description: 'Your script ID', type: 3, required: true }] }
];

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Commands registered');
    } catch (error) { console.error(error); }
});

// Handle button interactions
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const [action, scriptId, userId] = interaction.customId.split(':');
        
        const script = await Script.findOne({ scriptId });
        if (!script) {
            return interaction.reply({ content: '❌ Script not found!', ephemeral: true });
        }
        
        if (action === 'getscript') {
            if (!script.obfuscatedCode) {
                return interaction.reply({ content: '❌ No source code added yet!', ephemeral: true });
            }
            const isWhitelisted = script.whitelist.some(w => w.userId === interaction.user.id);
            if (!isWhitelisted) {
                return interaction.reply({ content: '❌ You are not whitelisted for this script!', ephemeral: true });
            }
            await interaction.reply({ content: `🔓 **Your Loadstring**\n\`\`\`lua\n${Obfuscator.generateLoadstring(script.obfuscatedCode)}\n\`\`\``, ephemeral: true });
        }
        
        else if (action === 'getrole') {
            if (!script.buyerRoleId) {
                return interaction.reply({ content: '❌ No buyer role set!', ephemeral: true });
            }
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const role = interaction.guild.roles.cache.get(script.buyerRoleId);
            if (!role) {
                return interaction.reply({ content: '❌ Buyer role not found!', ephemeral: true });
            }
            await member.roles.add(role);
            await interaction.reply({ content: `✅ You received the ${role.name} role!`, ephemeral: true });
        }
        
        else if (action === 'resethwid') {
            const key = await Key.findOne({ scriptId, userId: interaction.user.id });
            if (!key) {
                return interaction.reply({ content: '❌ No key found for you!', ephemeral: true });
            }
            key.hwid = null;
            key.hwidResetCount = (key.hwidResetCount || 0) + 1;
            await key.save();
            await interaction.reply({ content: '✅ HWID has been reset! You can now use your key on a new device.', ephemeral: true });
        }
        
        else if (action === 'getstats') {
            const userWhitelist = script.whitelist.find(w => w.userId === interaction.user.id);
            const key = await Key.findOne({ scriptId, userId: interaction.user.id });
            
            let status = '❌ Not whitelisted';
            let expires = 'N/A';
            let keyExpires = 'N/A';
            
            if (userWhitelist) {
                status = '✅ Whitelisted';
                expires = new Date(userWhitelist.expiresAt).toLocaleString();
            }
            if (key) {
                keyExpires = new Date(key.expiresAt).toLocaleString();
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${script.name} - Your Stats`)
                .setColor(0x0099ff)
                .addFields(
                    { name: 'Status', value: status, inline: true },
                    { name: 'Whitelist Expires', value: expires, inline: true },
                    { name: 'Key Expires', value: keyExpires, inline: true },
                    { name: 'HWID Status', value: key?.hwid ? 'Locked' : 'Not locked', inline: true }
                );
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        return;
    }
    
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
        
        await interaction.reply({ content: `✅ Code added and obfuscated!\nUse /panel ${scriptId} to create a control panel.`, ephemeral: true });
    }

    else if (commandName === 'whitelist') {
        const targetUser = options.getUser('user');
        const days = options.getNumber('days');
        const script = await Script.findOne({ ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ No script found! Use /createscript first', ephemeral: true });
        
        const expiresAt = new Date(Date.now() + days * 86400000);
        script.whitelist.push({ userId: targetUser.id, expiresAt });
        await script.save();
        await interaction.reply({ content: `✅ ${targetUser.tag} whitelisted for ${days} days!\nExpires: ${expiresAt.toLocaleString()}`, ephemeral: true });
    }

    else if (commandName === 'blacklist') {
        const targetUser = options.getUser('user');
        const reason = options.getString('reason') || 'No reason';
        const script = await Script.findOne({ ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ No script found!', ephemeral: true });
        
        script.blacklist.push({ userId: targetUser.id, reason });
        await script.save();
        await interaction.reply({ content: `⛔ ${targetUser.tag} blacklisted!\nReason: ${reason}`, ephemeral: true });
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
        
        const embed = new EmbedBuilder()
            .setTitle('🔑 License Key Generated')
            .setDescription(`**Key:** \`${key}\``)
            .addFields(
                { name: 'Expires', value: expiresAt.toLocaleString(), inline: true },
                { name: 'Script', value: script.name, inline: true }
            )
            .setColor(0x00ff00);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'setbuyerrole') {
        const role = options.getRole('role');
        const script = await Script.findOne({ ownerId: user.id });
        if (!script) return interaction.reply({ content: '❌ No script found!', ephemeral: true });
        
        script.buyerRoleId = role.id;
        await script.save();
        await interaction.reply({ content: `✅ Buyer role set to ${role.name} for script ${script.name}`, ephemeral: true });
    }

    else if (commandName === 'hwidresetcd') {
        const targetUser = options.getUser('user');
        await Key.updateMany({ userId: targetUser.id }, { hwidResetCount: 0, lastHwidReset: new Date() });
        await interaction.reply({ content: `✅ HWID reset cooldown cleared for ${targetUser.tag}`, ephemeral: true });
    }

    else if (commandName === 'stats') {
        const scriptId = options.getString('scriptid');
        const script = await Script.findOne({ scriptId });
        if (!script) return interaction.reply({ content: '❌ Script not found!', ephemeral: true });
        
        const userWhitelist = script.whitelist.find(w => w.userId === user.id);
        const isBlacklisted = script.blacklist.find(b => b.userId === user.id);
        const key = await Key.findOne({ scriptId, userId: user.id });
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${script.name}`)
            .setColor(0x0099ff)
            .addFields(
                { name: 'Script ID', value: script.scriptId, inline: true },
                { name: 'Owner', value: `<@${script.ownerId}>`, inline: true },
                { name: 'Whitelisted', value: script.whitelist.length.toString(), inline: true },
                { name: 'Blacklisted', value: script.blacklist.length.toString(), inline: true }
            );
        
        if (userWhitelist) {
            embed.addFields({ name: '✅ Whitelist Status', value: `Expires: ${new Date(userWhitelist.expiresAt).toLocaleString()}`, inline: false });
        } else if (isBlacklisted) {
            embed.addFields({ name: '❌ Blacklisted', value: `Reason: ${isBlacklisted.reason}`, inline: false });
        } else {
            embed.addFields({ name: 'ℹ️ Status', value: 'Not whitelisted', inline: false });
        }
        
        if (key) {
            embed.addFields({ name: '🔑 Key Expires', value: new Date(key.expiresAt).toLocaleString(), inline: true });
            embed.addFields({ name: '💻 HWID Status', value: key.hwid ? 'Locked' : 'Not locked', inline: true });
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
            description += `Blacklisted: ${script.blacklist.length} users\n\n`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📝 Your Scripts')
            .setDescription(description)
            .setColor(0x00ff00);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'panel') {
        const scriptId = options.getString('scriptid');
        const script = await Script.findOne({ scriptId, ownerId: user.id });
        
        if (!script) {
            return interaction.reply({ content: '❌ Script not found or you don\'t own it!', ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${script.name} Control Panel`)
            .setDescription(`This control panel is for the project: **${script.name}**\n\nIf you're a buyer, click on the buttons below to redeem your key, get the script or get your role.`)
            .setColor(0x5865F2)
            .setTimestamp();
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`getscript:${scriptId}`)
                    .setLabel('Get Script')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔓'),
                new ButtonBuilder()
                    .setCustomId(`getrole:${scriptId}`)
                    .setLabel('Get Role')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎭'),
                new ButtonBuilder()
                    .setCustomId(`resethwid:${scriptId}`)
                    .setLabel('Reset HWID')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId(`getstats:${scriptId}`)
                    .setLabel('Get Stats')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📊')
            );
        
        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

client.login(process.env.DISCORD_TOKEN);
