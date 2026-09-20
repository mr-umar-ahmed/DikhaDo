package com.theek.app.ui.record

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.theek.app.ui.theme.CoordinateStyle
import com.theek.app.ui.theme.NotoTelugu
import com.theek.app.ui.theme.PlexDevanagari
import com.theek.app.ui.theme.RecordTheme
import com.theek.app.ui.theme.SerialStyle
import com.theek.app.ui.theme.TheekColors

/**
 * Phase 0 placeholder for the record world: proves paper, rules, mono serial, the rail
 * stamps and the Indic faces render. Phase 2 replaces the sample content with a real ticket.
 */
@Composable
fun RecordScreen() = RecordTheme {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .systemBarsPadding()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            // Where the frozen frame tucks in.
            Box(Modifier.size(64.dp).border(1.dp, MaterialTheme.colorScheme.outline))
            Column(Modifier.padding(start = 14.dp)) {
                Text("THK-2026-000000", style = SerialStyle, color = MaterialTheme.colorScheme.onBackground)
                Text("17.38500, 78.48670", style = CoordinateStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        HorizontalDivider(thickness = 2.dp, color = MaterialTheme.colorScheme.onBackground)

        Text("Sample record", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
        Text(
            "Scaffold check for the paper world. A real grievance renders here in Phase 2.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        Text(
            "कचरे का ढेर सड़क के किनारे पड़ा है।",
            style = MaterialTheme.typography.bodyLarge.copy(fontFamily = PlexDevanagari),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            "రోడ్డు పక్కన చెత్త కుప్ప పడి ఉంది.",
            style = MaterialTheme.typography.bodyLarge.copy(fontFamily = NotoTelugu),
            color = MaterialTheme.colorScheme.onBackground,
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(top = 8.dp)) {
            Stamp("SANITATION", TheekColors.StampIndigo)
            Stamp("ELECTRICIAN", TheekColors.WorklightAmber)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Stamp("VERIFIED", TheekColors.StampGreen)
            Stamp("SLA BREACH", TheekColors.RegisterRed)
        }
    }
}

/** Caps are allowed here: the stamp is part of the paper document. */
@Composable
private fun Stamp(text: String, ink: Color) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = ink,
        modifier = Modifier
            .rotate(-6f)
            .border(2.dp, ink)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}
