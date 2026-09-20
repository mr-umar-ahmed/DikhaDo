package com.theek.app.ui.lens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.theek.app.BuildConfig
import com.theek.app.nav.Routes
import com.theek.app.ui.theme.LensTheme
import com.theek.app.ui.theme.TheekColors

/**
 * Phase 0 placeholder for the lens world. Phase 1 replaces the ink fill with the CameraX
 * viewfinder and makes the shutter live. The scaffold links exist in debug builds only.
 */
@Composable
fun LensScreen(onOpen: (String) -> Unit) = LensTheme {
    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .systemBarsPadding()
    ) {
        OfflineBadge(Modifier.align(Alignment.TopStart).padding(16.dp))

        Column(Modifier.align(Alignment.Center).padding(32.dp)) {
            Text("Theek", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.onBackground)
            Text(
                "Point it. Get it theek.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (BuildConfig.DEBUG) {
                Row(Modifier.padding(top = 32.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ScaffoldLink("Record") { onOpen(Routes.RECORD) }
                    ScaffoldLink("Queue") { onOpen(Routes.QUEUE) }
                    ScaffoldLink("Verify") { onOpen(Routes.VERIFY) }
                }
            }
        }

        // Shutter outline only: it becomes a button in Phase 1, when it does something.
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 40.dp)
                .size(76.dp)
                .border(3.dp, TheekColors.OnLensMuted, CircleShape)
        )
    }
}

@Composable
private fun OfflineBadge(modifier: Modifier = Modifier) {
    Text(
        "Works offline",
        style = MaterialTheme.typography.labelSmall,
        color = TheekColors.OnLens,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(TheekColors.StampGreen)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun ScaffoldLink(label: String, onClick: () -> Unit) {
    Text(
        label,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    )
}
