/** Shared skeleton dimensions (robot-local units). The IK and the model builders both depend on these. */
export const L1 = 2.0; // hip -> knee   (long, athletic boxer/sprinter legs)
export const L2 = 1.92; // knee -> ankle
export const HIP_Y = 2.85; // hip joint height, in pelvis space
export const UP = 0.71; // upper-body pivot offset in body space (preserves floor get-up hand-plant geometry)
export const CY = 0.35; // chest origin above the waist origin
