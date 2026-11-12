// Dishes from the 2026 rate card. In Phase 3 this moves into the database.
export const MENU = {
  starters: ["Plantain chips & coated groundnuts", "Spring rolls / samosa"],
  desserts: ["Fruit platter", "Ice cream", "Mini pancakes", "Abele"],
  rice: ["Fried rice", "Jollof rice", "Plain rice", "Veg. rice", "Spaghetti rice", "Waakye"],
  local: [
    "Banku", "Fufu", "Rice balls", "Kokonte", "Grilled tilapia", "Okro soup",
    "Goat light soup", "Chicken light soup", "Groundnut soup", "Palm nut soup", "Apapransa",
  ],
  extras: [
    "Fish balls", "Meat balls", "Yam balls", "Fried yam",
    "Chili peppered gizzard", "Kosua ne mako (boiled eggs and pepper sauce)",
  ],
};

const BASE = [
  "Beef sauce", "Chicken (grilled or fried)", "Fish", "Salads",
  "Spaghetti stir fry", "Gari", "Tomato sauce / stew", "Green chilli sauce", "Shito",
];

// What each package already includes, besides the dishes picked on the form.
export const PACKAGE_INCLUDES = {
  bronze: { fixed: BASE, starter: false, dessert: false },
  silver: { fixed: [...BASE, "Kelewele"], starter: "either", dessert: "either" },
  gold: { fixed: [...BASE, "Kelewele"], starter: true, dessert: true },
};
