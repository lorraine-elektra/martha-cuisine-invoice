// Dishes from the 2026 rate card. Used for the optional "Menu" list on an invoice
// and for suggestions when typing an item name. Prices are always typed in by hand.
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

// Suggestions for the item description box. She can type anything.
export const ITEM_SUGGESTIONS = [
  "Bronze package", "Silver package", "Gold package", "Set-up charge", ...MENU.extras,
];
