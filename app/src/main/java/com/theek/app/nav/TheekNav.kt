package com.theek.app.nav

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.theek.app.ui.lens.LensScreen
import com.theek.app.ui.queue.QueueScreen
import com.theek.app.ui.record.RecordScreen
import com.theek.app.ui.verify.VerifyScreen

object Routes {
    const val LENS = "lens"
    const val RECORD = "record"
    const val QUEUE = "queue"
    const val VERIFY = "verify"
}

@Composable
fun TheekNavHost() {
    val nav = rememberNavController()
    // The app opens on the lens. There is no home screen.
    NavHost(navController = nav, startDestination = Routes.LENS) {
        composable(Routes.LENS) { LensScreen(onOpen = { nav.navigate(it) }) }
        composable(Routes.RECORD) { RecordScreen() }
        composable(Routes.QUEUE) { QueueScreen() }
        composable(Routes.VERIFY) { VerifyScreen() }
    }
}
