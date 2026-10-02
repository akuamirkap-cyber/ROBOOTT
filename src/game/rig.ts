/** Shared skeleton dimensions (robot-local units). The IK and the model builders both depend on these. */
export const L1 = 1.85; // hip -> knee   (long, athletic legs)
export const L2 = 1.78; // knee -> ankle
export const HIP_Y = 2.85; // hip joint height, in pelvis space
export const UP = L1 + L2 - 2.92; // the whole upper body is lifted by this much (2.92 = the old leg length)
export const CY = 0.35; // chest origin above the waist origin
