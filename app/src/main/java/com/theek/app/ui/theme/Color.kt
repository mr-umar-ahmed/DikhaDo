package com.theek.app.ui.theme

import androidx.compose.ui.graphics.Color

/** Design tokens. Names match the design system; do not add colours here without a token name. */
object TheekColors {
    val LensInk = Color(0xFF0D0E0C)
    val LensSurface = Color(0xFF191B18)
    val FormPaper = Color(0xFFD9E2DE)
    val StampIndigo = Color(0xFF2C3E8F)
    val WorklightAmber = Color(0xFFC77A16)
    val StampGreen = Color(0xFF2F6B4F)
    val RegisterRed = Color(0xFFA82A22)

    // Derived neutrals: text on each world, and the ruled lines of the paper record.
    val OnLens = Color(0xFFE6E9E4)
    val OnLensMuted = Color(0xFF9A9F97)
    val OnPaper = Color(0xFF14171A)
    val OnPaperMuted = Color(0xFF4C5658)
    val PaperRule = Color(0xFF9FB0AB)
}
