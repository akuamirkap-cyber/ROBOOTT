/** Shared stadium dimensions so the crowd, stepped bowl and aisle lighting stay aligned. */
export const STAND_TIERS = 4;
export const ROWS_PER_TIER = 3;
export const STAND_INNER_RADIUS = 28; // seats move 4 m closer than the former 32 m inner bowl
export const STAND_TIER_SPACING = 8.0; // preserves the upper-bowl footprint and leaves clear tier access bands
export const STAND_ROW_SPACING = 2.0;
/** 1 m seat centres doubles the former 2 m spectator spacing without adding extra draw calls. */
export const SPECTATOR_SEAT_SPACING = 1.0;

export const standTierInnerRadius = (tier: number) => STAND_INNER_RADIUS + tier * STAND_TIER_SPACING;
export const standRowInnerRadius = (tier: number, row: number) => standTierInnerRadius(tier) + row * STAND_ROW_SPACING;
export const standRowHeight = (tier: number, row: number) => 0.4 + (tier * ROWS_PER_TIER + row + 1) * 0.85;
