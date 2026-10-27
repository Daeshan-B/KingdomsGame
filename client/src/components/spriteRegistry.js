// Shared sprite registry. Data modules call Object.assign(SPRITES, {...});
// PixelIcon reads from it. Kept separate to avoid a circular import between the
// renderer and the sprite data files.
export const SPRITES = {};
