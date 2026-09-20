package com.theek.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.theek.app.R

// All fonts are bundled: downloadable fonts need a network, and Theek must not.
val PlexSans = FontFamily(
    Font(R.font.plex_sans_regular, FontWeight.Normal),
    Font(R.font.plex_sans_medium, FontWeight.Medium),
    Font(R.font.plex_sans_semibold, FontWeight.SemiBold),
)

val PlexDevanagari = FontFamily(
    Font(R.font.plex_deva_regular, FontWeight.Normal),
    Font(R.font.plex_deva_semibold, FontWeight.SemiBold),
)

@OptIn(ExperimentalTextApi::class)
val NotoTelugu = FontFamily(
    Font(R.font.noto_telugu, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.noto_telugu, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
)

/** Ticket serials and coordinates only. */
val PlexMono = FontFamily(
    Font(R.font.plex_mono_regular, FontWeight.Normal),
    Font(R.font.plex_mono_medium, FontWeight.Medium),
)

/** Compose does not fall back per glyph across bundled families, so Indic text picks its family by language tag. */
fun fontFamilyFor(languageTag: String): FontFamily = when (languageTag.substringBefore("-").lowercase()) {
    "hi", "mr" -> PlexDevanagari
    "te" -> NotoTelugu
    else -> PlexSans
}

val TheekTypography = Typography(
    displaySmall = TextStyle(fontFamily = PlexSans, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 38.sp),
    headlineSmall = TextStyle(fontFamily = PlexSans, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = PlexSans, fontWeight = FontWeight.Medium, fontSize = 17.sp, lineHeight = 24.sp),
    bodyLarge = TextStyle(fontFamily = PlexSans, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = PlexSans, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = PlexSans, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp),
    labelSmall = TextStyle(fontFamily = PlexSans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

val SerialStyle = TextStyle(fontFamily = PlexMono, fontWeight = FontWeight.Medium, fontSize = 15.sp, letterSpacing = 0.5.sp)
val CoordinateStyle = TextStyle(fontFamily = PlexMono, fontWeight = FontWeight.Normal, fontSize = 13.sp)
