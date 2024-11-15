const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const DroppedCard = require('../models/DroppedCard');
const rarityToEmojis = require('../utils/rarityToEmojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('global')
    .setDescription('Busca cartas globalmente.')
    .addStringOption(option =>
      option.setName('idol')
        .setDescription('Nombre del idol')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('grupo')
        .setDescription('Nombre del grupo')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('era')
        .setDescription('Nombre de la era')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('eshort')
        .setDescription('Nombre de la era corta')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('rarity')
        .setDescription('Rareza de la carta')
        .setRequired(false)),

  async execute(interaction) {
    const idolFilter = interaction.options.getString('idol');
    const grupoFilter = interaction.options.getString('grupo');
    const eraFilter = interaction.options.getString('era');
    const eshortFilter = interaction.options.getString('eshort');
    const rarity = interaction.options.getString('rarity');

    try {
      await interaction.deferReply();  // Deferir la respuesta inmediatamente

      const allDroppedCards = await DroppedCard.find();
      let filteredCards = allDroppedCards;

      const cleanString = (str) => {
        return String(str).replace(/[^\w\s]/g, '').toLowerCase(); // Limpiar caracteres especiales
      };

      if (idolFilter) {
        filteredCards = filteredCards.filter(card => card.idol && card.idol.toLowerCase().includes(idolFilter.toLowerCase()));
      }
      if (grupoFilter) {
        filteredCards = filteredCards.filter(card => card.grupo && cleanString(card.grupo).includes(cleanString(grupoFilter)));
      }
      if (eraFilter) {
        filteredCards = filteredCards.filter(card => card.era && cleanString(card.era).includes(cleanString(eraFilter)));
      }
      if (eshortFilter) {
        filteredCards = filteredCards.filter(card => card.eshort && card.eshort.toLowerCase().includes(eshortFilter.toLowerCase()));
      }
      if (rarity) {
        filteredCards = filteredCards.filter(card => card.rarity === rarity);
      }

      const maxFields = 9;
      const totalPages = Math.ceil(filteredCards.length / maxFields);
      let currentPage = 0;

      if (filteredCards.length === 0) {
        return interaction.editReply({ content: 'No se encontraron cartas con los criterios especificados.', ephemeral: true });
      }

      const createEmbed = (page) => {
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${filteredCards.length} cartas en total`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp()
          .setColor('#60a5fa')
          .setFooter({ text: `Página ${page + 1} de ${totalPages}` });

        const startIndex = page * maxFields;
        const endIndex = Math.min(startIndex + maxFields, filteredCards.length);
        for (let i = startIndex; i < endIndex; i++) {
          const card = filteredCards[i];
          embed.addFields({
            name: `${card.idol} <:dot:1296707029087555604> \`#${card.copyNumber}\``,
            value: `${rarityToEmojis(card.rarity)} ${card.grupo} ${card.eshort}\n\`\`\`${card.uniqueCode}\`\`\` <@${card.userId}>`,
            inline: true,
          });
        }
        return embed;
      };

      const getButtonRow = (currentPage, totalPages) => {
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('first')
              .setEmoji("<:first:1290467842462060605>")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId('previous')
              .setEmoji("<:prev:1290467827739787375>")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId('close')
              .setEmoji("<:close:1290467856437481574>")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('next')
              .setEmoji("<:next:1290467800065769566>")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage >= totalPages - 1),
            new ButtonBuilder()
              .setCustomId('last')
              .setEmoji("<:last:1290467815127519322>")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage >= totalPages - 1)
          );

        return row;
      };

      // Muestra la respuesta inicial con los botones
      const message = await interaction.editReply({
        embeds: [createEmbed(currentPage)],
        components: [getButtonRow(currentPage, totalPages)],
      });

      // Configura el colector de botones
      const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      collector.on('collect', async i => {
        // Verifica que la interacción pertenezca al mensaje correcto
        if (i.message.id !== message.id) return;

        // Verifica que el usuario es el que ejecutó el comando
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: 'No puedes interactuar con este botón.', ephemeral: true });
        }

        if (i.customId === 'previous' && currentPage > 0) {
          currentPage--;
        } else if (i.customId === 'next' && currentPage < totalPages - 1) {
          currentPage++;
        } else if (i.customId === 'first') {
          currentPage = 0;
        } else if (i.customId === 'last') {
          currentPage = totalPages - 1;
        } else if (i.customId === 'close') {
          await i.update({ content: '**/global cerrado...**', embeds: [], components: [] });
          collector.stop();  // Detener el colector después de cerrar
          return;
        }

        // Actualiza el mensaje con la nueva página
        await i.update({
          embeds: [createEmbed(currentPage)],
          components: [getButtonRow(currentPage, totalPages)],
        });
      });

      collector.on('end', async () => {
        // Deshabilita los botones después de que termine el tiempo
        await message.edit({ components: [] });
      });

    } catch (error) {
      console.error('Error al ejecutar el comando /global:', error);
      await interaction.editReply({ content: 'Hubo un error al procesar el comando. Por favor, inténtalo de nuevo.', ephemeral: true });
    }
  }
};
