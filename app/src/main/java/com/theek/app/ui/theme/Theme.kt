package com.theek.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LensScheme = darkColorScheme(
    background = TheekColors.LensInk,
    surface = TheekColors.LensSurface,
    onBackground = TheekColors.OnLens,
    onSurface = TheekColors.OnLens,
    onSurfaceVariant = TheekColors.OnLensMuted,
    primary = TheekColors.OnLens,
    onPrimary = TheekColors.LensInk,
    tertiary = TheekColors.StampGreen,
    error = TheekColors.RegisterRed,
)

private val RecordScheme = lightColorScheme(
    background = TheekColors.FormPaper,
    surface = TheekColors.FormPaper,
    onBackground = TheekColors.OnPaper,
    onSurface = TheekColors.OnPaper,
    onSurfaceVariant = TheekColors.OnPaperMuted,
    outline = TheekColors.PaperRule,
    primary = TheekColors.StampIndigo,
    secondary = TheekColors.WorklightAmber,
    tertiary = TheekColors.StampGreen,
    error = TheekColors.RegisterRed,
)

/** The lens: dark, near-monochrome, zero chrome. */
@Composable
fun LensTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = LensScheme, typography = TheekTypography, content = content)

/** The record: pale form-paper. */
@Composable
fun RecordTheme(content: @Composable () -> Unit) =
    MaterialTheme(colorScheme = RecordScheme, typography = TheekTypography, content = content)
