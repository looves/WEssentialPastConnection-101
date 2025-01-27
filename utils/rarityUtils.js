const BOOSTER_ROLE_ID = '1077366130915672165'; // Reemplaza con el ID real del rol booster
const WENEE_ROLE_ID = '1281839512829558844'; // Reemplaza con el ID real del rol wenee
const SEOKI_ROLE_ID = '1327386590758309959'; // Reemplaza con el ID real del rol wenee

const rarityProbabilities = {
  1: 70, // Común
  2: 27, // Poco común
  3: 3  // Raro
};

function getRandomRarity(probabilities) {
  const random = Math.random() * 100;
  let cumulativeProbability = 0;

  for (const [rarity, probability] of Object.entries(probabilities)) {
    cumulativeProbability += probability;
    if (random < cumulativeProbability) {
      return rarity;
    }
  }
}

async function selectCard(cards, interaction) {
  let member = null;

  // Verificar si la interacción es en un servidor
  if (interaction.guild) {
    member = await interaction.guild.members.fetch(interaction.user.id);
  }

  // Selección de rareza en función de los roles si es en servidor
  let selectedRarity;

  if (member) {
    const hasBoosterRole = member.roles.cache.has(BOOSTER_ROLE_ID);
    const hasWeneeRole = member.roles.cache.has(WENEE_ROLE_ID);
    const hasSeokiRole = member.roles.cache.has(SEOKI_ROLE_ID);

    if (hasBoosterRole) {
      selectedRarity = getRandomRarity({
        1: 57, // Aumentar la probabilidad de común para Booster
        2: 35, // Aumentar la probabilidad de poco común para Booster
        3: 8  // Mantener la probabilidad de raro para Booster
      });
    } else if (hasWeneeRole) {
      selectedRarity = getRandomRarity({
        1: 48, // Aumentar la probabilidad de común para Patreon
        2: 40, // Aumentar la probabilidad de poco común para Patreon
        3: 12  // Aumentar la probabilidad de raro para Patreon
      });
    } else if (hasSeokiRole) {
      selectedRarity = getRandomRarity({
        1: 40, // Aumentar la probabilidad de común para Patreon
        2: 45, // Aumentar la probabilidad de poco común para Patreon
        3: 16  // Aumentar la probabilidad de raro para Patreon
      });
    } else {
      selectedRarity = getRandomRarity(rarityProbabilities);
    }
  } else {
    // Si no es en un servidor (es un DM), simplemente usa las probabilidades predeterminadas
    selectedRarity = getRandomRarity(rarityProbabilities);
  }

  // 4% de probabilidad de seleccionar una carta de tipo "event"
  let isEventCardSelected = Math.random() < 0.04;

  // Si se selecciona una carta de evento, se filtra por el campo 'event' en el modelo
  if (isEventCardSelected) {
    const eventCards = cards.filter(card => card.event && card.event !== '');  // Filtrar por 'event' no vacío

    // Si existen cartas de tipo event, seleccionamos una de ellas
    if (eventCards.length > 0) {
      return eventCards[Math.floor(Math.random() * eventCards.length)];
    } 
  }

  // Filtrar cartas por la rareza seleccionada
  const filteredCards = cards.filter(card => card.rarity == selectedRarity);

  // Si no hay cartas de la rareza seleccionada, devolver la primera
  return filteredCards.length > 0
    ? filteredCards[Math.floor(Math.random() * filteredCards.length)]
    : cards[Math.floor(Math.random() * cards.length)];
}

module.exports = {
  getRandomRarity,
  selectCard,
};
