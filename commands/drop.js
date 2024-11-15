const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
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

const BOOSTER_ROLE_ID = '1077366130915672165'; // ID de rol para booster
const PATREON_ROLE_ID = '1281839512829558844'; // ID de rol para Patreon
const BASE_COOLDOWN_TIME = 8 * 60 * 1000; // 8 minutos para usuarios normales
const BOOSTER_COOLDOWN_TIME = 6 * 60 * 1000; // 6 minutos para usuarios con rol de Booster
const PATREON_COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutos para usuarios con rol de Patreon

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drop')
        .setDescription('Obtén una card aleatoria.'),

    async execute(interaction) {

          try {
            await interaction.deferReply();
          } catch (error) {
            // Si hay un error al deferir la respuesta, simplemente hacer un return para evitar que el bot se caiga
            console.error('Error al deferir la respuesta:', error);
            return; // Termina la ejecución del comando si ocurre un error
          }// Defer the reply immediately

        const userId = interaction.user.id;
        const currentTime = Date.now();

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
        
        // Determinar el cooldown basado en el rol
        let cooldownTime = BASE_COOLDOWN_TIME;

        if (interaction.guild.members.cache.get(userId).roles.cache.has(PATREON_ROLE_ID)) {
            cooldownTime = PATREON_COOLDOWN_TIME; 
        } 
        else if (interaction.guild.members.cache.get(userId).roles.cache.has(BOOSTER_ROLE_ID)) {
            cooldownTime = BOOSTER_COOLDOWN_TIME; 
        }


        // Verificar si el usuario está en cooldown
        if (user.lastDrop) {
            const lastDropTime = new Date(user.lastDrop).getTime();
            const timeElapsed = currentTime - lastDropTime;

            if (timeElapsed < cooldownTime) {
                const remainingTime = cooldownTime - timeElapsed;
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);
                return interaction.editReply(`¡Debes esperar ${minutes} minutos y ${seconds} segundos antes de usar el comando \`/drop\` nuevamente!`);
            }
        }

        try {
            const cards = await db.fetchData();

            if (cards.length === 0) {
                return interaction.editReply('No hay cartas disponibles en la base de datos.');
            }

            const member = await interaction.guild.members.fetch(userId);
            const selectedCard = await selectCard(cards, member);

            const uniqueCode = generateCardCode(selectedCard.idol, selectedCard.grupo, selectedCard.era, String(selectedCard.rarity));
            const cardCode = `${selectedCard.idol[0]}${selectedCard.grupo[0]}${selectedCard.era[0]}${selectedCard.rarity}`;

            // Incrementar el contador de cartas y actualizar el inventario
            const { copyNumber } = await incrementCardCount(userId, selectedCard._id);

            if (copyNumber <= 0) {
                return interaction.editReply('No se pudo incrementar el contador de la carta.');
            }

            // Crear la carta caída
            const droppedCard = new DroppedCard({
                userId,
                cardId: selectedCard._id,
                idol: selectedCard.idol,
                grupo: selectedCard.grupo,
                era: selectedCard.era,
                eshort: selectedCard.eshort,
                rarity: selectedCard.rarity,
                uniqueCode,
                command: '/drop',
                copyNumber
            });

            // Guardar la carta caída, actualizar el inventario y la fecha del último drop
            await Promise.all([
                droppedCard.save(),
                updateInventory(userId, [{ cardId: selectedCard._id, count: copyNumber }]),
                User.findOneAndUpdate({ userId }, { lastDrop: new Date() })
            ]);

            const imageUrl = selectedCard.image;
            const extension = getImageExtension(imageUrl);
            const attachment = new AttachmentBuilder(imageUrl, { name: `${cardCode}${extension}` });
            

            // Lógica para determinar el level
            let level = 'level 0';
            if (member.roles.cache.has(PATREON_ROLE_ID)) {
                level = 'level 2';
            } else if (member.roles.cache.has(BOOSTER_ROLE_ID)) {
                level = 'level 1'; 
            }


            const embed = new EmbedBuilder()
                .setColor('#60a5fa')
                .setDescription(`_ _<@${interaction.user.id}>, adquiriste a \`${selectedCard.idol}\` de **${selectedCard.grupo}**\n_ _ **${selectedCard.era}** <:dot:1291582825232994305> \`#${copyNumber}\`\n_ _ \`\`\`${uniqueCode}\`\`\`\n_ _　[server support](https://discord.gg/wonho) | [patreon](https://www.patreon.com/wonhobot) | \`${level}\``);

            // Responder con el embed y la imagen
            await interaction.editReply({ embeds: [embed], files: [attachment] });

            // Mensaje para el cooldown
            setTimeout(() => {
                interaction.channel.send(`<@${userId}>, el comando \`/drop\` ya está disponible nuevamente!`).catch(console.error);
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
