const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, AttachmentBuilder, GuildMember } = require('discord.js');
const Card = require('../models/Card');
const DroppedCard = require('../models/DroppedCard');
const User = require('../models/User');
const updateInventory = require('../utils/updateInventory');
const incrementCardCount = require('../utils/incrementCardCount');
const generateCardCode = require('../utils/generateCardCode');
const getImageExtension = require('../utils/getImageExtension');
const db = require('../db');
const { selectCard } = require('../utils/rarityUtils');
const checkBan = require('../utils/checkBan');

const BASE_COOLDOWN_TIME = 8 * 60 * 1000; // 8 minutos para usuarios normales
const BOOSTER_COOLDOWN_TIME = 7 * 60 * 1000; // 7 minutos para usuarios con rol de Booster
const WENEE_COOLDOWN_TIME = 6 * 60 * 1000; // 6 minutos para usuarios con rol de Wenee
const SEOKI_COOLDOWN_TIME = 6 * 60 * 1000; // 5 minutos para usuarios con rol de Seoki

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drop')
        .setDescription('Obtén una card aleatoria.')
        .setIntegrationTypes([0, 1])
        .setContexts([0, 1, 2]),

    async execute(interaction) {
        const userId = interaction.user.id;
        const currentTime = Date.now();

        try {
            await interaction.deferReply();
        } catch (error) {
            console.error('Error al deferir la respuesta:', error);
            return; // Termina la ejecución del comando si ocurre un error
        }

        // Asegurarse de que el usuario existe en la base de datos
        await User.findOneAndUpdate(
            { userId },
            { $setOnInsert: { username: interaction.user.tag } },
            { upsert: true }
        );
        const user = await User.findOne({ userId });

        // Llamada a checkBan para verificar si el usuario está baneado
        if (await checkBan(userId)) {
            return interaction.editReply(`No puedes usar el comando \`/drop\` porque estás baneado.\n-# Si crees que estás baneado por error, abre ticket en Wonho's House <#1248108503973757019>.`);
        }

        try {
            const cards = await db.fetchData();

            if (cards.length === 0) {
                return interaction.editReply('No hay cartas disponibles en la base de datos.');
            }

            let member;
            if (interaction.guild) { // Verificar si estamos en un servidor
                try {
                    member = await interaction.guild.members.fetch(userId);
                } catch (error) {
                    console.error('Error al obtener el miembro:', error);
                    return interaction.editReply('No se pudo encontrar el miembro en el servidor.');
                }
            } else {
                // En un DM, no necesitamos obtener el miembro del servidor
                member = interaction.user;
            }

           
            // Verificar si el usuario está en cooldown
            if (user.lastDrop) {
                const lastDropTime = new Date(user.lastDrop).getTime();
                const timeElapsed = currentTime - lastDropTime;

                if (timeElapsed < cooldownTime) {
                    const remainingTime = cooldownTime - timeElapsed;
                    const minutes = Math.floor(remainingTime / 60000);
                    const seconds = Math.floor((remainingTime % 60000) / 1000);
                    return interaction.editReply(`¡Debes esperar \`${minutes}\` minutos y \`${seconds}\` segundos antes de usar el comando nuevamente!`);
                }
            }

            const selectedCard = await selectCard(cards, member);

            const uniqueCode = generateCardCode(selectedCard.idol, selectedCard.grupo, selectedCard.era, String(selectedCard.rarity), selectedCard.event);
            const cardCode = `${selectedCard.idol[0]}${selectedCard.grupo[0]}${selectedCard.era[0]}${selectedCard.event || selectedCard.rarity}`;

            // Incrementar el contador de cartas y actualizar el inventario
            const { copyNumber } = await incrementCardCount(userId, selectedCard._id);

            if (copyNumber <= 0) {
                return interaction.editReply('No se pudo incrementar el contador de la carta.');
            }


            const imageUrl = selectedCard.image;
            const extension = getImageExtension(imageUrl);
            const attachment = new AttachmentBuilder(imageUrl, { name: `${cardCode}${extension}` });

            // Lógica para determinar el level
            let level = 'level 0';

            // Verificar si estamos en un servidor
            if (member && member.guild) {
                // Solo verificar los roles si estamos en un servidor
                if (member.roles.cache.has('1327386590758309959')) { // SEOKI_ROLE_ID
                    level = 'level 3';
                } else if (member.roles.cache.has('1281839512829558844')) { // WENEE_ROLE_ID
                    level = 'level 2';
                } else if (member.roles.cache.has('1077366130915672165')) { // BOOSTER_ROLE_ID
                    level = 'level 1';
                }
            } else {
                level = 'level 0';
            }

            const embed = new EmbedBuilder()
                .setColor('#60a5fa')
                .setDescription(`_ _<@${interaction.user.id}>, adquiriste a \`${selectedCard.idol}\` de **${selectedCard.grupo}**\n_ _ **${selectedCard.era || selectedCard.event}** <:dot:1291582825232994305> \`#${copyNumber}\`\n_ _ \`\`\`${uniqueCode}\`\`\`\n_ _　[server support](https://discord.gg/wonho) | [patreon](https://www.patreon.com/wonhobot) | \`${level}\``);

            // Responder con el embed y la imagen
            await interaction.editReply({ embeds: [embed], files: [attachment] });

            // Crear la carta caída
            const droppedCard = new DroppedCard({
                userId,
                cardId: selectedCard._id,
                idol: selectedCard.idol,
                grupo: selectedCard.grupo,
                era: selectedCard.era,
                eshort: selectedCard.eshort,
                rarity: selectedCard.rarity,
                event: selectedCard.event,
                uniqueCode,
                command: '/drop',
                copyNumber,
            });

            // Guardar la carta caída, actualizar el inventario
            await Promise.all([
                droppedCard.save(),
                updateInventory(userId, [{ cardId: selectedCard._id, count: copyNumber }]),
                User.findOneAndUpdate({ userId }, { lastDrop: new Date() })
            ]);

 // Determinar el cooldown basado en el rol
            let cooldownTime = BASE_COOLDOWN_TIME;  // Tiempo predeterminado para usuarios normales



            // Si estamos en un servidor (es decir, el miembro tiene roles)
            if (member instanceof GuildMember) {
                if (member.roles.cache.has('1327386590758309959')) { // Seoki
                    cooldownTime = SEOKI_COOLDOWN_TIME;
                } else if (member.roles.cache.has('1281839512829558844')) { // Wenee
                    cooldownTime = WENEE_COOLDOWN_TIME;
                } else if (member.roles.cache.has('1077366130915672165')) { // Booster
                    cooldownTime = BOOSTER_COOLDOWN_TIME;
                }
            }


            // Mensaje para el cooldown, programado con setTimeout
            setTimeout(() => {
                // Verificar si estamos en un servidor o en un DM
                if (interaction.guild) {
                    // Si estamos en un servidor, usamos `interaction.channel.send`
                    interaction.channel.send(`<@${userId}>, el comando </drop:1291579000044650509> ya está disponible nuevamente!`).catch(console.error);
                } else {
                    // Si estamos en un DM, usamos `interaction.user.send`
                    interaction.user.send(`¡El comando </drop:1291579000044650509> ya está disponible nuevamente!`).catch(console.error);
                }
            }, cooldownTime);

        } catch (error) {
            console.error('Error al procesar el comando /drop:', error);
            if (error.name === 'VersionError') {
                return interaction.editReply('Hubo un conflicto al actualizar tu inventario. Por favor, intenta nuevamente.');
            }
            await interaction.editReply('Hubo un error al intentar obtener la carta. Por favor, inténtalo de nuevo.');
        }
    },
};
