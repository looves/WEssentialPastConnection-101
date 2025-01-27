const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const DroppedCard = require('../models/DroppedCard');
const rarityToEmojis = require('../utils/rarityToEmojis');


module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Muestra todas las cartas en tu inventario.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Usuario cuyo inventario deseas ver.'))
    .addStringOption(option =>
      option.setName('idol')
        .setDescription('Filtra por nombre de la carta.'))
    .addStringOption(option =>
      option.setName('grupo')
        .setDescription('Filtra por grupo de la carta.'))
    .addStringOption(option =>
      option.setName('era')
        .setDescription('Filtra por era de la carta.'))
    .addStringOption(option =>
      option.setName('eshort')
        .setDescription('Filtra por era corta de la carta.'))
    .addStringOption(option =>
      option.setName('rarity')
        .setDescription('Filtra por rareza de la carta.'))
    .addStringOption(option =>
      option.setName('event')  // Agregar filtro por evento
        .setDescription('Filtra por evento de la carta.'))
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]),

  async execute(interaction) {
    const userId = interaction.options.getUser('user')?.id || interaction.user.id;
    const idolFilter = interaction.options.getString('idol');
    const grupoFilter = interaction.options.getString('grupo');
    const eraFilter = interaction.options.getString('era');
    const eshortFilter = interaction.options.getString('eshort');
    const rarityFilter = interaction.options.getString('rarity');
    const eventFilter = interaction.options.getString('event'); // Filtro para el evento

    const user = await interaction.client.users.fetch(userId);
    
    try {
      await interaction.deferReply();

      // Escapar caracteres especiales en las búsquedas
      const escapeRegex = (text) => {
        return text.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, '\\$&');
      };

      // Construir la consulta
      const query = { userId }; // Filtro por usuario
      if (idolFilter) query.idol = new RegExp(escapeRegex(idolFilter), 'i');
      if (grupoFilter) query.grupo = new RegExp(escapeRegex(grupoFilter), 'i');
      if (eraFilter) query.era = new RegExp(escapeRegex(eraFilter), 'i');
      if (eshortFilter) query.eshort = new RegExp(escapeRegex(eshortFilter), 'i');
      if (rarityFilter) query.rarity = new RegExp(escapeRegex(rarityFilter), 'i');
      if (eventFilter) query.event = new RegExp(escapeRegex(eventFilter), 'i'); // Filtro por evento

      // Contar el número total de cartas que coinciden con los filtros
      const totalCards = await DroppedCard.countDocuments(query);
      if (totalCards === 0) {
        return interaction.editReply({ content: 'No tienes cartas en tu inventario que coincidan con los filtros especificados.'});
      }

      const maxFields = 9;  // Mostrar 9 cartas por página
      const totalPages = Math.ceil(totalCards / maxFields);
      let currentPage = 0;  // Página inicial

      // Función para crear el embed de la página actual
      const createEmbed = async (page) => {
        const cards = await DroppedCard.find(query)  // Buscar cartas con los filtros aplicados
          .select('idol eshort grupo copyNumber rarity uniqueCode event')  // Seleccionar solo los campos necesarios, incluyendo event
          .skip(page * maxFields)  // Omitir los resultados previos
          .limit(maxFields)  // Limitar a 9 resultados
          .lean();  // Usar lean para mejorar el rendimiento

        const embed = new EmbedBuilder()
          .setAuthor({ name: `${user.username}'s Inventory`, iconURL: user.displayAvatarURL()})
          .setTimestamp()
          .setColor('#60a5fa')
          .setFooter({ text: `Página ${page + 1} de ${totalPages}` });

      cards.forEach(card => {
          let emoji = rarityToEmojis(card.rarity); // Emoji de rareza por defecto

          // Si hay un evento, usamos el emoji del evento
          if (card.event) {
            emoji = rarityToEmojis(card.event); // Usamos el emoji del evento si está presente
          }

          embed.addFields({
            name: `${card.idol} <:dot:1296707029087555604> \`#${card.copyNumber}\``,
            value: `${emoji} ${card.grupo} ${card.eshort}\n\`\`\`${card.uniqueCode}\`\`\``,
            inline: true,
          });
        });

        return embed;
      };
      // Crear los botones de navegación
      const getButtonRow = (currentPage, totalPages) => {
        return new ActionRowBuilder()
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
      };

      // Mostrar la respuesta inicial con los botones
      const message = await interaction.editReply({
        embeds: [await createEmbed(currentPage)],
        components: [getButtonRow(currentPage, totalPages)],
      });

      // Configurar el colector de botones
      const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      collector.on('collect', async i => {
        // Verificar que la interacción pertenece al mensaje correcto
        if (i.message.id !== message.id) return;

        // Verificar que el usuario es el que ejecutó el comando
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
          // Utiliza i.update para cerrar el inventario
          await i.update({ content: `</inventory:1291579000044650513> cerrado...`, embeds: [], components: [] });
          collector.stop();  // Detener el colector después de cerrar
          return;
        }

        // Actualizar el mensaje con la nueva página
        await i.update({
          embeds: [await createEmbed(currentPage)],
          components: [getButtonRow(currentPage, totalPages)],
        });
      });


      collector.on('end', async () => {
        try {
          // Si el mensaje sigue estando accesible, usa `message.edit()` para deshabilitar los botones
          if (message.channel?.isTextBased() && message.channel.viewable) {
            await message.edit({ components: [] }); // Deshabilitar los botones
          }
        } catch (error) {
          console.error("Error al actualizar los componentes:", error);
        }
      });


    } catch (error) {
      console.error('Error al ejecutar el comando /inventory:', error);
      await interaction.editReply({ content: 'Hubo un error al procesar el comando. Por favor, inténtalo de nuevo.', ephemeral: true });
    }
  }
};
